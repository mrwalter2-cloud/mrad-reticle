import { describe, expect, it } from 'vitest';
import {
  angularMrad,
  effectivePxPerMrad,
  metersToCm,
  metersToInches,
  mradToMoa,
  pxPerMradAt1x,
  pxToMrad,
  sizeAtRangeM,
  toMetersDist,
  toMetersSize,
  validateCalSpan,
  validateCalibrationInputs,
  hypotPx,
  screenToScene,
  sceneToScreen,
  MIN_CAL_SPAN_PX,
} from './math';

describe('unit conversions', () => {
  it('converts inches and cm to meters', () => {
    expect(toMetersSize(12, 'in')).toBeCloseTo(0.3048, 8);
    expect(toMetersSize(100, 'cm')).toBeCloseTo(1, 8);
  });

  it('converts yards and meters to meters', () => {
    expect(toMetersDist(100, 'yd')).toBeCloseTo(91.44, 8);
    expect(toMetersDist(200, 'm')).toBe(200);
  });
});

describe('angular milliradians', () => {
  it('is 1 mrad for 1 m at 1000 m', () => {
    expect(angularMrad(1, 1000)).toBeCloseTo(1, 8);
  });

  it('is 3.333 mrad for 12 in at 100 yd (3.6 in/mil at 100 yd)', () => {
    const sizeM = toMetersSize(12, 'in');
    const distM = toMetersDist(100, 'yd');
    expect(angularMrad(sizeM, distM)).toBeCloseTo(12 / 3.6, 6);
  });

  it('rejects non-positive inputs', () => {
    expect(angularMrad(0, 100)).toBeNaN();
    expect(angularMrad(1, 0)).toBeNaN();
  });
});

describe('FFP zoom scaling', () => {
  it('stores px/mrad at 1× and scales linearly with zoom', () => {
    const mrad = 12 / 3.6;
    const spanAt2x = 80;
    const ppm1x = pxPerMradAt1x(spanAt2x, mrad, 2);
    expect(ppm1x).toBeCloseTo(spanAt2x / mrad / 2, 8);
    expect(effectivePxPerMrad(ppm1x, 1)).toBeCloseTo(ppm1x, 8);
    expect(effectivePxPerMrad(ppm1x, 4)).toBeCloseTo(ppm1x * 4, 8);
  });

  it('keeps angular size constant when the image and reticle both zoom (FFP)', () => {
    const trueMrad = 3.333333333;
    const zoomA = 1.5;
    const spanA = 60;
    const ppm1x = pxPerMradAt1x(spanA, trueMrad, zoomA);

    const zoomB = 6;
    const spanB = spanA * (zoomB / zoomA);
    expect(pxToMrad(spanB, ppm1x, zoomB)).toBeCloseTo(trueMrad, 6);
  });

  it('halves reported mrad for the same screen span when zoom doubles', () => {
    const ppm1x = 10;
    const span = 40;
    expect(pxToMrad(span, ppm1x, 1)).toBeCloseTo(4, 8);
    expect(pxToMrad(span, ppm1x, 2)).toBeCloseTo(2, 8);
  });
});

describe('size at range', () => {
  it('returns inches and cm from mrad and range', () => {
    const mrad = 3;
    const rangeM = toMetersDist(100, 'yd');
    const sizeM = sizeAtRangeM(mrad, rangeM);
    expect(metersToInches(sizeM)).toBeCloseTo(10.8, 5);
    expect(metersToCm(sizeM)).toBeCloseTo(10.8 * 2.54, 5);
  });
});

describe('MOA', () => {
  it('converts 1 mrad to ~3.438 MOA', () => {
    expect(mradToMoa(1)).toBeCloseTo(3.43775, 5);
  });
});

describe('validation', () => {
  it('accepts a typical steel plate', () => {
    const v = validateCalibrationInputs({
      size: 12,
      sizeUnit: 'in',
      dist: 100,
      distUnit: 'yd',
    });
    expect(v.ok).toBe(true);
    expect(v.mrad).toBeCloseTo(12 / 3.6, 6);
  });

  it('rejects missing size or distance', () => {
    expect(validateCalibrationInputs({ size: 0, sizeUnit: 'in', dist: 100, distUnit: 'yd' }).ok).toBe(false);
    expect(validateCalibrationInputs({ size: 12, sizeUnit: 'in', dist: 0, distUnit: 'yd' }).ok).toBe(false);
  });

  it('rejects a tiny pick span', () => {
    expect(validateCalSpan(MIN_CAL_SPAN_PX - 1)).toMatch(/larger span/);
    expect(validateCalSpan(MIN_CAL_SPAN_PX)).toBeNull();
  });
});

describe('hypotPx', () => {
  it('measures screen distance', () => {
    expect(hypotPx({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('scene coordinates (FFP picks)', () => {
  const cx = 200;
  const cy = 400;

  it('round-trips a tap through zoom', () => {
    const scene = screenToScene(260, 430, 2, cx, cy);
    expect(scene).toEqual({ x: 30, y: 15 });
    expect(sceneToScreen(scene, 2, cx, cy)).toEqual({ x: 260, y: 430 });
    expect(sceneToScreen(scene, 4, cx, cy)).toEqual({ x: 320, y: 460 });
  });

  it('keeps mrad stable when the same feature is zoomed', () => {
    const ppm1x = 10;
    const top = screenToScene(200, 340, 1, cx, cy);
    const bot = screenToScene(200, 400, 1, cx, cy);
    const span1x = hypotPx(top, bot);
    expect(pxToMrad(span1x * 1, ppm1x, 1)).toBeCloseTo(6, 8);
    const top2 = sceneToScreen(top, 2, cx, cy);
    const bot2 = sceneToScreen(bot, 2, cx, cy);
    expect(pxToMrad(hypotPx(top2, bot2), ppm1x, 2)).toBeCloseTo(6, 8);
  });
});
