import { isCalendarDate } from "../dates";

export type Cents = number & { readonly __cents: unique symbol };
export type Parsed<T> = { value: T } | { issue: string };

export function formatCents(cents: Cents): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError("Amount must be exact whole cents");
  const value = BigInt(cents);
  const digits = (value < 0n ? -value : value).toString().padStart(3, "0");
  const dollars = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value < 0n ? "-" : ""}$${dollars}.${digits.slice(-2)}`;
}

export function parseCents(input: string): Parsed<Cents> {
  let text = input.trim();
  const negative = text.startsWith("(") && text.endsWith(")");
  if (negative) text = text.slice(1, -1);
  const match = /^([+-]?)\$?((?:\d{1,3}(?:,\d{3})+|\d+))(?:\.(\d{1,2}))?$/.exec(text);
  if (!match || (negative && match[1])) return { issue: "Amount must be exact whole cents" };
  const magnitude =
    BigInt(match[2].replaceAll(",", "")) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  if (magnitude > BigInt(Number.MAX_SAFE_INTEGER))
    return { issue: "Amount exceeds exact cents range" };
  const value = Number(magnitude) * (negative || match[1] === "-" ? -1 : 1);
  return { value: (value === 0 ? 0 : value) as Cents };
}

export function parseMoneyDate(input: string): Parsed<string> {
  let text = input.trim();
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  if (us)
    text = `${us[3].length === 2 ? "20" : ""}${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return isCalendarDate(text)
    ? { value: text }
    : { issue: "Date must be YYYY-MM-DD, MM/DD/YYYY or M/D/YY" };
}
