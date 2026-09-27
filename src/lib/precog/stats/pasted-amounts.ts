import type { Transaction } from "./forensic-suite";
import { parseAmount, parseTransactionsCsv } from "./transactions-csv";
import { localDateKey } from "../dates";

interface PastedAmounts {
  transactions: Transaction[];
  issues: string[];
  /**
   * True when the paste was a bare list of amounts. Every line then carries
   * today's date as a placeholder, so tests that compare dates (repeated
   * amount-and-date groups) would treat any two equal prices as a repeat and
   * must not run.
   */
  undated: boolean;
}

/**
 * Screen input pasted by the owner: a transaction CSV when the first line
 * names date and amount columns, otherwise one amount per line.
 */
export function parsePastedAmounts(value: string, today = new Date()): PastedAmounts {
  const trimmed = value.trim();
  if (!trimmed) return { transactions: [], issues: [], undated: false };
  const firstLine = trimmed.split(/\r?\n/, 1)[0].toLowerCase();
  if (firstLine.includes("date") && firstLine.includes("amount")) {
    return { ...parseTransactionsCsv(trimmed), undated: false };
  }
  const date = localDateKey(today);
  const transactions: Transaction[] = [];
  const issues: string[] = [];
  trimmed.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const amount = parseAmount(line);
    if (amount === null) {
      if (issues.length < 20) issues.push(`Line ${index + 1}: invalid amount`);
      return;
    }
    transactions.push({ id: `pasted-${index + 1}`, date, amount });
  });
  return { transactions, issues, undated: true };
}
