import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Whole US dollars with the sign in front: "$10,000", "-$3,640", never "$-3,640" or "-$0". */
export function formatUsd(n: number): string {
  const text = USD.format(n);
  return text === "-$0" ? "$0" : text;
}

/** A change in dollars: "+$3,640", "-$3,640", "$0". */
export function formatUsdDelta(n: number): string {
  const text = formatUsd(n);
  return n > 0 && text !== "$0" ? `+${text}` : text;
}

/**
 * Dollars and cents only when there are cents: "$500", "$12.50". For an
 * amount the owner typed, which Precog keeps as typed.
 */
export function formatUsdTyped(n: number): string {
  return Number.isInteger(n) ? formatUsd(n) : USD_CENTS.format(n);
}

/** A number rounded to two significant figures: 31,533 is 32,000, -533 is -530. */
export function roundToTwoFigures(n: number): number {
  return Number.isFinite(n) && n !== 0 ? Number(n.toPrecision(2)) : n;
}

/**
 * The whole dollars a scenario estimate prints: two significant figures,
 * then whole dollars with halves away from zero, as formatUsd rounds them.
 * An amount under half a dollar either way is 0 (never -0), checked before
 * the two-figure step, which would carry 0.499 up to 0.50 and so to $1.
 */
function estimateDollars(n: number): number {
  if (!Number.isFinite(n)) return n;
  if (Math.abs(n) < 0.5) return 0;
  const rounded = roundToTwoFigures(n);
  return Math.sign(rounded) * Math.round(Math.abs(rounded));
}

/**
 * A scenario's assumed dollars, rounded so the precision does not imply a
 * calculation: "about $32,000". An amount that rounds to no whole dollar is
 * "$0", with no "about" and no sign. Every screen, report and brief that
 * prints scenario loss, retained or transferred dollars uses this, so they
 * all read the same figure.
 */
export function formatEstimateUsd(n: number): string {
  const dollars = estimateDollars(n);
  return dollars === 0 ? "$0" : `about ${formatUsd(dollars)}`;
}

/** A change in scenario dollars, rounded as formatEstimateUsd: "about -$1,200", "about +$300", "$0". */
export function formatEstimateUsdDelta(n: number): string {
  const dollars = estimateDollars(n);
  return dollars === 0 ? "$0" : `about ${formatUsdDelta(dollars)}`;
}

/**
 * The change from one scenario dollar figure to another as their printed
 * estimates give it: "about $29,000" to "about $37,000" is 8,000, where the
 * exact figures (28,753 and 36,533) differ by 7,780. A line that prints this
 * beside the two figures then matches a reader's subtraction. It is not
 * rounded again: two rounded figures can differ by any whole amount.
 */
export function estimateUsdChange(from: number, to: number): number {
  return estimateDollars(to) - estimateDollars(from);
}

/** A range of scenario dollars, both ends rounded: "about $14,000 – $75,000". */
export function formatEstimateUsdRange(low: number, high: number): string {
  return `about ${formatUsd(roundToTwoFigures(low))} – ${formatUsd(roundToTwoFigures(high))}`;
}

/** A change in a plain number: "+3", "-2", "0". */
export function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** A fraction as a percentage: formatPct(0.354) is "35%", formatPct(0.354, 1) is "35.4%". */
export function formatPct(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const USD_CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
