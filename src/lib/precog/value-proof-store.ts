import { VALUE_CASE_STORAGE_KEY } from "./value-case";
import { VALUE_EVIDENCE_STORAGE_KEY } from "./value-evidence";
import {
  browserStorage,
  readLocal,
  readLocalJson,
  removeLocal,
  writeLocal,
  type StorageLike,
} from "./local-data";

/**
 * Each business keeps its own value case and evidence on this device. Before
 * this, one browser-wide pair of keys held them, so every business showed and
 * overwrote the same figures.
 */
export function valueProofKeys(businessId: string): { valueCase: string; evidence: string } {
  return {
    valueCase: `${VALUE_CASE_STORAGE_KEY}.${businessId}`,
    evidence: `${VALUE_EVIDENCE_STORAGE_KEY}.${businessId}`,
  };
}

/** What is stored for one business, as parsed JSON (the caller normalises it); undefined when absent. */
export interface StoredValueProof {
  valueCase: unknown;
  evidence: unknown;
}

/**
 * Reads one business's value proof. The first business to read after the
 * upgrade takes over the old browser-wide copy: it is written under that
 * business's keys, and the old keys are removed only once that write has
 * succeeded, so the figures are never lost.
 */
export function readValueProof(
  businessId: string,
  storage: StorageLike | null = browserStorage(),
): StoredValueProof {
  const keys = valueProofKeys(businessId);
  const own = {
    valueCase: readLocalJson(keys.valueCase, storage),
    evidence: readLocalJson(keys.evidence, storage),
  };
  if (own.valueCase !== undefined || own.evidence !== undefined) return own;

  const legacyCase = readLocal(VALUE_CASE_STORAGE_KEY, storage);
  const legacyEvidence = readLocal(VALUE_EVIDENCE_STORAGE_KEY, storage);
  if (legacyCase === null && legacyEvidence === null) return own;
  const moved =
    (legacyCase === null || writeLocal(keys.valueCase, legacyCase, storage)) &&
    (legacyEvidence === null || writeLocal(keys.evidence, legacyEvidence, storage));
  if (moved) {
    removeLocal(VALUE_CASE_STORAGE_KEY, storage);
    removeLocal(VALUE_EVIDENCE_STORAGE_KEY, storage);
  }
  return { valueCase: parse(legacyCase), evidence: parse(legacyEvidence) };
}

/** Stores one business's value proof; false when the browser refuses either write. */
export function writeValueProof(
  businessId: string,
  value: { valueCase: unknown; evidence: unknown },
  storage: StorageLike | null = browserStorage(),
): boolean {
  const keys = valueProofKeys(businessId);
  const caseKept = writeLocal(keys.valueCase, JSON.stringify(value.valueCase), storage);
  const evidenceKept = writeLocal(keys.evidence, JSON.stringify(value.evidence), storage);
  return caseKept && evidenceKept;
}

/** Drops one business's value proof, when the business itself is removed from this device. */
export function removeValueProof(
  businessId: string,
  storage: StorageLike | null = browserStorage(),
): void {
  const keys = valueProofKeys(businessId);
  removeLocal(keys.valueCase, storage);
  removeLocal(keys.evidence, storage);
}

function parse(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
