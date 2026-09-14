/** 1 milliradian = 0.001 rad. 1 MOA = 1/60 deg. */
export const MOA_PER_MRAD = 3.437746770784939;

export type SizeUnit = 'in' | 'cm';
export type DistUnit = 'yd' | 'm';

export const INCHES_PER_METER = 1 / 0.0254;
export const YARDS_TO_METERS = 0.9144;

export function toMetersSize(value: number, unit: SizeUnit): number {
  if (!Number.isFinite(value)) return NaN;
  return unit === 'cm' ? value / 100 : value * 0.0254;
}

export function toMetersDist(value: number, unit: DistUnit): number {
  if (!Number.isFinite(value)) return NaN;
  return unit === 'm' ? value : value * YARDS_TO_METERS;
}

/**
 * Angular size in milliradians using the small-angle (scope) formula:
 * θ_mrad = 1000 × size_m / distance_m
 */
export function angularMrad(sizeM: number, distM: number): number {
  if (!(distM > 0) || !(sizeM > 0) || !Number.isFinite(sizeM) || !Number.isFinite(distM)) {
    return NaN;
  }
  return (1000 * sizeM) / distM;
}

/**
 * Store px/mrad at 1× equivalent so FFP scaling is `ppm1x * zoom`.
 * `spanPx` is measured on the overlay at the current zoom.
 */
export function pxPerMradAt1x(spanPx: number, mrad: number, zoom: number): number {
  if (!(spanPx > 0) || !(mrad > 0) || !(zoom > 0)) return NaN;
  return spanPx / mrad / zoom;
}

export function effectivePxPerMrad(pxPerMrad1x: number, zoom: number): number {
  if (!(pxPerMrad1x > 0) || !(zoom > 0)) return NaN;
  return pxPerMrad1x * zoom;
}

export function pxToMrad(spanPx: number, pxPerMrad1x: number, zoom: number): number {
  const ppm = effectivePxPerMrad(pxPerMrad1x, zoom);
  if (!(ppm > 0) || !(spanPx >= 0)) return NaN;
  return spanPx / ppm;
}

/** Physical size (meters) subtended by `mrad` at range `rangeM`. */
export function sizeAtRangeM(mrad: number, rangeM: number): number {
  if (!(rangeM > 0) || !Number.isFinite(mrad)) return NaN;
  return (mrad / 1000) * rangeM;
}

export function mradToMoa(mrad: number): number {
  if (!Number.isFinite(mrad)) return NaN;
  return mrad * MOA_PER_MRAD;
}

export function metersToInches(m: number): number {
  return m * INCHES_PER_METER;
}

export function metersToCm(m: number): number {
  return m * 100;
}

export interface Point {
  x: number;
  y: number;
}

export function hypotPx(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Convert a screen tap into 1× scene coordinates (offset from view center / zoom).
 * The video is CSS-scaled from the center; storing 1× coords keeps picks on the
 * same feature when the user changes zoom (FFP).
 */
export function screenToScene(x: number, y: number, zoom: number, cx: number, cy: number): Point {
  const z = zoom > 0 ? zoom : 1;
  return { x: (x - cx) / z, y: (y - cy) / z };
}

export function sceneToScreen(pt: Point, zoom: number, cx: number, cy: number): Point {
  const z = zoom > 0 ? zoom : 1;
  return { x: cx + pt.x * z, y: cy + pt.y * z };
}

export interface CalInput {
  size: number;
  sizeUnit: SizeUnit;
  dist: number;
  distUnit: DistUnit;
}

export interface CalValidation {
  ok: boolean;
  errors: string[];
  sizeM: number;
  distM: number;
  mrad: number;
}

export function validateCalibrationInputs(input: CalInput): CalValidation {
  const errors: string[] = [];
  const sizeM = toMetersSize(input.size, input.sizeUnit);
  const distM = toMetersDist(input.dist, input.distUnit);

  if (!(input.size > 0) || !Number.isFinite(input.size)) {
    errors.push('Enter a known size greater than zero.');
  }
  if (!(input.dist > 0) || !Number.isFinite(input.dist)) {
    errors.push('Enter a known distance greater than zero.');
  }
  if (sizeM >= distM && errors.length === 0) {
    errors.push('Known size must be smaller than the distance.');
  }

  const mrad = errors.length ? NaN : angularMrad(sizeM, distM);
  if (!errors.length && !(mrad > 0.01 && mrad < 2000)) {
    errors.push('That size/distance pair is not a usable angular size (check units).');
  }

  return { ok: errors.length === 0, errors, sizeM, distM, mrad };
}

export const MIN_CAL_SPAN_PX = 24;

export function validateCalSpan(spanPx: number): string | null {
  if (!(spanPx >= MIN_CAL_SPAN_PX)) {
    return `Mark a larger span (at least ${MIN_CAL_SPAN_PX}px). Zoom in or pick the full known height.`;
  }
  return null;
}

export function formatMrad(mrad: number, digits = 2): string {
  if (!Number.isFinite(mrad)) return '—';
  return mrad.toFixed(digits);
}
