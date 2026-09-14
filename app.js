(() => {
  const $ = (id) => document.getElementById(id);
  const cam = $('cam');
  const canvas = $('reticle');
  const ctx = canvas.getContext('2d');

  const state = {
    demo: false,
    stream: null,
    facingMode: 'environment',
    zoom: 1,
    pxPerMrad: null, // at zoom=1; scales with zoom for FFP
    calName: 'Default',
    style: 'hash',
    color: '#ff2a2a',
    opacity: 0.9,
    major: 1,
    showMoa: false,
    pickMode: null, // 'cal' | 'meas' | null
    pickPts: [],
    measPts: null,
    wakeLock: null,
  };

  const LS_KEY = 'mrad-reticle-v1';

  function loadStore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { profiles: {} };
      return JSON.parse(raw);
    } catch { return { profiles: {} }; }
  }
  function saveStore(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function applyVideoZoom() {
    // Digital zoom of the video element (FFP: reticle scales with same factor)
    const z = state.zoom;
    cam.style.transform = `scale(${z})`;
    cam.style.transformOrigin = 'center center';
    $('zoomLabel').textContent = `Zoom ${z.toFixed(2)}×`;
    draw();
  }

  function effectivePxPerMrad() {
    if (!state.pxPerMrad) return null;
    return state.pxPerMrad * state.zoom;
  }

  function drawReticle(cx, cy, ppm) {
    ctx.save();
    ctx.globalAlpha = state.opacity;
    ctx.strokeStyle = state.color;
    ctx.fillStyle = state.color;
    ctx.lineWidth = 1.25;
    ctx.lineCap = 'round';

    const maxR = Math.min(cx, cy) * 0.92;
    const major = state.major; // mrad
    // If uncalibrated, invent a visual scale so UI still looks like a scope (~48px/mrad)
    const scale = ppm || 48;

    // Main cross
    ctx.beginPath();
    ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
    ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
    ctx.stroke();

    const drawTick = (x1, y1, x2, y2, w) => {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.lineWidth = 1.25;
    };

    const label = (text, x, y, align='center') => {
      ctx.font = '600 11px -apple-system,system-ui,sans-serif';
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      // halo
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 3;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = state.color;
      ctx.fillText(text, x, y);
      ctx.strokeStyle = state.color;
      ctx.lineWidth = 1.25;
    };

    const maxMil = Math.floor(maxR / scale);
    for (let m = 0.1; m <= maxMil + 0.001; m = Math.round((m + 0.1) * 10) / 10) {
      const d = m * scale;
      const isMajor = Math.abs(m % major) < 0.001 || Math.abs(m % major - major) < 0.001;
      const isHalf = Math.abs(m % 0.5) < 0.001;
      let len = isMajor ? 14 : isHalf ? 9 : 5;

      if (state.style === 'mildot' && isMajor) {
        // dots on cross
        for (const [dx, dy] of [[d,0],[-d,0],[0,d],[0,-d]]) {
          ctx.beginPath();
          ctx.arc(cx + dx, cy + dy, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // horizontal ticks
        drawTick(cx + d, cy - len, cx + d, cy + len, isMajor ? 1.6 : 1);
        drawTick(cx - d, cy - len, cx - d, cy + len, isMajor ? 1.6 : 1);
        // vertical ticks
        drawTick(cx - len, cy + d, cx + len, cy + d, isMajor ? 1.6 : 1);
        drawTick(cx - len, cy - d, cx + len, cy - d, isMajor ? 1.6 : 1);
      }

      if (state.style === 'hash' && isMajor && m >= 1) {
        // holdover tree below center (windage hash marks)
        for (let w = 0.5; w <= Math.min(2, m); w += 0.5) {
          const hx = w * scale * 0.55;
          drawTick(cx - hx, cy + d, cx + hx, cy + d, 1);
        }
      }

      if (isMajor && m >= 1) {
        label(String(m), cx + d, cy - 22);
        label(String(m), cx - d, cy - 22);
        label(String(m), cx + 22, cy + d, 'left');
        label(String(m), cx + 22, cy - d, 'left');
      }
    }

    // center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPickOverlay(pts) {
    if (!pts.length) return;
    ctx.save();
    ctx.fillStyle = '#ffeb3b';
    ctx.strokeStyle = '#ffeb3b';
    ctx.lineWidth = 2;
    pts.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), p.x, p.y);
      ctx.fillStyle = '#ffeb3b';
    });
    if (pts.length === 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    drawReticle(cx, cy, effectivePxPerMrad());
    if (state.pickPts.length) drawPickOverlay(state.pickPts);
    if (state.measPts) drawPickOverlay(state.measPts);
  }

  function toMetersSize(v, unit) {
    return unit === 'cm' ? v / 100 : v * 0.0254;
  }
  function toMetersDist(v, unit) {
    return unit === 'm' ? v : v * 0.9144;
  }
  function sizeAtRange(mrad, rangeM) {
    // size = mrad * distance (mrad is milliradian: size = θ_mrad/1000 * R)
    return (mrad / 1000) * rangeM;
  }

  function updateCalLabel() {
    const el = $('calLabel');
    if (state.pxPerMrad) {
      el.textContent = `${state.calName} · ${state.pxPerMrad.toFixed(1)} px/mrad@1×`;
      el.style.color = '#8f8';
    } else {
      el.textContent = 'Uncalibrated (visual only)';
      el.style.color = '#fa5';
    }
  }

  function refreshProfiles() {
    const store = loadStore();
    const sel = $('calProfiles');
    sel.innerHTML = '<option value="">Profiles…</option>';
    Object.keys(store.profiles).forEach((name) => {
      const o = document.createElement('option');
      o.value = name; o.textContent = name;
      sel.appendChild(o);
    });
  }

  function finishCalibration(pts) {
    const sizeM = toMetersSize(parseFloat($('knownSize').value), $('sizeUnit').value);
    const distM = toMetersDist(parseFloat($('knownDist').value), $('distUnit').value);
    const px = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    // Angular size in mrad = 1000 * size / distance
    const mrad = 1000 * sizeM / distM;
    // Observed px span is at current zoom; normalize to zoom=1
    const ppmAtZoom = px / mrad;
    state.pxPerMrad = ppmAtZoom / state.zoom;
    $('calMath').textContent = `Span ${px.toFixed(1)}px over ${mrad.toFixed(3)} mrad → ${state.pxPerMrad.toFixed(2)} px/mrad at 1× (FFP scales with zoom).`;
    updateCalLabel();
    updateMeasure();
    draw();
  }

  function updateMeasure() {
    const pts = state.measPts;
    const out = $('measOut');
    const delta = $('deltaLabel');
    if (!pts || pts.length !== 2) {
      out.textContent = '—';
      delta.textContent = 'Δ —';
      return;
    }
    const px = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    const ppm = effectivePxPerMrad();
    if (!ppm) {
      out.textContent = 'Calibrate first for real mrad';
      delta.textContent = `Δ ${px.toFixed(0)} px`;
      return;
    }
    const mrad = px / ppm;
    const rangeM = toMetersDist(parseFloat($('measRange').value), $('measRangeUnit').value);
    const sizeM = sizeAtRange(mrad, rangeM);
    const sizeIn = sizeM / 0.0254;
    const sizeCm = sizeM * 100;
    let text = `Δ ${mrad.toFixed(2)} mrad`;
    if (state.showMoa) text += ` · ${(mrad * 3.43774677).toFixed(2)} MOA`;
    text += `\n≈ ${sizeIn.toFixed(2)} in · ${sizeCm.toFixed(1)} cm @ entered range`;
    out.textContent = text;
    delta.textContent = `Δ ${mrad.toFixed(2)} mrad`;
  }

  function setPickMode(mode) {
    state.pickMode = mode;
    state.pickPts = [];
    canvas.classList.toggle('picking', !!mode);
    draw();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!state.pickMode) return;
    const rect = canvas.getBoundingClientRect();
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    state.pickPts.push(pt);
    draw();
    if (state.pickPts.length >= 2) {
      const pts = state.pickPts.slice(0, 2);
      if (state.pickMode === 'cal') finishCalibration(pts);
      if (state.pickMode === 'meas') {
        state.measPts = pts;
        updateMeasure();
      }
      setPickMode(null);
    }
  });

  async function startCamera() {
    if (state.stream) state.stream.getTracks().forEach(t => t.stop());
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.stream = stream;
    cam.srcObject = stream;
    await cam.play();
    // Try native zoom if available
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities?.() || {};
    if (caps.zoom) {
      $('zoom').min = caps.min?.zoom || caps.zoom.min || 1;
      $('zoom').max = caps.max?.zoom || caps.zoom.max || 8;
      $('zoom').value = track.getSettings().zoom || 1;
      state.zoom = parseFloat($('zoom').value);
      // Prefer native zoom when present; still scale reticle via FFP using state.zoom relative to baseline
    }
    applyVideoZoom();
  }

  function startDemo() {
    state.demo = true;
    cam.removeAttribute('srcObject');
    cam.style.background = 'radial-gradient(circle at center, #333 0%, #111 60%, #000 100%)';
    // Fake a calibration so measure works out of the box in demo
    state.pxPerMrad = 40;
    state.calName = 'Demo';
    updateCalLabel();
  }

  function showApp() {
    $('gate').classList.add('hidden');
    $('hud').classList.remove('hidden');
    resize();
    applyVideoZoom();
    updateCalLabel();
    refreshProfiles();
  }

  $('btnStart').onclick = async () => {
    try {
      await startCamera();
      showApp();
    } catch (err) {
      alert('Camera blocked or unavailable: ' + (err.message || err) + '\nUse Demo mode, or allow camera in Safari settings.');
    }
  };
  $('btnDemo').onclick = () => { startDemo(); showApp(); };

  $('zoom').oninput = async (e) => {
    state.zoom = parseFloat(e.target.value);
    const track = state.stream?.getVideoTracks?.()[0];
    const caps = track?.getCapabilities?.() || {};
    if (caps.zoom) {
      try {
        await track.applyConstraints({ advanced: [{ zoom: state.zoom }] });
        // When native zoom works, CSS scale should be 1 — reticle uses relative zoom from calibration baseline
        cam.style.transform = 'none';
        $('zoomLabel').textContent = `Zoom ${state.zoom.toFixed(2)}× (native)`;
        // For native zoom, treat pxPerMrad as calibrated at that zoom's optical path:
        // FFP: store ppm at 1× equivalent using ratio to slider min
        draw();
        updateMeasure();
        return;
      } catch {}
    }
    applyVideoZoom();
    updateMeasure();
  };
  $('btnZoomIn').onclick = () => {
    const z = Math.min(parseFloat($('zoom').max), state.zoom + 0.25);
    $('zoom').value = z; $('zoom').dispatchEvent(new Event('input'));
  };
  $('btnZoomOut').onclick = () => {
    const z = Math.max(parseFloat($('zoom').min), state.zoom - 0.25);
    $('zoom').value = z; $('zoom').dispatchEvent(new Event('input'));
  };

  document.querySelectorAll('[data-panel]').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.sheet').forEach(s => s.classList.add('hidden'));
      $(`panel-${btn.dataset.panel}`).classList.remove('hidden');
    };
  });
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.onclick = () => btn.closest('.sheet').classList.add('hidden');
  });

  $('btnCalPick').onclick = () => setPickMode('cal');
  $('btnCalSave').onclick = () => {
    if (!state.pxPerMrad) { alert('Calibrate first'); return; }
    const name = ($('calName').value || 'Default').trim();
    state.calName = name;
    const store = loadStore();
    store.profiles[name] = { pxPerMrad: state.pxPerMrad, zoomWhenSaved: state.zoom, ts: Date.now() };
    saveStore(store);
    refreshProfiles();
    updateCalLabel();
  };
  $('calProfiles').onchange = (e) => {
    const name = e.target.value;
    const p = loadStore().profiles[name];
    if (!p) return;
    state.calName = name;
    state.pxPerMrad = p.pxPerMrad;
    $('calName').value = name;
    updateCalLabel();
    updateMeasure();
    draw();
  };

  $('btnMeasPick').onclick = () => setPickMode('meas');
  $('btnMeasClear').onclick = () => { state.measPts = null; updateMeasure(); draw(); };
  $('measRange').oninput = updateMeasure;
  $('measRangeUnit').onchange = updateMeasure;

  $('retStyle').onchange = (e) => { state.style = e.target.value; draw(); };
  $('retColor').onchange = (e) => { state.color = e.target.value; draw(); };
  $('retOpacity').oninput = (e) => { state.opacity = parseFloat(e.target.value); draw(); };
  $('majorMrad').onchange = (e) => { state.major = parseFloat(e.target.value) || 1; draw(); };
  $('showMoa').onchange = (e) => { state.showMoa = e.target.checked; updateMeasure(); };

  $('btnFlip').onclick = async () => {
    state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
    if (!state.demo) {
      try { await startCamera(); } catch (e) { alert(e.message || e); }
    }
  };

  $('btnWake').onclick = async () => {
    const btn = $('btnWake');
    try {
      if (state.wakeLock) {
        await state.wakeLock.release();
        state.wakeLock = null;
        btn.classList.remove('on');
        return;
      }
      if ('wakeLock' in navigator) {
        state.wakeLock = await navigator.wakeLock.request('screen');
        btn.classList.add('on');
        state.wakeLock.addEventListener('release', () => btn.classList.remove('on'));
      } else {
        alert('Wake Lock not supported in this browser');
      }
    } catch (e) { alert('Wake Lock failed: ' + (e.message || e)); }
  };

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  resize();
})();
