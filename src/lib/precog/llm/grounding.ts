import type { ToolResult } from "./types";

/**
 * Deterministic check that the model's dollar figures and percentages came
 * from the tool results it was given. The system prompt says "use only numbers
 * the tools returned"; this makes that a verified property rather than a hope.
 * Unsupported figures are reported, not silently accepted, and the caller
 * decides what to do (we flag them in the brief rather than drop the answer).
 */

export interface GroundingReport {
  /** Money and percent figures in the text that no tool result contains. */
  unsupported: string[];
  /** Every money/percent figure found in the text. */
  checked: string[];
}

const MONEY = /\$\s?(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|b|m|k)?\b/gi;
const PERCENT = /(\d+(?:\.\d+)?)\s?(%|percent\b)/gi;
const NUMBER = /\d+(?:\.\d+)?/g;

const SCALE: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};

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

/** Every number in the tool payloads, plus percent forms of any fraction. */
export function numbersInTools(toolResults: ToolResult[]): number[] {
  const text = JSON.stringify(toolResults.map((t) => ({ summary: t.summary, data: t.data })));
  const out = new Set<number>();
  for (const m of text.matchAll(NUMBER)) {
    const n = Number(m[0]);
    if (!Number.isFinite(n)) continue;
    out.add(n);
    if (n > 0 && n <= 1) out.add(Math.round(n * 1000) / 10);
  }
  return [...out];
}

export function checkGrounding(markdown: string, toolResults: ToolResult[]): GroundingReport {
  const known = numbersInTools(toolResults);
  const has = (value: number, raw: string) => known.some((k) => matches(value, raw, k));
  const checked: string[] = [];
  const unsupported: string[] = [];

  for (const m of markdown.matchAll(MONEY)) {
    const raw = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(raw)) continue;
    const scale = m[2] ? (SCALE[m[2].toLowerCase()] ?? 1) : 1;
    const value = raw * scale;
    const label = m[0].trim();
    checked.push(label);
    // Accept the scaled value or the literal digits (tools store $3.4B as 3.4 in
    // a "billions" field as often as 3400000000).
    if (!has(value, m[1]) && !has(raw, m[1])) unsupported.push(label);
  }
  for (const m of markdown.matchAll(PERCENT)) {
    const value = Number(m[1]);
    if (!Number.isFinite(value)) continue;
    const label = m[0].trim();
    checked.push(label);
    if (!has(value, m[1])) unsupported.push(label);
  }
  return { unsupported: [...new Set(unsupported)], checked };
}

/** Footnote appended to a brief whose figures could not all be traced to a tool. */
export function groundingNote(report: GroundingReport): string | null {
  if (!report.unsupported.length) return null;
  return `\n\n---\n\n**Check before quoting:** ${report.unsupported.length === 1 ? "this figure" : "these figures"} did not come from the tools this brief ran and could not be verified: ${report.unsupported.join(", ")}. The rest of the numbers above trace to tool output.`;
}
