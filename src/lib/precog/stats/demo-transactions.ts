import type { Transaction } from "./forensic-suite";

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

function normal(random: () => number): number {
  const u = Math.max(random(), Number.MIN_VALUE);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function demoTransactions(seed = 42, days = 60): Transaction[] {
  const random = mulberry32(seed);
  const transactions: Transaction[] = [];
  let chargeNumber = 0;
  const start = new Date(Date.UTC(2025, 0, 1));
  const weekdayOffsets: number[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) weekdayOffsets.push(offset);
  }
  const missingDepositOffsets = new Set(weekdayOffsets.slice(-2));

  for (let offset = 0; offset < days; offset++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const dateText = dateKey(date);
    const chargeCount = 6 + Math.floor(random() * 9);
    let payments = 0;
    for (let index = 0; index < chargeCount; index++) {
      let amount = Math.exp(5.2 + 0.9 * normal(random));
      if (chargeNumber < 6) amount = [100, 200, 100, 200, 100, 200][chargeNumber];
      amount = Math.round(amount * 100) / 100;
      const personId =
        random() < 0.65 ? "p-front-desk" : random() < 0.5 ? "p-hygienist" : "p-dentist";
      transactions.push({
        id: `tx-charge-${chargeNumber++}`,
        date: dateText,
        amount,
        kind: "charge",
        memo: "Dental day-sheet charge",
        personId,
      });
      if (random() < 0.8) {
        transactions.push({
          id: `tx-payment-${chargeNumber}`,
          date: dateText,
          amount,
          kind: "payment",
          memo: "Matched payment",
          personId,
        });
        payments += amount;
      }
      if (random() < 0.03) {
        transactions.push({
          id: `tx-refund-${chargeNumber}`,
          date: dateText,
          amount: -Math.round(amount * 0.1 * 100) / 100,
          kind: "refund",
          memo: "Refund recorded",
          personId: "p-front-desk",
        });
      }
    }
    if (!missingDepositOffsets.has(offset)) {
      const skim = offset === 7 || offset === 35 ? 1.25 : 0;
      transactions.push({
        id: `tx-deposit-${dateText}`,
        date: dateText,
        amount: Math.round((payments - skim) * 100) / 100,
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
      date: dateKey(date),
      amount: index % 2 === 0 ? 25 : -15,
      kind: "adjustment",
      memo: "Adjustment review sample",
      personId: "p-front-desk",
    });
  }

  return transactions;
}
