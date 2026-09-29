import type { ToolResult } from "./types";

/**
 * Deterministic check that the model's dollar figures and percentages came
 * from the tool results it was given. This is a diagnostic only: it cannot
 * validate a number's subject, unit, period, applicability or interpretation.
 * It must never be used as permission to display a model-written claim.
 * The live brief uses complete statement selection in brief-selection.ts.
 */

interface GroundingReport {
  /** Money and percent figures in the text that no tool result contains. */
  unsupported: string[];
  /** Every money/percent figure found in the text. */
  checked: string[];
}

export function checkGrounding(markdown: string, toolResults: ToolResult[]): GroundingReport {
  const known = numbersInTools(toolResults);
  const has = (value: number, raw: string) => known.values.some((k) => matches(value, raw, k));
  const hasPercent = (value: number, raw: string) =>
    has(value, raw) || known.fractionsAsPercent.some((k) => matches(value, raw, k));
  const checked: string[] = [];
  const unsupported: string[] = [];

  for (const m of markdown.matchAll(MONEY)) {
    const raw = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(raw)) continue;
    const scale = m[2] ? (SCALE[m[2].toLowerCase()] ?? 1) : 1;
    const value = raw * scale;
    const label = m[0].trim();
    checked.push(label);
    // Accept the scaled value, or the literal digits when a scale word was
    // written (tools store $3.4B as 3.4 in a "billions" field as often as
    // 3400000000).
    if (!has(value, m[1]) && !(m[2] && has(raw, m[1]))) unsupported.push(label);
  }
  for (const m of markdown.matchAll(PERCENT)) {
    const value = Number(m[1]);
    if (!Number.isFinite(value)) continue;
    const label = m[0].trim();
    checked.push(label);
    if (!hasPercent(value, m[1])) unsupported.push(label);
  }
  return { unsupported: [...new Set(unsupported)], checked };
}

/** Footnote appended to a brief whose figures could not all be traced to a tool. */
export function groundingNote(report: GroundingReport): string | null {
  if (!report.unsupported.length) return null;
  return `\n\n---\n\n**Check before quoting:** ${report.unsupported.length === 1 ? "this figure" : "these figures"} did not come from the tools this brief ran, so Precog could not check the source: ${report.unsupported.join(", ")}. The other money and percent figures above match numbers the tools returned.`;
}

/**
 * The figures a tool actually returned: numeric values in its data (not ids,
 * dates or version fields), money and percent figures written in its strings,
 * and plain numbers of 10 or more in its summary. Digits inside an id, a date
 * or a list position never ground a figure. A fraction also grounds its
 * percent form, but only for a percent figure.
 */
function numbersInTools(toolResults: ToolResult[]): {
  values: number[];
  fractionsAsPercent: number[];
} {
  const values = new Set<number>();
  const fractionsAsPercent = new Set<number>();
  const add = (n: number) => {
    if (!Number.isFinite(n)) return;
    values.add(n);
    if (n > 0 && n <= 1) fractionsAsPercent.add(Math.round(n * 1000) / 10);
  };
  for (const t of toolResults) {
    for (const n of figuresInText(t.summary)) add(n);
    for (const m of t.summary.replace(DATE, " ").matchAll(NUMBER)) {
      const n = Number(m[0]);
      if (n >= 10) add(n);
    }
    walk(t.data, null, add);
  }
  return { values: [...values], fractionsAsPercent: [...fractionsAsPercent] };
}

function walk(value: unknown, key: string | null, add: (n: number) => void): void {
  if (key !== null && NOT_A_FIGURE.test(key)) return;
  if (typeof value === "number") {
    // A small whole number is a count or a position, not a figure the brief quotes.
    if (!Number.isInteger(value) || Math.abs(value) >= 10) add(value);
  } else if (typeof value === "string") {
    for (const n of figuresInText(value)) add(n);
  } else if (Array.isArray(value)) {
    for (const item of value) walk(item, null, add);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, k, add);
  }
}

/** Money and percent figures written in a string, at their stated scale. */
function figuresInText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(MONEY)) {
    const raw = Number(m[1].replace(/,/g, ""));
    out.push(raw * (m[2] ? (SCALE[m[2].toLowerCase()] ?? 1) : 1));
  }
  for (const m of text.matchAll(PERCENT)) out.push(Number(m[1]));
  return out;
}

/** Significant digits the author actually wrote: "1.4" → 2, "104,000" → 3, "0.43" → 2. */
function significantDigits(raw: string): number {
  const digits = raw
    .replace(/[^0-9.]/g, "")
    .replace(".", "")
    .replace(/^0+/, "");
  const trimmed = raw.includes(".") ? digits : digits.replace(/0+$/, "");
  return Math.max(1, trimmed.length);
}

function roundToSig(value: number, sig: number): number {
  if (value === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = 10 ** (sig - 1 - magnitude);
  return Math.round(value * factor) / factor;
}

/**
 * A stated figure matches a tool value when the tool value, rounded to the
 * precision the text used, is the stated figure: "$1.4 million" is grounded by
 * 1,415,000 and "43%" by 43.2, but "$104,000" is not grounded by 104,500.
 */
function matches(stated: number, statedRaw: string, known: number): boolean {
  if (stated === known) return true;
  const sig = significantDigits(statedRaw);
  return roundToSig(known, sig) === roundToSig(stated, sig);
}

const MONEY = /\$\s?(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|b|m|k)?\b/gi;
const PERCENT = /(\d+(?:\.\d+)?)\s?(%|percent\b)/gi;
const NUMBER = /\d+(?:\.\d+)?/g;
const DATE = /\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?/g;
/** Keys whose values are identifiers, dates or versions, never figures. */
const NOT_A_FIGURE = /^(id|from|to|day|today|date|year|version)$|(Id|Ids|At|By|Date|Day|Version)$/;

const SCALE: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};
