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
 * A scenario's assumed dollars, rounded so the precision does not imply a
 * calculation: "about $32,000". An amount that rounds to nothing is "$0".
 * Every screen, report and brief that prints scenario loss, retained or
 * transferred dollars uses this, so they all read the same figure.
 */
export function formatEstimateUsd(n: number): string {
  const text = formatUsd(roundToTwoFigures(n));
  return text === "$0" ? text : `about ${text}`;
}

/** A change in scenario dollars, rounded as formatEstimateUsd: "about -$1,200", "about +$300", "$0". */
export function formatEstimateUsdDelta(n: number): string {
  const text = formatUsdDelta(roundToTwoFigures(n));
  return text === "$0" ? text : `about ${text}`;
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
