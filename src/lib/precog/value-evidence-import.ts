import { MAX_VALUE_EVIDENCE_ITEMS, type ValueEvidence } from "./value-evidence";

/** The register after an import, and what the import did to it. */
interface EvidenceImport {
  items: ValueEvidence[];
  added: number;
  updated: number;
}

/**
 * Adds imported evidence to the register instead of replacing it. An imported
 * item with an id already in the register replaces that item in place; the
 * rest are added at the end. Throws when the result would exceed the
 * register's limit, so nothing is dropped silently.
 */
export function mergeImportedEvidence(
  current: readonly ValueEvidence[],
  imported: readonly ValueEvidence[],
): EvidenceImport {
  const incoming = new Map(imported.map((item) => [item.id, item]));
  const items = current.map((item) => incoming.get(item.id) ?? item);
  const known = new Set(current.map((item) => item.id));
  const fresh = imported.filter((item) => !known.has(item.id));
  const merged = [...items, ...fresh];
  if (merged.length > MAX_VALUE_EVIDENCE_ITEMS) {
    throw new Error(
      `Importing these ${imported.length} records would give the register ${merged.length}; it holds at most ${MAX_VALUE_EVIDENCE_ITEMS}. Precog imported nothing.`,
    );
  }
  return { items: merged, added: fresh.length, updated: imported.length - fresh.length };
}
