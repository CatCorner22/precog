/**
 * Process-level continuity record: how often a process runs, which systems it
 * lives in, and whether a stand-in could find a written procedure for it.
 *
 * Pure functions over ProcessNode. Shared by the builder form, map validation,
 * map health, CSV import/export, and Pioneer's continuity tool so every surface
 * reads the same fields the same way.
 */
import type { ProcessCadence, ProcessNode } from "./types";

export const PROCESS_CADENCES: readonly ProcessCadence[] = [
  "continuous",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "annual",
  "ad-hoc",
] as const;

export const CADENCE_LABEL: Record<ProcessCadence, string> = {
  continuous: "Continuous (all day)",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  "ad-hoc": "Ad hoc / as needed",
};

/**
 * Days before an owner's absence starts to hurt, by cadence. Used to rank which
 * undocumented processes matter first: a daily deposit stops on day one, an
 * annual renewal can wait for the owner to return.
 */
const CADENCE_STOP_DAYS: Record<ProcessCadence, number> = {
  continuous: 0,
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  annual: 365,
  "ad-hoc": 14,
};

/** Same vocabulary as KnowledgeItem documentation in continuity/coverage.ts. */
export type ProcessDocumentationState = "none" | "unlocated" | "located";

export const PROCESS_DOCUMENTATION_LABEL: Record<ProcessDocumentationState, string> = {
  none: "Nothing written down",
  unlocated: "Written, location not recorded",
  located: "Written and findable",
};

/** Accepts common spellings from spreadsheets and forms; undefined when unrecognised. */
export function parseCadence(value: string | undefined | null): ProcessCadence | undefined {
  const v = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (!v) return undefined;
  const aliases: Record<string, ProcessCadence> = {
    continuous: "continuous",
    constant: "continuous",
    "all-day": "continuous",
    hourly: "continuous",
    daily: "daily",
    day: "daily",
    "every-day": "daily",
    weekly: "weekly",
    week: "weekly",
    biweekly: "weekly",
    "bi-weekly": "weekly",
    fortnightly: "weekly",
    monthly: "monthly",
    month: "monthly",
    quarterly: "quarterly",
    quarter: "quarterly",
    annual: "annual",
    annually: "annual",
    yearly: "annual",
    year: "annual",
    "ad-hoc": "ad-hoc",
    adhoc: "ad-hoc",
    "as-needed": "ad-hoc",
    "on-demand": "ad-hoc",
    occasional: "ad-hoc",
  };
  return aliases[v];
}

export function processDocumentationState(p: ProcessNode): ProcessDocumentationState {
  if (!p.documented) return "none";
  return p.procedureLocation?.trim() ? "located" : "unlocated";
}

/** Normalise a free-text list of systems: trim, drop blanks, dedupe case-insensitively, cap length. */
export function normalizeSystems(values: readonly string[] | undefined, max = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values ?? []) {
    const v = raw.trim().slice(0, 40);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

interface ProcessRecordGap {
  process: ProcessNode;
  state: Exclude<ProcessDocumentationState, "located">;
  /** Days until the process stops mattering to a stand-in; lower = more urgent. */
  stopsWithinDays: number;
  /** Nobody is assigned, so there is no one to ask where the procedure lives. */
  unowned: boolean;
  /** Written and ordered "document this" / "record where it lives" instruction. */
  nextStep: string;
}

export interface ProcessRecordReport {
  total: number;
  counts: Record<ProcessDocumentationState, number>;
  /** 0–100, share of processes with a written, findable procedure. 100 when there are no processes. */
  documentedIndex: number;
  /** Processes with no cadence recorded — the continuity view cannot say when they stop. */
  cadenceUnknown: number;
  /** Most urgent first: undocumented before unlocated, then sooner-stopping cadence, then unowned. */
  gaps: ProcessRecordGap[];
}

const STATE_URGENCY: Record<ProcessDocumentationState, number> = {
  none: 2,
  unlocated: 1,
  located: 0,
};

export function processRecordReport(processes: readonly ProcessNode[]): ProcessRecordReport {
  const counts: Record<ProcessDocumentationState, number> = { none: 0, unlocated: 0, located: 0 };
  const gaps: ProcessRecordGap[] = [];
  let cadenceUnknown = 0;
  for (const p of processes) {
    const state = processDocumentationState(p);
    counts[state] += 1;
    if (!p.cadence) cadenceUnknown += 1;
    if (state === "located") continue;
    const stopsWithinDays = p.cadence ? CADENCE_STOP_DAYS[p.cadence] : CADENCE_STOP_DAYS["ad-hoc"];
    const unowned = !(p.ownerPersonIds ?? []).length;
    gaps.push({
      process: p,
      state,
      stopsWithinDays,
      unowned,
      nextStep:
        state === "none"
          ? `Write down how "${p.name}" is done${p.systems?.length ? ` in ${p.systems.join(", ")}` : ""} so a stand-in can run it${unowned ? ", and assign an owner" : ""}.`
          : `Record where the written procedure for "${p.name}" lives so a stand-in can find it.`,
    });
  }
  gaps.sort(
    (a, b) =>
      STATE_URGENCY[b.state] - STATE_URGENCY[a.state] ||
      a.stopsWithinDays - b.stopsWithinDays ||
      Number(b.unowned) - Number(a.unowned) ||
      a.process.name.localeCompare(b.process.name),
  );
  const total = processes.length;
  return {
    total,
    counts,
    documentedIndex: total === 0 ? 100 : Math.round((counts.located / total) * 100),
    cadenceUnknown,
    gaps,
  };
}
