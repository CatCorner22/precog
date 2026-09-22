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

export const VALUE_EVIDENCE_VERSION = 1;
export const MAX_VALUE_EVIDENCE_IMPORT_BYTES = 128_000;
export const VALUE_EVIDENCE_STORAGE_KEY = "precog-value-evidence-v1";

const KINDS = new Set<ValueEvidenceKind>(["time", "recovery", "control", "exception"]);

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function validDate(value: unknown) {
  const candidate = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return "";
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : "";
}

export function normalizeValueEvidence(value: unknown): ValueEvidence[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const result: ValueEvidence[] = [];
  for (const candidate of value.slice(0, 100)) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    const id = text(item.id, 80);
    const description = text(item.description, 240);
    const kind = item.kind as ValueEvidenceKind;
    if (!id || ids.has(id) || !description || !KINDS.has(kind)) continue;
    ids.add(id);
    const numeric = Number(item.amount);
    const source = text(item.source, 240);
    result.push({
      id,
      kind,
      description,
      source,
      amount: Number.isFinite(numeric) ? Math.max(0, Math.min(1_000_000_000, numeric)) : 0,
      observedAt: validDate(item.observedAt),
      verified: item.verified === true && Boolean(source),
    });
  }
  return result;
}

export function summarizeValueEvidence(items: ValueEvidence[]) {
  const verified = items.filter((item) => item.verified);
  return {
    total: items.length,
    verified: verified.length,
    recoveries: verified
      .filter((item) => item.kind === "recovery")
      .reduce((sum, item) => sum + item.amount, 0),
    hours: verified
      .filter((item) => item.kind === "time")
      .reduce((sum, item) => sum + item.amount, 0),
    completion: items.length ? Math.round((verified.length / items.length) * 100) : 0,
  };
}

export function formatEvidenceAmount(item: Pick<ValueEvidence, "kind" | "amount">) {
  if (item.kind === "recovery") return `$${item.amount.toLocaleString("en-US")}`;
  if (item.kind === "time") return `${item.amount.toLocaleString("en-US")} hrs`;
  return `${item.amount.toLocaleString("en-US")} ${item.amount === 1 ? "item" : "items"}`;
}

export function assessEvidenceQuality(items: ValueEvidence[], asOf: Date = new Date()) {
  const cutoff = new Date(asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const asOfDate = asOf.toISOString().slice(0, 10);
  const unsourced = items.filter((item) => !item.source).length;
  const stale = items.filter((item) => !item.observedAt || item.observedAt < cutoffDate).length;
  const future = items.filter((item) => item.observedAt > asOfDate).length;
  const verified = items.filter(
    (item) =>
      item.verified && item.source && item.observedAt >= cutoffDate && item.observedAt <= asOfDate,
  ).length;
  return {
    unsourced,
    stale,
    future,
    verified,
    score: items.length ? Math.round((verified / items.length) * 100) : 0,
  };
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
  return normalizeValueEvidence(envelope.evidence);
}
