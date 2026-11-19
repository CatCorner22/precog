import { z } from "zod";
import { decimalParts, finite, fraction, multiply, type Fraction } from "./controlguard-decimal";

const amount = z.number().nonnegative();
const text = z.string().trim().min(1);
const checkText = z.string().refine((value) => value.trim().length > 0);
const day = 86_400_000;

export const priceInput = z.strictObject({
  quantity: amount,
  invoice_pack: amount,
  po_pack: amount,
  billed_price: amount,
  contract_list_price: amount,
  discount: amount.lt(1),
});

export function price(input: z.infer<typeof priceInput>) {
  const { quantity, invoice_pack, po_pack, billed_price, contract_list_price, discount } = input;
  const minimumPack = 1e-9;
  const billed = fraction(billed_price);
  const packs = fraction(quantity);
  const truthUnit = multiply(
    fraction(contract_list_price),
    subtract(fraction(1), fraction(discount)),
  );
  const [poNumerator, poDenominator] = fraction(Math.max(po_pack, minimumPack));
  const contractUnit = multiply(truthUnit, [poDenominator, poNumerator]);
  const truthTotal = multiply(multiply(packs, fraction(invoice_pack)), contractUnit);
  const billedTotal = multiply(packs, billed);
  const [invoiceNumerator, invoiceDenominator] = fraction(Math.max(invoice_pack, minimumPack));
  return {
    invoice_unit_price: finite(multiply(billed, [invoiceDenominator, invoiceNumerator])),
    truth_unit_price: finite(contractUnit),
    truth_total: finite(truthTotal),
    billed_total: finite(billedTotal),
    overcharge: finite(subtract(billedTotal, truthTotal)),
    flags: invoice_pack !== po_pack ? ["INV-TRAP-04"] : [],
    warnings:
      Math.min(invoice_pack, po_pack) < minimumPack
        ? ["A pack size is zero or too small. Check the pack sizes before using this amount."]
        : [],
  };
}

const subtract = ([a, b]: Fraction, [c, d]: Fraction): Fraction => [a * d - c * b, b * d];

function align(values: [bigint, number][]): bigint[] {
  const power = Math.min(...values.map(([, exponent]) => exponent));
  return values.map(([n, exponent]) => n * 10n ** BigInt(exponent - power));
}

export const skimInput = z.strictObject({
  tolerance: amount.max(1),
  invoices: z
    .array(
      z.strictObject({
        invoice_unit_price: amount,
        po_unit_price: amount.positive(),
      }),
    )
    .max(1000),
});

export function skim({ tolerance, invoices }: z.infer<typeof skimInput>) {
  const threshold = decimalParts(String(tolerance));
  let positive = 0;
  let hug = 0;
  for (const invoice of invoices) {
    const [actual, base] = align([
      decimalParts(String(invoice.invoice_unit_price)),
      decimalParts(String(invoice.po_unit_price)),
    ]);
    const [variance, upper] = align([
      [actual - base, 0],
      [base * threshold[0], threshold[1]],
    ]);
    if (variance > 0n) positive++;
    if (5n * variance >= 3n * upper && variance < upper) hug++;
  }
  const count = invoices.length;
  const eligible = count >= 4;
  const flagged = eligible && positive * 10 >= count * 7 && hug * 2 >= count;
  return {
    sample_size: count,
    eligible,
    positive_skew: count ? positive / count : null,
    ceiling_hug: count ? hug / count : null,
    flagged,
    flags: flagged ? ["TW-01", "INV-TRAP-05"] : [],
    cusum_evaluated: false,
  };
}

export const cliffInput = z.strictObject({
  start: text,
  notice_days: z.int().min(0).max(36500),
  term_days: z.int().min(1).max(73050).optional(),
  term_months: z.int().min(1).max(2400).optional(),
});

function boundedDate(year: number, month: number, date: number) {
  return Date.UTC(
    year,
    month - 1,
    Math.max(1, Math.min(date, new Date(Date.UTC(year, month, 0)).getUTCDate())),
  );
}

export function cliff({ start, notice_days, term_days, term_months }: z.infer<typeof cliffInput>) {
  if ((term_days === undefined) === (term_months === undefined)) {
    throw new Error("Enter either term days or term months.");
  }
  const match = /^([+-]?\d{1,6})-([+-]?\d{1,6})-([+-]?\d{1,6})$/.exec(start);
  if (!match) throw new Error("Use a numeric YYYY-MM-DD start date.");
  const [, year, month, date] = match.map(Number);
  const y = Math.min(2100, Math.max(1970, year));
  const m = Math.min(12, Math.max(1, month));
  const first = boundedDate(y, m, date);
  const d = new Date(first).getUTCDate();
  const months = m - 1 + (term_months ?? 0);
  const expiration =
    term_days === undefined
      ? boundedDate(y + Math.floor(months / 12), (months % 12) + 1, d)
      : first + term_days * day;
  const deadline = expiration - notice_days * day;
  const format = (value: number) => new Date(value).toISOString().slice(0, 10);
  return {
    start: format(first),
    start_clamped: year !== y || month !== m || date !== d,
    expiration: format(expiration),
    cliff: format(deadline),
    alerts: {
      "75": format(deadline - 75 * day),
      "60": format(deadline - 60 * day),
      "30": format(deadline - 30 * day),
    },
  };
}

export const leaveInput = z.strictObject({
  text: checkText,
  shift_hours: amount.min(0.01).max(24).optional(),
  kind: z.enum(["planned_pto", "statutory_leave"]).optional(),
  usage_increment_hours: amount.optional(),
});

export function leave({
  text: source,
  shift_hours = 8,
  kind,
  usage_increment_hours,
}: z.infer<typeof leaveInput>) {
  let replacements = 0;
  const [shift, exponent] = decimalParts(String(shift_hours));
  const hours = (amount: string) => {
    const [n, power] = decimalParts(amount);
    const digits = (shift * n).toString();
    const places = -exponent - power;
    if (places <= 0) return digits + "0".repeat(-places) + ".0";
    const padded = digits.padStart(places + 1, "0");
    return padded.slice(0, -places) + "." + (padded.slice(-places).replace(/0+$/, "") || "0");
  };
  const result = source.replace(
    /(?<![\p{L}\p{N}_./–—-])(?:(?:(\d+(?:\.\d+)?)(\s*[-–—]\s*|\s+(?:to|or)\s+))?(\d+(?:\.\d+)?)[ -]+days?|(?:a\s+)?(half[- ]day))\b(?:\s*(?:\/|per\s+)\s*(?:calendar\s+)?(month|year)\b)?/giu,
    (
      match: string,
      start: string | undefined,
      join: string | undefined,
      amount: string,
      half: string | undefined,
      period: string | undefined,
      offset: number,
    ) => {
      if (
        /^(?:['’]s?\s+notice|[- ](?:old|long|period|notice))\b/i.test(
          source.slice(offset + match.length),
        )
      )
        return match;
      replacements++;
      const quantity = hours(half ? "0.5" : amount);
      const range =
        start && join ? hours(start) + (/^(to|or)$/i.test(join.trim()) ? join : "–") : "";
      const suffix =
        period?.toLowerCase() === "month" ? " per calendar month" : period ? " per year" : "";
      return range + quantity + " hours" + suffix;
    },
  );
  const minimum = kind === "statutory_leave" ? 0.25 : 1;
  return {
    text: result,
    replacements,
    unresolved_day_units: /\b(?:half[- ]day|days?)\b/i.test(result),
    minimum_increment_hours: minimum,
    increment_valid: usage_increment_hours === undefined ? null : usage_increment_hours >= minimum,
  };
}

export const policyInput = z.strictObject({
  text: checkText,
  title: z.string().min(1).optional(),
  kind: z.enum(["policy", "contract"]).optional(),
});

const lexicon = {
  "and/or": null,
  "pursuant to": "under",
  "in the event that": "if",
  "prior to": "before",
  herein: null,
  thereof: null,
  wherefore: null,
  adequate: null,
  appropriate: null,
  promptly: null,
  immediately: null,
  "reasonable efforts": null,
  ["sh" + "ould"]: null,
};

export function policy({ text: source, title, kind = "policy" }: z.infer<typeof policyInput>) {
  const title_valid =
    title === undefined
      ? null
      : /^Policy:\s+[A-Za-z0-9 &/]+--[A-Za-z0-9 &/,-]+\.\s{1,2}[A-Z]{2,6}\s+Policy\s+\d+$/.test(
          title,
        );
  const terms =
    kind === "policy"
      ? {
          ...lexicon,
          shall: "must, if this is a duty",
          "reserves the right to": "may",
          "is authorized to": "may",
        }
      : { ...lexicon, shall: "Check whether a party has a duty to act." };
  const flags: { term: string; offset: number; suggestion: string | null; review: boolean }[] = [];
  const flag = (pattern: RegExp, suggestion: string | null, review: boolean) => {
    for (const match of source.matchAll(pattern)) {
      flags.push({
        term: match[0],
        offset: Array.from(source.slice(0, match.index)).length,
        suggestion,
        review,
      });
    }
  };
  for (const [term, suggestion] of Object.entries(terms)) {
    flag(
      new RegExp(
        "(?<![\\p{L}\\p{N}_])" + term.replaceAll(" ", "\\s+") + "(?![\\p{L}\\p{N}_])",
        "giu",
      ),
      suggestion,
      kind === "contract" && term === "shall",
    );
  }
  flag(
    /\bwithin\s+\d+(?:\.\d+)?\s+(?:hours?|days?)\s+of\b/gi,
    "Name the start event and state the deadline.",
    true,
  );
  flag(
    /\b(?:be|is|are|was|were|been|being)\s+(?:\w+ed|made|held|given|sent|paid|kept|done)\b/gi,
    "Check whether the sentence names the actor.",
    true,
  );
  flags.sort((a, b) => a.offset - b.offset);
  return {
    title_valid,
    flags,
    passes_screen: title_valid !== false && !flags.length,
    lexicon_complete: false,
  };
}
