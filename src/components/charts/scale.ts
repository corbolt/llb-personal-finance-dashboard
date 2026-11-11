/** Axis scales with round tick values. All values are in major units (francs). */

export interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

function niceStep(rough: number): number {
  if (!(rough > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / magnitude;
  // snap to the nearest of 1, 2, 2.5, 5, 10 rather than always rounding up
  const nice = fraction < 1.5 ? 1 : fraction < 2.25 ? 2 : fraction < 3.75 ? 2.5 : fraction < 7.5 ? 5 : 10;
  return nice * magnitude;
}

/**
 * A scale covering `[low, high]` that always includes zero, with about
 * `target` evenly spaced ticks on round numbers.
 */
export function niceScale(low: number, high: number, target = 4): Scale {
  const lo = Math.min(0, low);
  const hi = Math.max(0, high);
  if (lo === 0 && hi === 0) return { min: 0, max: 1, ticks: [0, 1] };

  const step = niceStep((hi - lo) / target);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  // multiply instead of accumulating so 0.1 + 0.2 never shows up as a tick
  const count = Math.round((max - min) / step);
  for (let i = 0; i <= count; i++) ticks.push(Number((min + i * step).toPrecision(12)));
  return { min, max, ticks };
}

/** Position of `value` on the scale as a percentage from the top of the plot. */
export function fromTop(scale: Scale, value: number): number {
  return ((scale.max - value) / (scale.max - scale.min)) * 100;
}
