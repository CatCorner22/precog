import type { Signoff } from "./controlguard-risk";

const lapse = 336 * 60 * 60 * 1000;
const genesis = "0".repeat(64);
const fields = ["subject", "control", "signer", "actor", "cadence", "artifact"] as const;
type SignoffInput = Record<(typeof fields)[number], string>;

export type FridayEntry = SignoffInput & {
  seq: number;
  signed_at: string;
  prior_hash: string;
  hash: string;
};

type Unsigned = Omit<FridayEntry, "hash">;

async function digest(entry: Unsigned) {
  const ordered = Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)));
  const json = JSON.stringify(ordered).replace(
    /[\u007f-\uffff]/g,
    (char) => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"),
  );
  const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const timestamp = (now: Date) => now.toISOString().replace("Z", "000+00:00");

async function verify(entries: readonly FridayEntry[]) {
  let prior = genesis;
  let previous = "";
  for (const [index, { hash, ...entry }] of entries.entries()) {
    if (
      entry.seq !== index + 1 ||
      entry.prior_hash !== prior ||
      entry.signed_at < previous ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00$/.test(entry.signed_at) ||
      !Number.isFinite(Date.parse(entry.signed_at)) ||
      !fields.every((key) => typeof entry[key] === "string" && entry[key].trim()) ||
      hash !== (await digest(entry))
    ) {
      throw new Error("Ledger verification failed. No risk reduction applies.");
    }
    prior = hash;
    previous = entry.signed_at;
  }
}

export async function appendFridayEntry(
  entries: readonly FridayEntry[],
  input: SignoffInput,
  now: Date,
) {
  await verify(entries);
  if (!fields.every((key) => input[key].trim())) {
    throw new Error("Enter a subject, control, signer, reviewer, cadence and artifact.");
  }
  const head = entries.at(-1);
  const signed_at = timestamp(now);
  if (head && signed_at < head.signed_at)
    throw new Error("A new sign-off cannot predate the last one.");
  const entry = { ...input, seq: entries.length + 1, signed_at, prior_hash: head?.hash ?? genesis };
  return { ...entry, hash: await digest(entry) };
}

export async function readFridayLedger(
  entries: readonly FridayEntry[],
  now: Date,
): Promise<Signoff> {
  await verify(entries);
  const current = now.getTime();
  return (subject, control) => {
    let index = entries.length - 1;
    while (
      index >= 0 &&
      (entries[index].subject !== subject || entries[index].control !== control)
    ) {
      index--;
    }
    const entry = entries[index];
    if (!entry) return ["no_signoff", null];
    const age = current - Date.parse(entry.signed_at);
    return [age < 0 ? "future_signoff" : age < lapse ? "active" : "lapsed", entry.signed_at];
  };
}
