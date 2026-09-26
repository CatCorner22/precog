export const BENFORD_FIRST = Array.from({ length: 9 }, (_, index) => {
  const digit = index + 1;
  return Math.log10(1 + 1 / digit);
});

export const BENFORD_SECOND = Array.from({ length: 10 }, (_, digit) =>
  Array.from({ length: 9 }, (_, index) => {
    const leading = index + 1;
    return Math.log10(1 + 1 / (10 * leading + digit));
  }).reduce((sum, probability) => sum + probability, 0),
);

export const BENFORD_MIN_SAMPLE = 100;
export const BENFORD_SECOND_MIN_SAMPLE = 300;

function significantDigits(amount: number): string | null {
  if (!Number.isFinite(amount) || amount === 0) return null;
  const source = Math.abs(amount).toString().toLowerCase();
  const [coefficient, exponentText] = source.split("e");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + exponent;
  const expanded =
    decimalIndex <= 0
      ? `0.${"0".repeat(-decimalIndex)}${digits}`
      : decimalIndex >= digits.length
        ? `${digits}${"0".repeat(decimalIndex - digits.length)}`
        : `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  const significant = expanded.replace(/\D/g, "").replace(/^0+/, "");
  return significant || null;
}

export function firstDigit(amount: number): number | null {
  const digits = significantDigits(amount);
  return digits ? Number(digits[0]) : null;
}

/**
 * The second significant digit, or null for an amount with only one (7, 0.4).
 * A round amount has a second digit of 0 (700 → 0), and counting those zeros
 * is what lets the test see an excess of round amounts.
 */
export function secondDigit(amount: number): number | null {
  const digits = significantDigits(amount);
  if (!digits || digits.length < 2) return null;
  return Number(digits[1]);
}

export interface DigitTest {
  digits: number[];
  observed: number[];
  expected: number[];
  n: number;
  chiSquare: number;
  df: number;
  pValueBand: "<0.01" | "<0.05" | ">=0.05";
  mad: number;
  conformity: "close" | "acceptable" | "marginal" | "nonconformity";
}

function testDigits(
  amounts: number[],
  digitFn: (amount: number) => number | null,
  expected: number[],
  df: number,
  thresholds: [number, number, number],
): DigitTest {
  const counts = Array.from({ length: expected.length }, () => 0);
  for (const amount of amounts) {
    const digit = digitFn(amount);
    if (digit !== null) counts[expected.length === 9 ? digit - 1 : digit]++;
  }
  const n = counts.reduce((sum, count) => sum + count, 0);
  const observed = n === 0 ? counts.map(() => 0) : counts.map((count) => count / n);
  const chiSquare =
    n === 0
      ? 0
      : expected.reduce((sum, probability, index) => {
          const expectedCount = n * probability;
          return sum + (counts[index] - expectedCount) ** 2 / expectedCount;
        }, 0);
  const mad =
    observed.reduce((sum, proportion, index) => sum + Math.abs(proportion - expected[index]), 0) /
    expected.length;
  const conformity =
    mad <= thresholds[0]
      ? "close"
      : mad <= thresholds[1]
        ? "acceptable"
        : mad <= thresholds[2]
          ? "marginal"
          : "nonconformity";
  const [critical05, critical01] = df === 8 ? [15.507, 20.09] : [16.919, 21.666];
  const pValueBand =
    chiSquare >= critical01 ? "<0.01" : chiSquare >= critical05 ? "<0.05" : ">=0.05";

  return {
    digits: Array.from(
      { length: expected.length },
      (_, index) => index + (expected.length === 9 ? 1 : 0),
    ),
    observed,
    expected,
    n,
    chiSquare,
    df,
    pValueBand,
    mad,
    conformity,
  };
}

export function benfordFirstDigit(amounts: number[]): DigitTest {
  return testDigits(amounts, firstDigit, BENFORD_FIRST, 8, [0.006, 0.012, 0.015]);
}

export function benfordSecondDigit(amounts: number[]): DigitTest {
  return testDigits(amounts, secondDigit, BENFORD_SECOND, 9, [0.008, 0.01, 0.012]);
}
