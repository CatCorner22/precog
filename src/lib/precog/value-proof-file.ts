import {
  DEFAULT_VALUE_CASE,
  normalizeEnteredInputs,
  normalizeValueCase,
  type ValueCaseInputs,
  type ValueInputKey,
} from "./value-case";
import {
  MAX_VALUE_EVIDENCE_ITEMS,
  normalizeValueEvidence,
  type ValueEvidence,
} from "./value-evidence";
import { readValueProof, writeValueProof } from "./value-proof-store";
import { browserStorage, type StorageLike } from "./local-data";
import { localDateKey } from "./dates";

/**
 * A value proof file: one business's value case and evidence register, as
 * saved on this device, so the owner can keep a copy or carry it to another
 * device. The storage keys are unchanged; this only reads and writes them.
 */
export const VALUE_PROOF_FILE_FORMAT = "precog-value-proof";
export const VALUE_PROOF_FILE_VERSION = 1;
/** Larger than any real file: the evidence register holds at most 500 items. */
const MAX_VALUE_PROOF_FILE_BYTES = 512 * 1024;

export interface ValueProofFile {
  format: typeof VALUE_PROOF_FILE_FORMAT;
  version: typeof VALUE_PROOF_FILE_VERSION;
  businessName: string;
  exportedAt: string;
  /** The value case with the inputs the owner typed; null when the business has none saved. */
  valueCase: (ValueCaseInputs & { entered: ValueInputKey[] }) | null;
  valueEvidence: ValueEvidence[];
}

/** The figures as a file would hold them, from whatever this device has stored. */
function storedCase(raw: unknown): ValueProofFile["valueCase"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Partial<ValueCaseInputs> & { entered?: unknown };
  return { ...normalizeValueCase(value), entered: normalizeEnteredInputs(value.entered) };
}

/** Builds the download for one business: its file name and JSON content. */
export function buildValueProofFile(
  businessId: string,
  businessName: string,
  now: Date = new Date(),
  storage: StorageLike | null = browserStorage(),
): { fileName: string; content: string; file: ValueProofFile } {
  const stored = readValueProof(businessId, storage, { claimLegacy: false });
  const file: ValueProofFile = {
    format: VALUE_PROOF_FILE_FORMAT,
    version: VALUE_PROOF_FILE_VERSION,
    businessName: businessName.trim().slice(0, 200),
    exportedAt: now.toISOString(),
    valueCase: storedCase(stored.valueCase),
    valueEvidence: normalizeValueEvidence(stored.evidence),
  };
  const slug =
    businessName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "business";
  return {
    fileName: `${slug}-value-proof-${localDateKey(now)}.json`,
    content: `${JSON.stringify(file, null, 2)}\n`,
    file,
  };
}

/**
 * Reads a value proof file. Throws an Error whose message says plainly why
 * the file was refused; nothing is written until the whole file checks out.
 */
export function parseValueProofFile(text: string): ValueProofFile {
  if (new TextEncoder().encode(text).byteLength > MAX_VALUE_PROOF_FILE_BYTES) {
    throw new Error("That file is larger than any value proof file. Precog loaded nothing.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not a Precog value proof file. Precog loaded nothing.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("That file is not a Precog value proof file. Precog loaded nothing.");
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.format !== VALUE_PROOF_FILE_FORMAT) {
    throw new Error("That file is not a Precog value proof file. Precog loaded nothing.");
  }
  if (envelope.version !== VALUE_PROOF_FILE_VERSION) {
    throw new Error(
      "That value proof file comes from a newer version of Precog. Precog loaded nothing.",
    );
  }
  const rawCase = envelope.valueCase;
  if (rawCase !== null && (typeof rawCase !== "object" || Array.isArray(rawCase))) {
    throw new Error("That value proof file has no readable value case. Precog loaded nothing.");
  }
  if (!Array.isArray(envelope.valueEvidence)) {
    throw new Error("That value proof file has no evidence register. Precog loaded nothing.");
  }
  if (envelope.valueEvidence.length > MAX_VALUE_EVIDENCE_ITEMS) {
    throw new Error(
      `That file has ${envelope.valueEvidence.length.toLocaleString("en-US")} evidence items; the register holds at most ${MAX_VALUE_EVIDENCE_ITEMS}. Precog loaded nothing.`,
    );
  }
  return {
    format: VALUE_PROOF_FILE_FORMAT,
    version: VALUE_PROOF_FILE_VERSION,
    businessName: typeof envelope.businessName === "string" ? envelope.businessName : "",
    exportedAt: typeof envelope.exportedAt === "string" ? envelope.exportedAt : "",
    valueCase: storedCase(rawCase),
    valueEvidence: normalizeValueEvidence(envelope.valueEvidence),
  };
}

/**
 * Loads a value proof file into one business on this device, replacing its
 * value case and evidence register. A file with no value case loads the
 * Precog defaults, so nothing from before stays mixed in.
 */
export function loadValueProofFile(
  businessId: string,
  text: string,
  storage: StorageLike | null = browserStorage(),
): { ok: true; file: ValueProofFile } | { ok: false; reason: string } {
  let file: ValueProofFile;
  try {
    file = parseValueProofFile(text);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  const valueCase = file.valueCase ?? { ...DEFAULT_VALUE_CASE, entered: [] };
  const kept = writeValueProof(businessId, { valueCase, evidence: file.valueEvidence }, storage);
  if (!kept) {
    return {
      ok: false,
      reason: "This browser is not keeping data for this site, so Precog could not load the file.",
    };
  }
  return { ok: true, file: { ...file, valueCase } };
}
