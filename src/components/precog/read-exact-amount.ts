/**
 * Read a typed amount: a finite number from `min` up to `limit`, rounded to
 * cents. The limit is the most the app stores for the figure, not the slider's
 * range, so an owner with a larger real policy can enter it.
 */
export function readExactAmount(
  draft: string,
  min: number,
  limit: number,
): { value: number } | { error: string } {
  const number = draft.trim() ? Number(draft.replaceAll(",", "").replace(/^\$/, "")) : NaN;
  if (!Number.isFinite(number) || number < min || number > limit) {
    return {
      error: `Enter an amount from ${min.toLocaleString("en-US")} to ${limit.toLocaleString("en-US")}.`,
    };
  }
  return { value: Math.round(number * 100) / 100 };
}
