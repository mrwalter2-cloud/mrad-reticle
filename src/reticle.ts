import type { ReticleStyle } from './storage';

export interface Point {
  x: number;
  y: number;
}

export interface ReticleOptions {
  style: ReticleStyle;
  color: string;
  opacity: number;
  major: number;
  calibrated: boolean;
}

const UNCAL_VISUAL_PPM = 36;

function drawTick(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
) {
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: CanvasTextAlign = 'center',
) {
  ctx.save();
  ctx.font = '600 11px -apple-system, system-ui, sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 3.5;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawReticle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ppm: number | null,
  opt: ReticleOptions,
): void {
  ctx.save();
  ctx.globalAlpha = opt.opacity;
  ctx.strokeStyle = opt.color;
  ctx.fillStyle = opt.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const scale = ppm && ppm > 0 ? ppm : UNCAL_VISUAL_PPM;
  const maxR = Math.min(cx, cy) * 0.9;
  const maxMil = Math.min(12, Math.floor(maxR / scale));
  const major = opt.major > 0 ? opt.major : 1;

  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(cx - maxR, cy);
  ctx.lineTo(cx + maxR, cy);
  ctx.moveTo(cx, cy - maxR);
  ctx.lineTo(cx, cy + maxR);
  ctx.stroke();

  const step = 0.2;
  for (let m = step; m <= maxMil + 0.001; m = Math.round((m + step) * 10) / 10) {
    const d = m * scale;
    const isMajor = nearlyMultiple(m, major);
    const isHalf = nearlyMultiple(m, 0.5);
    const isTwoTenths = nearlyMultiple(m, 0.2);

    if (opt.style === 'mildot' && isMajor) {
      const r = Math.max(2.2, Math.min(3.4, scale * 0.09));
      for (const [dx, dy] of [
        [d, 0],
        [-d, 0],
        [0, d],
        [0, -d],
      ] as const) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      let len = 5;
      let w = 1;
      if (isMajor) {
        len = 16;
        w = 1.7;
      } else if (isHalf) {
        len = 10;
        w = 1.25;
      } else if (isTwoTenths) {
        len = 6;
        w = 1;
      }
      drawTick(ctx, cx + d, cy - len, cx + d, cy + len, w);
      drawTick(ctx, cx - d, cy - len, cx - d, cy + len, w);
      drawTick(ctx, cx - len, cy + d, cx + len, cy + d, w);
      drawTick(ctx, cx - len, cy - d, cx + len, cy - d, w);
    }

    if (opt.style === 'hash' && isMajor && m >= 1) {
      const rows = Math.min(2, m);
      for (let w = 0.2; w <= rows + 0.001; w = Math.round((w + 0.2) * 10) / 10) {
        const hx = w * scale;
        const thick = nearlyMultiple(w, 1) ? 1.35 : 1;
        drawTick(ctx, cx - hx, cy + d, cx + hx, cy + d, thick);
      }
    }

    if (isMajor && m >= 1) {
      label(ctx, String(m), cx + d, cy - 22, opt.color);
      label(ctx, String(m), cx - d, cy - 22, opt.color);
      label(ctx, String(m), cx + 22, cy + d, opt.color, 'left');
      label(ctx, String(m), cx + 22, cy - d, opt.color, 'left');
    }
  }

  ctx.beginPath();
  ctx.arc(cx, cy, 2.15, 0, Math.PI * 2);
  ctx.fill();

  if (!opt.calibrated) {
    ctx.globalAlpha = Math.min(0.55, opt.opacity);
    label(ctx, 'UNCALIBRATED · visual only', cx, cy + maxR * 0.72, opt.color);
  }

  ctx.restore();
}

function nearlyMultiple(value: number, step: number): boolean {
  if (step <= 0) return false;
  const q = value / step;
  return Math.abs(q - Math.round(q)) < 0.02;
}

export function drawPickOverlay(ctx: CanvasRenderingContext2D, pts: Point[]): void {
  if (!pts.length) return;
  ctx.save();
  ctx.strokeStyle = '#ffeb3b';
  ctx.fillStyle = '#ffeb3b';
  ctx.lineWidth = 2.25;
  ctx.setLineDash([5, 4]);
  if (pts.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  pts.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 13px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), p.x, p.y);
    ctx.fillStyle = '#ffeb3b';
    ctx.strokeStyle = '#ffeb3b';
  });
  ctx.restore();
}
