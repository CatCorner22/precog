/**
 * Procedures name where a password or combination is kept, never the secret
 * itself. This finds text that looks like one so the editor can warn before
 * it is saved. It is a warning, not a guarantee: it cannot recognise every
 * secret, and it never blocks a save.
 */

export type SecretKind = "password" | "card" | "ssn" | "token";

export interface LikelySecret {
  kind: SecretKind;
  /** Where the match starts in the text. */
  index: number;
  length: number;
}

export const SECRET_WARNING: Record<SecretKind, string> = {
  password:
    "This looks like a password, PIN or combination. Name where it is kept (for example the password-manager entry), never the secret itself.",
  card: 'This looks like a card number. Name the card (for example "the office Visa ending 4417") instead.',
  ssn: "This looks like a Social Security number. Leave it out of the procedure.",
  token: "This looks like an access key or code. Name where it is kept instead.",
};

// "password: hunter2", "PIN is 4417", "combination = 12-34-56", "passcode - 0000"
const SECRET_LABEL =
  /\b(?:password|passwd|passcode|pass code|pwd|pin|pin number|combination|combo|access code|login code|security code)\s*(?::|=|\bis\b|-)\s*(?!where\b|kept\b|in\b|on\b|stored\b|the\b|a\b|an\b|from\b)[^\s,;.]{3,}/gi;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;
// A long run of letters and digits mixed, as API keys and recovery codes are.
const TOKEN = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g;

/** Everything in `text` that looks like a secret, in order. */
export function findLikelySecrets(text: string): LikelySecret[] {
  const found: LikelySecret[] = [];
  const add = (kind: SecretKind, m: RegExpMatchArray) =>
    found.push({ kind, index: m.index ?? 0, length: m[0].length });
  for (const m of text.matchAll(SECRET_LABEL)) add("password", m);
  for (const m of text.matchAll(SSN)) add("ssn", m);
  for (const m of text.matchAll(CARD_CANDIDATE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) add("card", m);
  }
  for (const m of text.matchAll(TOKEN)) add("token", m);
  return found.sort((a, b) => a.index - b.index);
}

/** The distinct kinds of secret in any of `texts`, for one warning per kind. */
export function secretKindsIn(texts: readonly string[]): SecretKind[] {
  const kinds = new Set<SecretKind>();
  for (const t of texts) for (const s of findLikelySecrets(t)) kinds.add(s.kind);
  return [...kinds];
}

/** Replace every likely secret with "[removed]", for text that leaves the browser. */
export function maskLikelySecrets(text: string): string {
  let out = "";
  let at = 0;
  for (const s of findLikelySecrets(text)) {
    if (s.index < at) continue;
    out += text.slice(at, s.index) + "[removed]";
    at = s.index + s.length;
  }
  return out + text.slice(at);
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
