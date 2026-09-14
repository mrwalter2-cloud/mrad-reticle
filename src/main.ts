import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import {
  applyZoom,
  defaultZoom,
  formatZoomLabel,
  startCamera,
  stopStream,
  type ZoomState,
} from './camera';
import {
  formatMrad,
  hypotPx,
  metersToCm,
  metersToInches,
  mradToMoa,
  pxPerMradAt1x,
  pxToMrad,
  sceneToScreen,
  screenToScene,
  sizeAtRangeM,
  toMetersDist,
  validateCalSpan,
  validateCalibrationInputs,
  type DistUnit,
  type Point,
  type SizeUnit,
} from './math';
import { drawPickOverlay, drawReticle } from './reticle';
import {
  DEFAULT_PREFS,
  deleteProfile,
  listProfiles,
  loadStore,
  newProfileId,
  savePrefs,
  setActiveProfile,
  upsertProfile,
  type CalProfile,
  type FacingMode,
  type Store,
} from './storage';

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

const cam = $<HTMLVideoElement>('cam');
const canvas = $<HTMLCanvasElement>('reticle');
const ctxOrNull = canvas.getContext('2d');
if (!ctxOrNull) throw new Error('Canvas 2D unavailable');
const ctx: CanvasRenderingContext2D = ctxOrNull;

const state = {
  demo: false,
  stream: null as MediaStream | null,
  facingMode: 'environment' as FacingMode,
  zoom: defaultZoom(),
  pxPerMrad: null as number | null,
  profileName: '',
  profileId: null as string | null,
  pickMode: null as 'cal' | 'meas' | null,
  pickPts: [] as Point[],
  measPts: null as [Point, Point] | null,
  wakeLock: null as WakeLockSentinel | null,
  wantWake: false,
  calStep: 1,
  lastCal: null as {
    pxPerMrad: number;
    spanPx: number;
    mrad: number;
    zoom: number;
  } | null,
};

let store: Store = loadStore();

function prefs() {
  return store.prefs ?? DEFAULT_PREFS;
}

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function effectivePpm(): number | null {
  if (!state.pxPerMrad) return null;
  return state.pxPerMrad * state.zoom.value;
}

function draw(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);
  const p = prefs();
  drawReticle(ctx, w / 2, h / 2, effectivePpm(), {
    style: p.style,
    color: p.color,
    opacity: p.opacity,
    major: p.major,
    calibrated: !!state.pxPerMrad,
  });
  const cx = w / 2;
  const cy = h / 2;
  const z = state.zoom.value;
  if (state.pickPts.length) drawPickOverlay(ctx, state.pickPts.map((p) => sceneToScreen(p, z, cx, cy)));
  if (state.measPts) drawPickOverlay(ctx, state.measPts.map((p) => sceneToScreen(p, z, cx, cy)));
}

function updateCalChip(): void {
  const chip = $('calChip');
  const banner = $('uncalBanner');
  if (state.pxPerMrad) {
    const name = state.profileName || 'Calibrated';
    chip.textContent = `${name} · ${state.pxPerMrad.toFixed(2)} px/mrad@1×`;
    chip.classList.remove('warn');
    chip.classList.add('ok');
    banner.classList.add('hidden');
    banner.textContent = 'Reticle is visual only until you calibrate. Tap Calibrate.';
  } else {
    chip.textContent = 'Not calibrated';
    chip.classList.add('warn');
    chip.classList.remove('ok');
    banner.textContent = 'Reticle is visual only until you calibrate. Tap Calibrate.';
    banner.classList.remove('hidden');
  }
}

function updateZoomUi(): void {
  const slider = $<HTMLInputElement>('zoom');
  slider.min = String(state.zoom.min);
  slider.max = String(state.zoom.max);
  slider.value = String(state.zoom.value);
  $('zoomLabel').textContent = formatZoomLabel(state.zoom);
}

async function setZoom(value: number): Promise<void> {
  const z: ZoomState = {
    ...state.zoom,
    value: Math.min(state.zoom.max, Math.max(state.zoom.min, value)),
  };
  if (state.demo) {
    z.kind = 'digital';
    state.zoom = z;
    $('scene').style.transform = `scale(${z.value})`;
    $('scene').style.transformOrigin = 'center center';
    cam.style.transform = 'none';
  } else {
    state.zoom = await applyZoom(cam, state.stream, z);
    $('scene').style.transform = 'none';
  }
  updateZoomUi();
  draw();
  updateMeasure();
}

function calInputs() {
  return {
    size: parseFloat($<HTMLInputElement>('knownSize').value),
    sizeUnit: $<HTMLSelectElement>('sizeUnit').value as SizeUnit,
    dist: parseFloat($<HTMLInputElement>('knownDist').value),
    distUnit: $<HTMLSelectElement>('distUnit').value as DistUnit,
  };
}

function updateExpected(): void {
  const v = validateCalibrationInputs(calInputs());
  const el = $('calExpected');
  const err = $('calStep1Err');
  if (!v.ok) {
    el.textContent = 'Expected angular size: —';
    err.textContent = v.errors[0] ?? '';
    err.classList.toggle('hidden', !v.errors.length);
    return;
  }
  err.classList.add('hidden');
  el.textContent = `Expected angular size: ${v.mrad.toFixed(3)} mrad`;
}

function setCalStep(step: number): void {
  state.calStep = step;
  $('cal-step-1').classList.toggle('hidden', step !== 1);
  $('cal-step-2').classList.toggle('hidden', step !== 2);
  $('cal-step-3').classList.toggle('hidden', step !== 3);
  $('stepInd1').className = step === 1 ? 'on' : 'done';
  $('stepInd2').className = step === 2 ? 'on' : step > 2 ? 'done' : '';
  $('stepInd3').className = step === 3 ? 'on' : '';
}

function hideSheets(): void {
  document.querySelectorAll('.sheet').forEach((s) => s.classList.add('hidden'));
}

function openPanel(id: string): void {
  hideSheets();
  $(`panel-${id}`).classList.remove('hidden');
}

function setPickMode(mode: 'cal' | 'meas' | null): void {
  state.pickMode = mode;
  state.pickPts = [];
  canvas.classList.toggle('picking', !!mode);
  const banner = $('pickBanner');
  banner.classList.toggle('hidden', !mode);
  if (mode === 'cal') {
    $('pickHint').textContent = 'Tap the TOP of the known height (1 of 2)';
    hideSheets();
  } else if (mode === 'meas') {
    $('pickHint').textContent = 'Tap the first edge (1 of 2)';
    hideSheets();
  }
  draw();
}

function finishCalibration(pts: [Point, Point]): void {
  const v = validateCalibrationInputs(calInputs());
  const spanScene = hypotPx(pts[0], pts[1]);
  const spanScreen = spanScene * state.zoom.value;
  const spanErr = validateCalSpan(spanScreen);
  const err = $('calStep3Err');
  if (!v.ok || spanErr) {
    err.textContent = spanErr ?? v.errors[0] ?? 'Calibration failed';
    err.classList.remove('hidden');
    openPanel('cal');
    setCalStep(2);
    return;
  }
  const ppm1x = pxPerMradAt1x(spanScreen, v.mrad, state.zoom.value);
  if (!(ppm1x > 0)) {
    err.textContent = 'Could not compute px/mrad. Try again.';
    err.classList.remove('hidden');
    openPanel('cal');
    setCalStep(2);
    return;
  }
  err.classList.add('hidden');
  state.pxPerMrad = ppm1x;
  state.lastCal = { pxPerMrad: ppm1x, spanPx: spanScreen, mrad: v.mrad, zoom: state.zoom.value };
  const facing = state.facingMode === 'environment' ? 'rear' : 'front';
  if (!$<HTMLInputElement>('calName').value.trim()) {
    $<HTMLInputElement>('calName').value = `${facing} · ${state.zoom.value.toFixed(2)}×`;
  }
  $('calMath').textContent =
    `Span ${spanScreen.toFixed(1)} px over ${v.mrad.toFixed(3)} mrad at ${state.zoom.value.toFixed(2)}× → ` +
    `${ppm1x.toFixed(3)} px/mrad at 1×. Reticle and measure scale with zoom (FFP).`;
  updateCalChip();
  updateMeasure();
  draw();
  openPanel('cal');
  setCalStep(3);
}

function updateMeasure(): void {
  const out = $('measOut');
  const delta = $('deltaLabel');
  const pts = state.measPts;
  if (!pts) {
    out.textContent = '—';
    delta.textContent = 'Δ —';
    return;
  }
  const spanScene = hypotPx(pts[0], pts[1]);
  const spanScreen = spanScene * state.zoom.value;
  if (!state.pxPerMrad) {
    out.textContent = 'Calibrate first for real mrad.\nCurrent span is pixels only.';
    delta.textContent = `Δ ${spanScreen.toFixed(0)} px`;
    return;
  }
  const mrad = pxToMrad(spanScreen, state.pxPerMrad, state.zoom.value);
  const rangeVal = parseFloat($<HTMLInputElement>('measRange').value);
  const rangeUnit = $<HTMLSelectElement>('measRangeUnit').value as DistUnit;
  const showMoa = $<HTMLInputElement>('showMoa').checked;
  let text = `Δ ${formatMrad(mrad)} mrad`;
  if (showMoa) text += `  ·  ${formatMrad(mradToMoa(mrad))} MOA`;
  if (rangeVal > 0) {
    const sizeM = sizeAtRangeM(mrad, toMetersDist(rangeVal, rangeUnit));
    text += `\n≈ ${metersToInches(sizeM).toFixed(2)} in  ·  ${metersToCm(sizeM).toFixed(1)} cm`;
    text += `\nat ${rangeVal} ${rangeUnit === 'yd' ? 'yd' : 'm'}`;
  } else {
    text += '\nEnter a range to estimate size.';
  }
  out.textContent = text;
  delta.textContent = `Δ ${formatMrad(mrad)} mrad`;
}

function applyProfile(p: CalProfile): void {
  state.pxPerMrad = p.pxPerMrad;
  state.profileName = p.name;
  state.profileId = p.id;
  store = setActiveProfile(store, p.id);
  updateCalChip();
  updateMeasure();
  draw();
  renderProfiles();
  if (!state.demo && p.facingMode !== state.facingMode) {
    $('uncalBanner').textContent =
      'This profile was saved for the other camera. Flip back or recalibrate.';
    $('uncalBanner').classList.remove('hidden');
  }
}

function renderProfiles(): void {
  const list = $('profileList');
  const empty = $('profileEmpty');
  list.replaceChildren();
  const profiles = listProfiles(store);
  empty.classList.toggle('hidden', profiles.length > 0);
  for (const p of profiles) {
    const li = document.createElement('li');
    li.className = 'profile' + (p.id === state.profileId ? ' active' : '');
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = p.name;
    const sub = document.createElement('div');
    sub.className = 'sub';
    const when = new Date(p.updatedAt).toLocaleDateString();
    sub.textContent = `${p.pxPerMrad.toFixed(2)} px/mrad@1× · ${p.facingMode === 'environment' ? 'rear' : 'front'} · ${when}`;
    meta.append(name, sub);
    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.textContent = p.id === state.profileId ? 'Loaded' : 'Load';
    loadBtn.onclick = () => applyProfile(p);
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'danger';
    delBtn.textContent = 'Delete';
    delBtn.onclick = () => {
      if (!confirm(`Delete profile “${p.name}”?`)) return;
      store = deleteProfile(store, p.id);
      if (state.profileId === p.id) {
        state.profileId = null;
        state.profileName = '';
        state.pxPerMrad = null;
        updateCalChip();
        updateMeasure();
        draw();
      }
      renderProfiles();
    };
    li.append(meta, loadBtn, delBtn);
    list.append(li);
  }
}

function restoreActiveProfile(): void {
  if (!store.activeProfileId) return;
  const p = store.profiles[store.activeProfileId];
  if (p) applyProfile(p);
}

function applyPrefsToForm(): void {
  const p = prefs();
  $<HTMLSelectElement>('retStyle').value = p.style;
  $<HTMLSelectElement>('retColor').value = p.color;
  $<HTMLInputElement>('retOpacity').value = String(p.opacity);
  $<HTMLSelectElement>('majorMrad').value = String(p.major);
  $<HTMLInputElement>('showMoa').checked = p.showMoa;
}

function showApp(): void {
  $('gate').classList.add('hidden');
  $('hud').classList.remove('hidden');
  restoreActiveProfile();
  applyPrefsToForm();
  renderProfiles();
  updateExpected();
  updateCalChip();
  updateZoomUi();
  resize();
  void setZoom(state.zoom.value);
}

function sizeDemoPlate(): void {
  const v = validateCalibrationInputs({ size: 12, sizeUnit: 'in', dist: 100, distUnit: 'yd' });
  const ppm = 40;
  const h = v.mrad * ppm;
  const plate = $('demoPlate');
  plate.style.height = `${h}px`;
  plate.style.width = `${Math.max(28, h * 0.38)}px`;
}

async function startDemo(): Promise<void> {
  state.demo = true;
  cam.removeAttribute('srcObject');
  cam.style.display = 'none';
  $('demoScene').classList.remove('hidden');
  sizeDemoPlate();
  state.pxPerMrad = 40;
  state.profileName = 'Demo';
  state.profileId = null;
  state.zoom = defaultZoom();
}

async function startLive(): Promise<void> {
  state.demo = false;
  cam.style.display = '';
  $('demoScene').classList.add('hidden');
  stopStream(state.stream);
  const started = await startCamera(cam, state.facingMode);
  state.stream = started.stream;
  state.zoom = started.zoom;
}

async function requestWake(): Promise<void> {
  if (!state.wantWake) return;
  try {
    if (!('wakeLock' in navigator)) return;
    state.wakeLock = await navigator.wakeLock.request('screen');
    $('btnWake').classList.add('on');
    state.wakeLock.addEventListener('release', () => {
      if (!state.wantWake) $('btnWake').classList.remove('on');
    });
  } catch {
    /* iOS may deny until a gesture; user can tap again */
  }
}

$('btnStart').onclick = async () => {
  try {
    await startLive();
    showApp();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alert(`Camera blocked or unavailable: ${msg}\nUse Demo mode, or allow camera in Settings → Safari.`);
  }
};

$('btnDemo').onclick = async () => {
  await startDemo();
  showApp();
};

$<HTMLInputElement>('zoom').oninput = (e) => {
  void setZoom(parseFloat((e.target as HTMLInputElement).value));
};
$('btnZoomIn').onclick = () => void setZoom(state.zoom.value + 0.25);
$('btnZoomOut').onclick = () => void setZoom(state.zoom.value - 0.25);

document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((btn) => {
  btn.onclick = () => openPanel(btn.dataset.panel ?? '');
});
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((btn) => {
  btn.onclick = () => btn.closest('.sheet')?.classList.add('hidden');
});

$('calChip').onclick = () => openPanel('cal');
$('uncalBanner').onclick = () => openPanel('cal');

$('knownSize').oninput = updateExpected;
$('knownDist').oninput = updateExpected;
$('sizeUnit').onchange = updateExpected;
$('distUnit').onchange = updateExpected;

$('btnCalNext').onclick = () => {
  const v = validateCalibrationInputs(calInputs());
  const err = $('calStep1Err');
  if (!v.ok) {
    err.textContent = v.errors[0] ?? 'Check size and distance.';
    err.classList.remove('hidden');
    return;
  }
  err.classList.add('hidden');
  setCalStep(2);
};

$('btnCalBack').onclick = () => setCalStep(1);
$('btnCalPick').onclick = () => setPickMode('cal');
$('btnCalRedo').onclick = () => {
  setCalStep(2);
  setPickMode('cal');
};

$('btnCalSave').onclick = () => {
  if (!state.pxPerMrad) return;
  const name = $<HTMLInputElement>('calName').value.trim() || 'Default';
  const input = calInputs();
  const profile: CalProfile = {
    id: state.profileId && store.profiles[state.profileId] ? state.profileId : newProfileId(),
    name,
    pxPerMrad: state.pxPerMrad,
    zoomWhenCalibrated: state.lastCal?.zoom ?? state.zoom.value,
    facingMode: state.facingMode,
    knownSize: input.size,
    sizeUnit: input.sizeUnit,
    knownDist: input.dist,
    distUnit: input.distUnit,
    createdAt: store.profiles[state.profileId ?? '']?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  store = upsertProfile(store, profile);
  state.profileId = profile.id;
  state.profileName = profile.name;
  updateCalChip();
  renderProfiles();
  hideSheets();
};

$('btnCalUseUnsaved').onclick = () => {
  state.profileName = 'Unsaved';
  state.profileId = null;
  store = setActiveProfile(store, null);
  updateCalChip();
  hideSheets();
};

$('btnMeasPick').onclick = () => setPickMode('meas');
$('btnMeasClear').onclick = () => {
  state.measPts = null;
  updateMeasure();
  draw();
};
$('measRange').oninput = updateMeasure;
$('measRangeUnit').onchange = updateMeasure;
$('showMoa').onchange = () => {
  store = savePrefs(store, { showMoa: $<HTMLInputElement>('showMoa').checked });
  updateMeasure();
};

$('retStyle').onchange = () => {
  store = savePrefs(store, { style: $<HTMLSelectElement>('retStyle').value as typeof store.prefs.style });
  draw();
};
$('retColor').onchange = () => {
  store = savePrefs(store, { color: $<HTMLSelectElement>('retColor').value });
  draw();
};
$('retOpacity').oninput = () => {
  store = savePrefs(store, { opacity: parseFloat($<HTMLInputElement>('retOpacity').value) });
  draw();
};
$('majorMrad').onchange = () => {
  store = savePrefs(store, { major: parseFloat($<HTMLSelectElement>('majorMrad').value) || 1 });
  draw();
};

$('btnFlip').onclick = async () => {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  if (!state.demo) {
    try {
      await startLive();
      await setZoom(state.zoom.value);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }
};

$('btnWake').onclick = async () => {
  if (state.wantWake && state.wakeLock) {
    state.wantWake = false;
    await state.wakeLock.release().catch(() => undefined);
    state.wakeLock = null;
    $('btnWake').classList.remove('on');
    return;
  }
  if (!('wakeLock' in navigator)) {
    alert('Wake Lock is not supported in this browser. Keep the phone plugged in or disable Auto-Lock in Settings.');
    return;
  }
  state.wantWake = true;
  await requestWake();
};

$('btnPickUndo').onclick = () => {
  state.pickPts.pop();
  const n = state.pickPts.length;
  if (state.pickMode === 'cal') {
    $('pickHint').textContent = n ? 'Tap the BOTTOM of the known height (2 of 2)' : 'Tap the TOP of the known height (1 of 2)';
  } else {
    $('pickHint').textContent = n ? 'Tap the second edge (2 of 2)' : 'Tap the first edge (1 of 2)';
  }
  draw();
};

$('btnPickCancel').onclick = () => {
  const was = state.pickMode;
  setPickMode(null);
  if (was === 'cal') {
    openPanel('cal');
    setCalStep(2);
  }
};

canvas.addEventListener('pointerdown', (e) => {
  if (!state.pickMode) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const pt = screenToScene(
    e.clientX - rect.left,
    e.clientY - rect.top,
    state.zoom.value,
    window.innerWidth / 2,
    window.innerHeight / 2,
  );
  state.pickPts.push(pt);
  draw();
  if (state.pickPts.length === 1) {
    $('pickHint').textContent =
      state.pickMode === 'cal'
        ? 'Tap the BOTTOM of the known height (2 of 2)'
        : 'Tap the second edge (2 of 2)';
    return;
  }
  const pts = [state.pickPts[0], state.pickPts[1]] as [Point, Point];
  const mode = state.pickMode;
  setPickMode(null);
  if (mode === 'cal') finishCalibration(pts);
  if (mode === 'meas') {
    state.measPts = pts;
    updateMeasure();
    draw();
    openPanel('measure');
  }
});

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => {
  state.pickPts = [];
  state.measPts = null;
  setPickMode(null);
  updateMeasure();
  setTimeout(resize, 250);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void requestWake();
});

try {
  registerSW({ immediate: true });
} catch {
  /* dev without plugin virtual module still type-checks via reference */
}

updateExpected();
resize();
