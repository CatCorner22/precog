export function decimalParts(value: string): [bigint, number] {
  const [mantissa, exponent = "0"] = value.toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  return [BigInt(whole + fraction), Number(exponent) - fraction.length];
}

export type Fraction = [bigint, bigint];

export function fraction(value: number): Fraction {
  const [n, power] = decimalParts(String(value));
  return power >= 0 ? [n * 10n ** BigInt(power), 1n] : [n, 10n ** BigInt(-power)];
}

export const multiply = ([a, b]: Fraction, [c, d]: Fraction): Fraction => [a * c, b * d];

export function finite([n, d]: Fraction) {
  if (n <= 0n) return 0;
  const places = Math.max(0, 32 + d.toString().length - n.toString().length);
  const digits = (n * 10n ** BigInt(places)) / d;
  const result = Number(`${digits}e-${places}`);
  if (!Number.isFinite(result)) throw new Error("The calculation exceeds the supported range.");
  return result;
}
