import { normalizeInsuranceRecord } from "./scoring/insurance-record";
import type { SavedProcessBlock } from "./builder/process-blocks";
import { isCalendarDate, localDateKey } from "./dates";
import { soleOwnerCriticalCount, type CoverageStatus } from "./continuity/coverage";
import type { ContinuityStep } from "./decisions/follow-through";
import { type DocumentationState } from "./continuity/documentation";
import type {
  KnowledgeItem,
  KnowledgeRelation,
  Person,
  ProcessNode,
  StaffComposition,
} from "./types";
import { getIndustryTemplate } from "./templates";
import { resolveTemplate } from "./active-template";
import {
  DEFAULT_RISK_VARIABLES,
  VARIABLE_CATALOG,
  type RiskVariableState,
} from "./scoring/dynamic-variables";
import {
  defaultDualReleasePolicy,
  mergeDualReleasePolicy,
  type DualReleasePolicy,
} from "./controls/dual-release";
import { isDemoName, isIndustryId, type IndustryId } from "./industry";
import { isBusinessId } from "./profile-input";
import { normalizeEngagement, type EngagementStamp } from "./firm/engagement";
import { normalizeReviewRecords, type ReviewRecord } from "./firm/reviews";
import { normalizeAccessReconciliation, type AccessReconciliation } from "./firm/reconcile";
import { browserStorage, readLocal, writeLocal, type StorageLike } from "./local-data";
import { uid } from "./text";
import { boundedNumber } from "./number";
import {
  healthPointEntries,
  isRecord,
  knowledgeEntries,
  mapLayoutEntries,
  mapVersionEntries,
  peopleEntries,
  processEntries,
  relationEntries,
  savedBlockEntries,
} from "./profile-entries";
import { DEFAULT_BUSINESS_ID } from "./business-id";

/**
 * One business: what it is, the owner's own team, map and register (or null
 * for the industry sample's), their settings, journal and records. This file
 * holds the type, its defaults, the normaliser every stored copy goes
 * through, and this browser's portfolio of businesses.
 */
export interface PracticeProfile {
  practiceName: string;
  industry: IndustryId;
  staff: StaffComposition;
  riskVariables: RiskVariableState;
  dualRelease: DualReleasePolicy;
  decisions: DecisionEntry[];
  /** False on first visit until the user picks an industry template. */
  onboardingComplete?: boolean;
  /** User-built process map. Null/undefined = use the industry template as-is. */
  customProcesses?: ProcessNode[] | null;
  /** The user's real team. Null/undefined = template demo people. */
  customPeople?: Person[] | null;
  /** The business's own duty/task/knowledge register. Null/undefined = template items. */
  customKnowledge?: KnowledgeItem[] | null;
  /** Who holds each register item, at what level. Null/undefined = template relations. */
  customRelations?: KnowledgeRelation[] | null;
  /** Known leave, so continuity advice can warn ahead of it. */
  plannedAbsences?: PlannedAbsence[];
  /** People who have left, and whether the owner has confirmed their pay and logins are stopped. */
  leaverAccessChecks?: LeaverAccessCheck[];
  /** Pinned canvas positions for process nodes (from drag in build mode). */
  mapLayout?: Record<string, { x: number; y: number }>;
  /** User-saved process blocks for reuse in the map builder. */
  savedProcessBlocks?: SavedProcessBlock[];
  /** Map health score snapshots over time (newest last). */
  mapHealthHistory?: MapHealthPoint[];
  /** Named snapshots of the map for restore/compare (newest first). */
  mapVersions?: MapVersion[];
  /** Stable id of this business within the user's portfolio. */
  businessId?: string;
  /** Pilot stamps: when the owner's team was started, when the map was complete, when the report was sent. */
  engagement?: EngagementStamp;
  /** Monthly close results. A later result is appended; earlier ones stay. */
  monthlyReviews?: ReviewRecord[];
  /** Read-only user and vendor export compared with the duty map. */
  accessReconciliation?: AccessReconciliation;
  updatedAt: string;
}

/** One line of the business switcher. */
export interface BusinessSummary {
  id: string;
  name: string;
  industry: IndustryId;
  updatedAt: string;
  processCount: number;
  healthScore: number | null;
  /** True for a firm colleague's client rather than the account's own business. */
  shared?: boolean;
}

export interface MapVersion {
  id: string;
  name: string;
  createdAt: string;
  healthScore: number;
  processes: ProcessNode[];
  people: Person[];
  layout: Record<string, { x: number; y: number }>;
}

export interface MapHealthPoint {
  at: string;
  score: number;
}

// ── Journal ────────────────────────────────────────────────────────────────

export type DecisionKind = "accept_residual" | "remediate" | "monitor" | "insure";

export const DECISION_KIND_LABEL: Record<DecisionKind, string> = {
  accept_residual: "Accept residual",
  remediate: "Remediate",
  monitor: "Monitor",
  insure: "Transfer / insure",
};

/** Most journal entries kept, newest first. */
export const MAX_DECISIONS = 100;
/** Longest decision subject, in characters. */
export const MAX_DECISION_SUBJECT = 120;
/** Longest decision note, in characters. */
export const MAX_DECISION_NOTE = 800;

export interface DecisionEntry {
  id: string;
  createdAt: string;
  subject: string;
  kind: DecisionKind;
  note: string;
  reviewBy?: string;
  residualAtDecision?: number;
  linkedTab?: string;
  linkedId?: string;
  /** Industry template `linkedId` belongs to; templates reuse ids, so links are only followed under the same industry. */
  linkedIndustry?: IndustryId;
  /** Which continuity step this tracks when `linkedTab` is "knowledge"; older entries default to "cover". */
  linkedStep?: ContinuityStep;
  /** The person a "cover" step set out to train, so closing it as done can update their level on the register. */
  linkedPersonId?: string;
  /** The planned absence a "handoff" step was logged for; hand-offs are temporary, so one does not stand in for later leave. */
  linkedAbsenceId?: string;
  snapshot?: DecisionSnapshot;
  reviews?: DecisionReview[];
  status?: "open" | "closed";
}

export type DecisionReviewOutcome = "done" | "still_open" | "no_longer_relevant";

export interface DecisionReview {
  at: string;
  outcome: DecisionReviewOutcome;
  note?: string;
  snapshot: DecisionSnapshot;
}

export interface DecisionSnapshot {
  at: string;
  scoringVersion: string;
  averageResidual: number;
  subjectResidual?: number;
  sodOpenConflicts: number;
  segregationHealth: number;
  continuity?: ContinuitySnapshot;
}

/** Continuity coverage at the moment a knowledge-linked decision was logged or reviewed. */
export interface ContinuitySnapshot {
  /** `CoverageReport.coverageIndex`, 0–100. */
  coverageIndex: number;
  /** `CoverageReport.singlePoints.length`: critical/important items one absence away from stopping. */
  singlePoints: number;
  /** Coverage of the linked item; absent when the item is no longer on the register. */
  itemStatus?: CoverageStatus;
  /** How far the linked item is written down; absent when it is no longer on the register. */
  itemDocumentation?: DocumentationState;
}

// ── Leave and leavers ──────────────────────────────────────────────────────

/**
 * Known leave: who is away and for which calendar days (inclusive, in the
 * owner's local calendar). Scoped to an industry because template people
 * reuse ids (p1, p2, …) across industries.
 */
export interface PlannedAbsence {
  id: string;
  personId: string;
  industry: IndustryId;
  from: string;
  to: string;
  note?: string;
  /** Recorded on the day rather than planned ahead — sick, family emergency, no-show. */
  unplanned?: boolean;
  /** Calendar day the owner debriefed (or dismissed) this leave once it ended; unset while the debrief is still due. */
  debriefedAt?: string;
}

/**
 * Someone who has left: a pasted roster left them out as terminated or
 * inactive, or the owner marked them as left. Until the owner confirms they
 * are off payroll and their logins are removed, the check stays open. Kept
 * after confirming (with the day), so a later import of the same roster does
 * not ask again. See continuity/access-removal.ts.
 */
export interface LeaverAccessCheck {
  id: string;
  /** The team member, when they stay on the team marked as left. */
  personId?: string;
  name: string;
  role?: string;
  industry: IndustryId;
  /** Calendar day the app noted they had left. */
  notedOn: string;
  /** How the app learned: a pasted or imported roster, or the owner marking them as left. */
  source: "roster" | "marked";
  /** The owner has seen the prompt for this person; it is not shown again. */
  prompted?: true;
  /** Calendar day the owner confirmed payroll and logins; unset while open. */
  confirmedOn?: string;
}

/** Most leaver checks kept per business; the oldest confirmed ones go first. */
export const MAX_LEAVER_CHECKS = 300;

// ── Defaults and the normaliser ────────────────────────────────────────────

export function defaultProfile(industry: IndustryId = "dental"): PracticeProfile {
  const tpl = getIndustryTemplate(industry);
  // The sole-owner count is read from the sample's own register, as it is for
  // an owner's register, not from a preset that can disagree with it.
  const staff = { ...tpl.staffComposition, soleOwnerKnowledgeCount: soleOwnerCriticalCount(tpl) };
  const dualRelease = defaultDualReleasePolicy(tpl, staff);
  return {
    practiceName: tpl.businessName,
    industry,
    staff,
    riskVariables: withRiskFlags(DEFAULT_RISK_VARIABLES, staff),
    dualRelease,
    decisions: [],
    onboardingComplete: true,
    customProcesses: null,
    customPeople: null,
    customKnowledge: null,
    customRelations: null,
    plannedAbsences: [],
    mapLayout: {},
    savedProcessBlocks: [],
    mapHealthHistory: [],
    mapVersions: [],
    businessId: makeBusinessId(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * A stored business made safe to open: every field typed and bounded, every
 * list entry checked (see profile-entries), anything missing or malformed
 * replaced by the industry's default. `today` is the calendar day register
 * confirmations may not be later than: the owner's local day by default,
 * the day the client sent when a server normalises.
 */
export function normalizeProfile(
  input: Partial<PracticeProfile>,
  options: { onboardingCompleteFallback?: boolean; today?: string } = {},
): PracticeProfile {
  const parsed = record(input) as Partial<PracticeProfile>;
  const industry = isIndustryId(parsed.industry) ? parsed.industry : "dental";
  const base = defaultProfile(industry);
  const staff = normalizeStaff(parsed.staff, base.staff);
  const customProcesses = processEntries(parsed.customProcesses);
  const customPeople = peopleEntries(parsed.customPeople);
  const customKnowledge = normalizeCustomKnowledge(
    knowledgeEntries(parsed.customKnowledge),
    options.today ?? localDateKey(new Date()),
  );
  const customRelations = relationEntries(parsed.customRelations);
  const dualRelease = mergeDualReleasePolicy(
    resolveTemplate({
      industry,
      customProcesses,
      customPeople,
      customKnowledge,
      customRelations,
    }),
    parsed.dualRelease as DualReleasePolicy | undefined,
    staff,
  );
  // A stored policy's master switch wins; without one it follows the staff flag.
  if (!parsed.dualRelease) {
    dualRelease.enabled = staff.dualControlPayments;
  } else {
    staff.dualControlPayments = dualRelease.enabled;
  }
  return {
    industry,
    practiceName:
      typeof parsed.practiceName === "string"
        ? parsed.practiceName.trim().slice(0, 80) || base.practiceName
        : base.practiceName,
    staff,
    riskVariables: withRiskFlags(
      normalizeRiskVariables(parsed.riskVariables, base.riskVariables),
      staff,
    ),
    dualRelease,
    decisions: normalizeDecisions(parsed.decisions),
    onboardingComplete:
      typeof parsed.onboardingComplete === "boolean"
        ? parsed.onboardingComplete
        : (options.onboardingCompleteFallback ?? true),
    customProcesses,
    customPeople,
    customKnowledge,
    customRelations,
    plannedAbsences: normalizePlannedAbsences(parsed.plannedAbsences),
    leaverAccessChecks: normalizeLeaverAccessChecks(parsed.leaverAccessChecks),
    mapLayout: mapLayoutEntries(parsed.mapLayout),
    savedProcessBlocks: savedBlockEntries(parsed.savedProcessBlocks),
    mapHealthHistory: healthPointEntries(parsed.mapHealthHistory),
    mapVersions: mapVersionEntries(parsed.mapVersions),
    businessId: isBusinessId(parsed.businessId) ? parsed.businessId : base.businessId,
    engagement: normalizeEngagement(parsed.engagement),
    monthlyReviews: normalizeReviewRecords(parsed.monthlyReviews),
    accessReconciliation: normalizeAccessReconciliation(parsed.accessReconciliation),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
  };
}

/**
 * A stored profile, normalised. Nothing stored, or text that is not a
 * profile at all, means the sample behind the setup dialog: never a finished
 * sample business standing in for the owner's.
 */
export function parseStoredProfile(raw: string | null): PracticeProfile {
  const setup = () => ({ ...defaultProfile(), onboardingComplete: false });
  if (!raw) return setup();
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed)
      ? normalizeProfile(parsed, { onboardingCompleteFallback: false })
      : setup();
  } catch {
    return setup();
  }
}

/**
 * The risk variables with their copy of the two control answers taken from
 * the staff figures, which hold them. Every write of the staff figures goes
 * through here, so the two copies cannot disagree.
 */
export function withRiskFlags(
  riskVariables: RiskVariableState,
  staff: Pick<StaffComposition, "dualControlPayments" | "independentBankRec">,
): RiskVariableState {
  return {
    ...riskVariables,
    hasDualControl: staff.dualControlPayments,
    hasIndependentBankRec: staff.independentBankRec,
  };
}

/**
 * Drop confirmation dates that are not real calendar days on or before `today`
 * — the owner's local day, since that is the calendar the register was written in.
 */
export function normalizeCustomKnowledge(value: unknown, today: string): KnowledgeItem[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry as KnowledgeItem;
    const item = entry as KnowledgeItem & { confirmedAt?: unknown };
    if (typeof item.confirmedAt === "string" && isCalendarDate(item.confirmedAt, today)) {
      return item as KnowledgeItem;
    }
    const { confirmedAt: _ignored, ...withoutConfirmation } = item;
    return withoutConfirmation as KnowledgeItem;
  });
}

/** Keep only entries with a real person id, a known industry and an ordered pair of calendar days. */
export function normalizePlannedAbsences(value: unknown): PlannedAbsence[] {
  if (!Array.isArray(value)) return [];
  const out: PlannedAbsence[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== "string" || typeof raw.personId !== "string") continue;
    if (typeof raw.from !== "string" || typeof raw.to !== "string") continue;
    if (!isCalendarDate(raw.from) || !isCalendarDate(raw.to) || raw.from > raw.to) continue;
    if (!isIndustryId(raw.industry)) continue;
    out.push({
      id: raw.id.slice(0, 60),
      personId: raw.personId.slice(0, 120),
      industry: raw.industry,
      from: raw.from,
      to: raw.to,
      ...(typeof raw.note === "string" && raw.note.trim()
        ? { note: raw.note.trim().slice(0, 200) }
        : {}),
      ...(raw.unplanned === true ? { unplanned: true } : {}),
      ...(typeof raw.debriefedAt === "string" && isCalendarDate(raw.debriefedAt)
        ? { debriefedAt: raw.debriefedAt }
        : {}),
    });
  }
  return out;
}

/** Keep only well-formed leaver checks: a name, a known industry, and real calendar days. */
export function normalizeLeaverAccessChecks(value: unknown): LeaverAccessCheck[] {
  if (!Array.isArray(value)) return [];
  const out: LeaverAccessCheck[] = [];
  for (const entry of value.slice(0, MAX_LEAVER_CHECKS)) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== "string" || typeof raw.name !== "string" || !raw.name.trim()) continue;
    if (!isIndustryId(raw.industry)) continue;
    if (typeof raw.notedOn !== "string" || !isCalendarDate(raw.notedOn)) continue;
    out.push({
      id: raw.id.slice(0, 60),
      ...(typeof raw.personId === "string" ? { personId: raw.personId.slice(0, 120) } : {}),
      name: raw.name.trim().slice(0, 80),
      ...(typeof raw.role === "string" && raw.role.trim()
        ? { role: raw.role.trim().slice(0, 120) }
        : {}),
      industry: raw.industry,
      notedOn: raw.notedOn,
      source: raw.source === "marked" ? "marked" : "roster",
      ...(raw.prompted === true ? { prompted: true as const } : {}),
      ...(typeof raw.confirmedOn === "string" && isCalendarDate(raw.confirmedOn)
        ? { confirmedOn: raw.confirmedOn }
        : {}),
    });
  }
  return out;
}

/** Each risk variable is bounded by its catalog definition, or falls back to the default. */
export function normalizeRiskVariables(value: unknown, base: RiskVariableState): RiskVariableState {
  const input = record(value);
  const normalized = { ...base } as unknown as Record<string, unknown>;
  for (const definition of VARIABLE_CATALOG) {
    const key = definition.id as keyof RiskVariableState;
    const fallback = base[key];
    const candidate = input[key];
    if (typeof fallback === "boolean") {
      normalized[key] = typeof candidate === "boolean" ? candidate : fallback;
    } else if (typeof fallback === "number") {
      normalized[key] = boundedNumber(candidate, {
        min: definition.min ?? 0,
        max: definition.max ?? 1_000_000_000,
        fallback: fallback,
      });
    }
  }
  const insurance = normalizeInsuranceRecord(input.insurance);
  if (insurance) normalized.insurance = insurance;
  return normalized as unknown as RiskVariableState;
}

/** Stored staff figures are untrusted input: each field is typed and bounded, or falls back. */
function normalizeStaff(value: unknown, base: StaffComposition): StaffComposition {
  const input = record(value);
  return {
    teamSize: Math.round(
      boundedNumber(input.teamSize, { min: 1, max: 500, fallback: base.teamSize }),
    ),
    soleOwnerKnowledgeCount: Math.round(
      boundedNumber(input.soleOwnerKnowledgeCount, {
        min: 0,
        max: 10_000,
        fallback: base.soleOwnerKnowledgeCount,
      }),
    ),
    avgTenureYears: boundedNumber(input.avgTenureYears, {
      min: 0,
      max: 100,
      fallback: base.avgTenureYears,
    }),
    segregationScore: boundedNumber(input.segregationScore, {
      min: 0,
      max: 100,
      fallback: base.segregationScore,
    }),
    dualControlPayments:
      typeof input.dualControlPayments === "boolean"
        ? input.dualControlPayments
        : base.dualControlPayments,
    independentBankRec:
      typeof input.independentBankRec === "boolean"
        ? input.independentBankRec
        : base.independentBankRec,
    // Whether the owner set these by hand survives a reload; without it the
    // next team edit would silently re-derive a figure the owner chose.
    ...(input.segregationSource === "manual" || input.segregationSource === "derived"
      ? { segregationSource: input.segregationSource }
      : {}),
    ...(input.bankRecSource === "manual" || input.bankRecSource === "derived"
      ? { bankRecSource: input.bankRecSource }
      : {}),
  };
}

/** Journal entries of a known kind, bounded by the same caps the journal form applies. */
function normalizeDecisions(value: unknown): DecisionEntry[] {
  if (!Array.isArray(value)) return [];
  return (value as Partial<DecisionEntry>[]).slice(0, MAX_DECISIONS).flatMap((entry) => {
    const known = typeof entry?.kind === "string" && Object.hasOwn(DECISION_KIND_LABEL, entry.kind);
    if (!isRecord(entry) || !known || !entry.kind) return [];
    return [
      {
        ...entry,
        id: String(entry.id ?? "").slice(0, 80),
        createdAt: String(entry.createdAt ?? "").slice(0, 40),
        subject: String(entry.subject ?? "").slice(0, MAX_DECISION_SUBJECT),
        kind: entry.kind,
        note: String(entry.note ?? "").slice(0, MAX_DECISION_NOTE),
        reviewBy: entry.reviewBy ? String(entry.reviewBy).slice(0, 40) : undefined,
        residualAtDecision: Number.isFinite(entry.residualAtDecision)
          ? entry.residualAtDecision
          : undefined,
        linkedTab: entry.linkedTab ? String(entry.linkedTab).slice(0, 80) : undefined,
        linkedId: entry.linkedId ? String(entry.linkedId).slice(0, 80) : undefined,
        reviews: Array.isArray(entry.reviews) ? entry.reviews.slice(0, 100) : undefined,
        status: entry.status === "open" || entry.status === "closed" ? entry.status : undefined,
      },
    ];
  });
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

// ── Ids ────────────────────────────────────────────────────────────────────

export function makeBusinessId(): string {
  return uid("biz");
}

export function makeDecisionId(): string {
  return uid("dec");
}

export function makePlannedAbsenceId(): string {
  return uid("abs");
}

// ── This browser's portfolio ───────────────────────────────────────────────

/** Every business this device knows about, in full, keyed by id. */
export const PORTFOLIO_KEY = "precog.portfolio.v1";
/** The business open in this browser: what a reload comes back to. */
export const ACTIVE_PROFILE_KEY = "precog.practiceProfile.v2";
const LEGACY_PROFILE_KEY = "precog.practiceProfile.v1";

/**
 * True when this profile holds something the user made, as opposed to an
 * untouched industry demo: their own processes, people, register, decisions,
 * saved versions, or a business name that is not one of the demo names.
 */
export function hasUserWork(profile: PracticeProfile): boolean {
  return Boolean(
    profile.customProcesses ||
    profile.customPeople ||
    profile.customKnowledge?.length ||
    profile.customRelations?.length ||
    profile.decisions.length ||
    profile.mapVersions?.length ||
    profile.savedProcessBlocks?.length ||
    Object.keys(profile.mapLayout ?? {}).length ||
    !isDemoName(profile.practiceName),
  );
}

export function summarizeBusiness(p: PracticeProfile): BusinessSummary {
  const tpl = getIndustryTemplate(p.industry);
  const history = p.mapHealthHistory ?? [];
  return {
    id: p.businessId ?? DEFAULT_BUSINESS_ID,
    name: p.practiceName,
    industry: p.industry,
    updatedAt: p.updatedAt,
    processCount: (p.customProcesses ?? tpl.processes).length,
    healthScore: history.length ? history[history.length - 1].score : null,
  };
}

/**
 * The stored text of the business open in this browser (the v1 key is read
 * when there is no v2 copy yet); null when there is none or storage is blocked.
 */
export function readStoredActiveProfile(
  storage: StorageLike | null = browserStorage(),
): string | null {
  return readLocal(ACTIVE_PROFILE_KEY, storage) ?? readLocal(LEGACY_PROFILE_KEY, storage);
}

/** Local portfolio: every business this device knows about, keyed by id (includes the active one). */
export function loadPortfolio(storage = browserStorage()): Record<string, PracticeProfile> {
  const raw = readLocal(PORTFOLIO_KEY, storage);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, PracticeProfile>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Keeps one business in the portfolio. A business whose setup is not
 * finished is not a business yet (it is the sample behind the setup dialog),
 * so it is never listed. False when the browser refused the write (storage
 * full or blocked), so a caller can say the copy on this device is stale.
 */
export function savePortfolioEntry(profile: PracticeProfile, storage = browserStorage()): boolean {
  if (profile.onboardingComplete === false) return true;
  const id = profile.businessId ?? DEFAULT_BUSINESS_ID;
  const all = loadPortfolio(storage);
  all[id] = { ...profile, businessId: id };
  return writeLocal(PORTFOLIO_KEY, JSON.stringify(all), storage);
}

export function removePortfolioEntry(id: string, storage = browserStorage()): void {
  const all = loadPortfolio(storage);
  if (!(id in all)) return;
  delete all[id];
  // Quota: a stale portfolio entry is harmless; it is re-derived on the next save.
  writeLocal(PORTFOLIO_KEY, JSON.stringify(all), storage);
}
