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
