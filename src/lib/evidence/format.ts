export function format(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "not finite";
  if (value !== 0 && Math.abs(value) < 0.1) {
    return value.toLocaleString("en-US", { maximumSignificantDigits: 3 });
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}
