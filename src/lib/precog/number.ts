/** Number helpers shared by the scoring, the loaders and the UI. */

/** `value` limited to the range lo..hi. */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * A saved or typed number read back safely: anything that is not a finite
 * number becomes `fallback`, and a number outside min..max is pulled into
 * the range.
 */
export function boundedNumber(
  value: unknown,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

/** A score rounded and held to 0..100. */
export function wholePercent(value: number): number {
  return clamp(Math.round(value), 0, 100);
}
