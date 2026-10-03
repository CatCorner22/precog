import { isCalendarDate, dateAfter, localDateKey } from "./dates";
import { formatUsd } from "../utils";
import { clamp } from "./number";
import { readText } from "./profile-entries";

export type ValueEvidenceKind = "time" | "recovery" | "control" | "exception";

export type ValueEvidence = {
  id: string;
  kind: ValueEvidenceKind;
  description: string;
  source: string;
  amount: number;
  observedAt: string;
  verified: boolean;
};

/** The evidence the Value screen counts and the register's readiness score. */
export interface EvidenceSummary {
  total: number;
  verified: number;
  /** Dollars recovered, from verified recovery items. */
  recoveries: number;
  /** Hours returned, from verified time items. */
  hours: number;
  unsourced: number;
  /** Items with no date or a date older than the twelve-month window. */
  stale: number;
  future: number;
  /** Share of items that are verified observations, 0 to 100. */
  score: number;
}

export const VALUE_EVIDENCE_STORAGE_KEY = "precog-value-evidence-v1";

/**
 * Most evidence items a register holds. An import with more is refused with a
 * message rather than cut short; the register UI should stop adding at this
 * count.
 */
export const MAX_VALUE_EVIDENCE_ITEMS = 500;

/** Plain names for each kind of evidence, for the memo and the register. */
export const VALUE_EVIDENCE_KIND_LABEL: Record<ValueEvidenceKind, string> = {
  time: "Hours returned per year",
  recovery: "Money recovered",
  control: "Control change",
  exception: "Exception",
};

export function normalizeValueEvidence(value: unknown): ValueEvidence[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const result: ValueEvidence[] = [];
  for (const candidate of value.slice(0, MAX_VALUE_EVIDENCE_ITEMS)) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    const id = readText(item.id, 80);
    const description = readText(item.description, 240);
    const kind = item.kind as ValueEvidenceKind;
    if (!id || ids.has(id) || !description || !KINDS.has(kind)) continue;
    ids.add(id);
    const numeric = Number(item.amount);
    const source = readText(item.source, 240);
    result.push({
      id,
      kind,
      description,
      source,
      amount: Number.isFinite(numeric) ? clamp(numeric, 0, 1_000_000_000) : 0,
      observedAt: validDate(item.observedAt),
      verified: item.verified === true && Boolean(source),
    });
  }
  return result;
}

/**
 * One summary for the totals the Value screen applies and the readiness score
 * the register shows, both counted with isVerifiedObservation.
 */
export function summarizeValueEvidence(
  items: ValueEvidence[],
  asOf: Date = new Date(),
): EvidenceSummary {
  const { cutoffDate, asOfDate } = observationWindow(asOf);
  const verified = items.filter((item) => isVerifiedObservation(item, asOf));
  const sum = (kind: ValueEvidenceKind) =>
    verified.filter((item) => item.kind === kind).reduce((total, item) => total + item.amount, 0);
  return {
    total: items.length,
    verified: verified.length,
    // Dollars to the cent, so $100.10 and $200.20 add up to the $300.30 an
    // owner types, not to a float a hair below it.
    recoveries: Math.round(sum("recovery") * 100) / 100,
    hours: sum("time"),
    unsourced: items.filter((item) => !item.source).length,
    stale: items.filter((item) => !item.observedAt || item.observedAt < cutoffDate).length,
    future: items.filter((item) => item.observedAt > asOfDate).length,
    score: items.length ? Math.round((verified.length / items.length) * 100) : 0,
  };
}

export function formatEvidenceAmount(item: Pick<ValueEvidence, "kind" | "amount">) {
  if (item.kind === "recovery") return formatUsd(item.amount);
  if (item.kind === "time") return `${item.amount.toLocaleString("en-US")} hrs`;
  return `${item.amount.toLocaleString("en-US")} ${item.amount === 1 ? "item" : "items"}`;
}

export function serializeValueEvidence(items: ValueEvidence[], exportedAt: Date = new Date()) {
  return JSON.stringify(
    {
      version: VALUE_EVIDENCE_VERSION,
      exportedAt: exportedAt.toISOString(),
      evidence: normalizeValueEvidence(items),
    },
    null,
    2,
  );
}

export function parseValueEvidence(input: string) {
  if (new TextEncoder().encode(input).byteLength > MAX_VALUE_EVIDENCE_IMPORT_BYTES) {
    throw new Error("Evidence file exceeds 128 KB");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("Evidence file is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Evidence file is malformed");
  const envelope = parsed as Record<string, unknown>;
  if (envelope.version !== VALUE_EVIDENCE_VERSION) throw new Error("Unsupported evidence version");
  if (!Array.isArray(envelope.evidence)) throw new Error("Evidence file has no evidence register");
  if (envelope.evidence.length > MAX_VALUE_EVIDENCE_ITEMS) {
    throw new Error(
      `Evidence file has ${envelope.evidence.length.toLocaleString("en-US")} records; the register holds at most ${MAX_VALUE_EVIDENCE_ITEMS}. Precog imported nothing.`,
    );
  }
  return normalizeValueEvidence(envelope.evidence);
}

/**
 * One rule for what counts as a verified observation, shared by the totals
 * the Value screen applies and the quality score the register shows: the
 * item is marked verified, names a source, and carries a valid observation
 * date inside the window (not missing, not in the future, not older than
 * twelve months). A record imported with the verified flag but no usable
 * date keeps the flag, so the owner can fix the date, but it counts nowhere
 * until they do.
 */
function isVerifiedObservation(item: ValueEvidence, asOf: Date = new Date()): boolean {
  const { cutoffDate, asOfDate } = observationWindow(asOf);
  return (
    item.verified &&
    Boolean(item.source) &&
    Boolean(item.observedAt) &&
    item.observedAt >= cutoffDate &&
    item.observedAt <= asOfDate
  );
}

function observationWindow(asOf: Date) {
  return {
    cutoffDate: dateAfter(asOf, -OBSERVATION_WINDOW_DAYS),
    asOfDate: localDateKey(asOf),
  };
}

function validDate(value: unknown) {
  const candidate = String(value);
  return isCalendarDate(candidate) ? candidate : "";
}

const VALUE_EVIDENCE_VERSION = 1;
const MAX_VALUE_EVIDENCE_IMPORT_BYTES = 128_000;
const KINDS = new Set<ValueEvidenceKind>(["time", "recovery", "control", "exception"]);

/** The observation window: evidence counts as observed for twelve months. */
const OBSERVATION_WINDOW_DAYS = 365;
