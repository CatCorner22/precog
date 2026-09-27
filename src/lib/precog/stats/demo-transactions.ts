import type { Transaction } from "./forensic-suite";
import { utcDateKey } from "../dates";

/**
 * A deterministic 60-day day sheet: each charge settled by a payment of the
 * same amount on most visits, one deposit per weekday summing the day's
 * payments, and a few planted anomalies (missing deposits, repeated refunds,
 * one large adjustment, concentrated adjustments). Payment amounts are spread
 * evenly on a log scale from $20 to $2,000 (a golden-ratio sequence, so even a
 * few hundred of them follow the shape closely), the shape Benford's law
 * expects of amounts that arise from many independent sales.
 */
export function demoTransactions(seed = 42, days = 60): Transaction[] {
  const random = mulberry32(seed);
  const transactions: Transaction[] = [];
  let visit = 0;
  const start = new Date(Date.UTC(2025, 0, 1));
  const weekdayOffsets: number[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) weekdayOffsets.push(offset);
  }
  const missingDepositOffsets = new Set(weekdayOffsets.slice(-2));
  const duplicatedRefundDays = new Set(weekdayOffsets.filter((_, i) => i % 13 === 5).slice(0, 3));

  for (let offset = 0; offset < days; offset++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const dateText = utcDateKey(date);
    const chargeCount = 6 + Math.floor(random() * 9);
    let payments = 0;
    let refundedToday = false;
    for (let index = 0; index < chargeCount; index++) {
      const n = visit++;
      const spread = (n * GOLDEN_RATIO_FRACTION + seed * 0.1) % 1;
      const amount = Math.round(10 ** (1.3 + 2 * spread) * 100) / 100;
      const personId = random() < 0.65 ? "p-front-desk" : random() < 0.5 ? "p-staff" : "p-owner";
      transactions.push({
        id: `tx-charge-${n}`,
        date: dateText,
        amount,
        kind: "charge",
        memo: "Day-sheet charge",
        personId,
      });
      if (random() < 0.8) {
        transactions.push({
          id: `tx-payment-${n}`,
          date: dateText,
          amount,
          kind: "payment",
          memo: "Matched payment",
          personId,
        });
        payments += amount;
      }
      if (random() < 0.03 || (duplicatedRefundDays.has(offset) && !refundedToday)) {
        const refund: Transaction = {
          id: `tx-refund-${n}`,
          date: dateText,
          amount: -Math.round(amount * 0.1 * 100) / 100,
          kind: "refund",
          memo: "Refund recorded",
          personId: "p-front-desk",
        };
        transactions.push(refund);
        if (duplicatedRefundDays.has(offset) && !refundedToday) {
          transactions.push({ ...refund, id: `tx-refund-${n}-again` });
        }
        refundedToday = true;
      }
    }
    if (!missingDepositOffsets.has(offset)) {
      transactions.push({
        id: `tx-deposit-${dateText}`,
        date: dateText,
        amount: Math.round(payments * 100) / 100,
        kind: "deposit",
        memo: "Daily deposit",
        personId: "p-front-desk",
      });
    }
  }

  for (let index = 0; index < 14; index++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index * 4 + 1);
    transactions.push({
      id: `tx-adjustment-${index}`,
      date: utcDateKey(date),
      amount: index === 9 ? -2400 : index % 2 === 0 ? 25 : -15,
      kind: "adjustment",
      memo: index === 9 ? "Balance write-off" : "Adjustment review sample",
      personId: index % 7 === 3 ? "p-owner" : "p-front-desk",
    });
  }

  return transactions;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const GOLDEN_RATIO_FRACTION = 0.6180339887498949;
