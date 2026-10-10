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
import {
  CONTROL_IN_PLACE_TAB,
  resolveTemplate,
  SETUP_CONTROL_IDS,
  setupControlsInPlace,
} from "./active-template";
import {
  DEFAULT_RISK_VARIABLES,
  mergeStaffIntoVariables,
  VARIABLE_CATALOG,
  type RiskVariableState,
} from "./scoring/dynamic-variables";
import {
  defaultDualReleasePolicy,
  mergeDualReleasePolicy,
  mitigatedSodRuleIds,
  type DualReleasePolicy,
} from "./controls/dual-release";
import { deriveStaffFromTeam } from "./sod/derive-staff";
import { isDemoName, isIndustryId, type IndustryId } from "./industry";
import { normalizeEngagement, type EngagementStamp } from "./firm/engagement";
import { normalizeReviewRecords, type ReviewRecord } from "./firm/reviews";
import { normalizeAccessReconciliation, type AccessReconciliation } from "./firm/reconcile";
import {
  normalizeIntegrationDriftSummary,
  type IntegrationDriftSummary,
} from "./integrations/drift-summary";
import { browserStorage, readLocal, writeLocal, type StorageLike } from "./local-data";
import { uid } from "./text";
import { boundedNumber } from "./number";
import {
  asRecord,
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
import { DEFAULT_BUSINESS_ID, isBusinessId, MAX_BUSINESS_NAME } from "./business-id";
import { ACTIVE_PROFILE_KEY, LEGACY_PROFILE_KEY, PORTFOLIO_KEY } from "./storage-keys";
import { stripProcedureLinks } from "./procedures/coverage-link";
import { normalizePlaces, normalizeProcedures } from "./procedures/normalize";
import type { Place, Procedure } from "./procedures/types";
import { normalizeSetupAnswers, type SetupAnswers } from "./onboarding/setup-answers";
import { normalizeOnboardingFacts, type OnboardingFacts } from "./onboarding/decision-model";
import { trimDecisions } from "./decisions/trim";

/**
 * One business: what it is, the owner's own team, map and register (or null
 * for the industry sample's), their settings, journal and records. This file
 * holds the type, its defaults, the normaliser every stored copy goes
 * through, and this browser's portfolio of businesses.
 */
export interface PracticeProfile {
  /** Account that owns this row when it was opened from a shared portfolio. */
  ownerUserId?: string;
  practiceName: string;
  industry: IndustryId;
  staff: StaffComposition;
  riskVariables: RiskVariableState;
  dualRelease: DualReleasePolicy;
  decisions: DecisionEntry[];
  /** False on first visit until the user picks an industry template. */
  onboardingComplete?: boolean;
  /** Organization-level setup facts; never used as mapped-team scoring inputs. */
  onboardingFacts?: OnboardingFacts;
  /** User-built process map. Null/undefined = use the industry template as-is. */
  customProcesses?: ProcessNode[] | null;
  /** The user's real team. Null/undefined = template demo people. */
  customPeople?: Person[] | null;
  /** The business's own duty/task/knowledge register. Null/undefined = template items. */
  customKnowledge?: KnowledgeItem[] | null;
  /** Who holds each register item, at what level. Null/undefined = template relations. */
  customRelations?: KnowledgeRelation[] | null;
  /** The answers the owner gave while setting up money flow and existing controls. */
  setupAnswers?: SetupAnswers;
  /**
   * The controls a setup answer credited as in place that the owner has
   * since taken off, by credit id (active-template `setupControlsInPlace`):
   * the answer stands, but the control no longer counts it. Absent until
   * the owner takes one off.
   */
  setupControlsWithdrawn?: string[];
  /** Known leave, so continuity advice can warn ahead of it. */
  plannedAbsences?: PlannedAbsence[];
  /** People who have left, and whether the owner has confirmed their pay and logins are stopped. */
  leaverAccessChecks?: LeaverAccessCheck[];
  /** Pinned canvas positions for process nodes (from drag in build mode). */
  mapLayout?: Record<string, { x: number; y: number }>;
  /** User-saved process blocks for reuse in the map builder. */
  savedProcessBlocks?: SavedProcessBlock[];
  /**
   * Retired: the map health score over time, before Map completeness replaced
   * it. Kept as saved so no history is lost; nothing adds to it or reads it as
   * completeness, because it also counted risk (heat).
   */
  mapHealthHistory?: MapHealthPoint[];
  /** Map completeness snapshots over time (newest last). */
  mapCompletenessHistory?: MapHealthPoint[];
  /** Named snapshots of the map for restore/compare (newest first). */
  mapVersions?: MapVersion[];
  /** Stable id of this business within the user's portfolio. */
  businessId?: string;
  /** Pilot stamps: when the owner's team was started, when the map was complete, when the report was sent. */
  engagement?: EngagementStamp;
  /** Monthly close results. The newest result for each check and month is kept; older duplicates are dropped first. */
  monthlyReviews?: ReviewRecord[];
  /** Read-only user and vendor export compared with the duty map. */
  accessReconciliation?: AccessReconciliation;
  /** Compact books-vs-map drift for Home's "Do these first" list and the control report (full detail stays on Firm). */
  integrationDriftSummary?: IntegrationDriftSummary;
  /** Software platforms and physical places procedures are done in. */
  places?: Place[];
  /** Written step-by-step procedures (the Procedures tab). */
  procedures?: Procedure[];
  updatedAt: string;
}

/** One line of the business switcher. */
export interface BusinessSummary {
  id: string;
  /** Account that owns this row; present on account-backed summaries. */
  ownerUserId?: string;
  name: string;
  industry: IndustryId;
  updatedAt: string;
  processCount: number;
  healthScore: number | null;
  /** True for a firm colleague's client rather than the account's own business. */
  shared?: boolean;
  /** True for a firm's client business, which the report names the firm on. */
  firmClient?: boolean;
}

/** Collision-safe identity for account-backed summaries and active selection. */
export function businessSummaryKey(
  business: Pick<BusinessSummary, "id" | "ownerUserId">,
  ownUserId?: string | null,
): string {
  return `${business.ownerUserId ?? ownUserId ?? "local"}\u0000${business.id}`;
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

/** What each kind of decision is called on screen. The keys are stored and never change. */
export const DECISION_KIND_LABEL: Record<DecisionKind, string> = {
  accept_residual: "Accept the risk",
  remediate: "Fix it",
  monitor: "Watch it",
  insure: "Insure it",
};

/**
 * The labels report layouts 1 and 2 printed. Locked versions of those layouts
 * keep them, so a report printed before the rename reads the same today.
 */
export const DECISION_KIND_LABEL_PRINTED_V1: Record<DecisionKind, string> = {
  accept_residual: "Accept residual",
  remediate: "Remediate",
  monitor: "Monitor",
  insure: "Transfer / insure",
};

/** Why a finding was judged not valid. The keys are stored and never change. */
export type DispositionReason =
  "duty_not_held" | "controlled_elsewhere" | "rule_does_not_fit" | "other";

export const DISPOSITION_REASON_LABEL: Record<DispositionReason, string> = {
  duty_not_held: "This person does not hold that duty",
  controlled_elsewhere: "Someone outside this map checks it",
  rule_does_not_fit: "The rule does not fit this business",
  other: "Other (say why)",
};

/** Longest note on a "Not valid" judgement, in characters. */
export const MAX_DISPOSITION_NOTE = 500;

/**
 * A finding judged not valid. It rides on an ordinary decision entry (written
 * with kind "monitor" and no review date) rather than being a kind of its own,
 * so an older copy of Precog keeps the entry and shows it as an undated
 * "Watch it" decision.
 */
export interface DecisionDisposition {
  verdict: "not_valid";
  reason: DispositionReason;
  note?: string;
  by?: { userId: string; name: string };
  at: string;
}

/**
 * Most journal entries kept, newest first. Far above the findings any team
 * has, so a trim only ever removes old entries no current finding uses (see
 * decisions/trim.ts).
 */
export const MAX_DECISIONS = 1000;
/** Most stored entries read before the trim: twice the cap, so an oversized stored list is bounded. */
const MAX_STORED_DECISIONS = MAX_DECISIONS * 2;
/** Longest decision subject, in characters. */
export const MAX_DECISION_SUBJECT = 120;
/** Longest decision note, in characters. */
export const MAX_DECISION_NOTE = 800;
/** Most reviews retained for one decision; newest reviews carry its current meaning. */
export const MAX_DECISION_REVIEWS = 100;

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
  /** Set when the finding this entry answers was judged not valid. */
  disposition?: DecisionDisposition;
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
/**
 * The hard bound on stored leaver checks, open ones included. Open checks are
 * never dropped to reach MAX_LEAVER_CHECKS; this only guards against an
 * oversized stored list.
 */
const MAX_STORED_LEAVER_CHECKS = 2000;

/**
 * Leaver checks (newest first) trimmed to the cap: the oldest confirmed
 * checks go first, and an open check never goes for the cap.
 */
export function trimLeaverChecks<T extends { confirmedOn?: string }>(checks: readonly T[]): T[] {
  let excess = checks.length - MAX_LEAVER_CHECKS;
  if (excess <= 0) return [...checks];
  const kept: T[] = [];
  for (let i = checks.length - 1; i >= 0; i--) {
    if (excess > 0 && checks[i].confirmedOn) excess--;
    else kept.push(checks[i]);
  }
  return kept.reverse().slice(0, MAX_STORED_LEAVER_CHECKS);
}

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
    riskVariables: mergeStaffIntoVariables(DEFAULT_RISK_VARIABLES, staff),
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
    mapCompletenessHistory: [],
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
  const parsed = asRecord(input) as Partial<PracticeProfile>;
  const industry = isIndustryId(parsed.industry) ? parsed.industry : "dental";
  const base = defaultProfile(industry);
  const staff = normalizeStaff(parsed.staff, base.staff);
  const customProcesses = processEntries(parsed.customProcesses);
  const customPeople = peopleEntries(parsed.customPeople);
  const today = options.today ?? localDateKey(new Date());
  const customKnowledge = normalizeCustomKnowledge(knowledgeEntries(parsed.customKnowledge), today);
  const customRelations = relationEntries(parsed.customRelations);
  const setupAnswers = normalizeSetupAnswers(parsed.setupAnswers);
  const setupControlsWithdrawn = normalizeSetupControlsWithdrawn(parsed.setupControlsWithdrawn);
  const onboardingFacts = normalizeOnboardingFacts(parsed.onboardingFacts);
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
  return withStaffFromDuties({
    industry,
    practiceName:
      typeof parsed.practiceName === "string"
        ? parsed.practiceName.trim().slice(0, MAX_BUSINESS_NAME) || base.practiceName
        : base.practiceName,
    staff,
    riskVariables: mergeStaffIntoVariables(
      normalizeRiskVariables(parsed.riskVariables, base.riskVariables),
      staff,
    ),
    dualRelease,
    decisions: withoutSetupEntries(normalizeDecisions(parsed.decisions, industry), {
      industry,
      setupAnswers,
    }),
    onboardingComplete:
      typeof parsed.onboardingComplete === "boolean"
        ? parsed.onboardingComplete
        : (options.onboardingCompleteFallback ?? true),
    ...(onboardingFacts ? { onboardingFacts } : {}),
    customProcesses,
    customPeople,
    customKnowledge,
    customRelations,
    ...(setupAnswers ? { setupAnswers } : {}),
    ...(setupControlsWithdrawn.length > 0 ? { setupControlsWithdrawn } : {}),
    plannedAbsences: normalizePlannedAbsences(parsed.plannedAbsences),
    leaverAccessChecks: normalizeLeaverAccessChecks(parsed.leaverAccessChecks),
    mapLayout: mapLayoutEntries(parsed.mapLayout),
    savedProcessBlocks: savedBlockEntries(parsed.savedProcessBlocks),
    mapHealthHistory: healthPointEntries(parsed.mapHealthHistory),
    mapCompletenessHistory: healthPointEntries(parsed.mapCompletenessHistory),
    mapVersions: mapVersionEntries(parsed.mapVersions),
    businessId: isBusinessId(parsed.businessId) ? parsed.businessId : base.businessId,
    engagement: normalizeEngagement(parsed.engagement),
    monthlyReviews: normalizeReviewRecords(parsed.monthlyReviews),
    accessReconciliation: normalizeAccessReconciliation(parsed.accessReconciliation),
    integrationDriftSummary: normalizeIntegrationDriftSummary(parsed.integrationDriftSummary),
    places: normalizePlaces(parsed.places),
    procedures: normalizeProcedures(parsed.procedures, today),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
  });
}

/**
 * A business with its own team takes its segregation score and bank
 * reconciliation answer from its duties alone. A profile saved before that
 * rule can carry either figure set by hand ("manual"); it is read from the
 * team again here, so no figure on any screen or report rests on it. A
 * sample business keeps a figure set by hand.
 */
function withStaffFromDuties(p: PracticeProfile): PracticeProfile {
  if (!p.customPeople) return p;
  if (
    p.staff.segregationSource !== "manual" &&
    p.staff.bankRecSource !== "manual" &&
    p.staff.bankRecSource !== "outside"
  )
    return p;
  const tpl = resolveTemplate(p);
  const derived = deriveStaffFromTeam(
    tpl,
    {
      ...p.staff,
      segregationSource: "derived",
      bankRecSource: p.staff.bankRecSource === "outside" ? "outside" : "derived",
    },
    { dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(p.dualRelease, tpl) },
  );
  const outsideReconciler = p.staff.bankRecSource === "outside";
  const staff: StaffComposition = {
    ...p.staff,
    segregationScore: derived.segregationScore,
    segregationSource: "derived",
    independentBankRec: outsideReconciler ? true : derived.independentBankRec,
    bankRecSource: outsideReconciler ? "outside" : "derived",
  };
  return { ...p, staff, riskVariables: mergeStaffIntoVariables(p.riskVariables, staff) };
}

/**
 * A stored profile, normalised. Nothing stored, or text that is not a
 * profile at all, means the sample behind the setup dialog: never a finished
 * sample business standing in for the owner's.
 */
export function parseStoredProfile(raw: string | null): PracticeProfile {
  return readStoredProfile(raw).profile;
}

/**
 * A stored profile read as `parseStoredProfile` reads it, except that a
 * profile the normaliser throws on comes back as `unreadable` with the error.
 * That is a bug in Precog, not damage to the copy, so the caller keeps the
 * stored text and never writes the setup sample over it. `unreadable` is
 * null for every other outcome. `damaged` is true when text is stored but is
 * not JSON for an object at all (cut short, or another type): damage to the
 * copy, which the caller quarantines before anything replaces it.
 */
export function readStoredProfile(raw: string | null): {
  profile: PracticeProfile;
  unreadable: unknown;
  damaged: boolean;
} {
  const setup = () => ({ ...defaultProfile(), onboardingComplete: false });
  if (!raw) return { profile: setup(), unreadable: null, damaged: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { profile: setup(), unreadable: null, damaged: true };
  }
  if (!isRecord(parsed)) return { profile: setup(), unreadable: null, damaged: true };
  try {
    return {
      profile: normalizeProfile(parsed, { onboardingCompleteFallback: false }),
      unreadable: null,
      damaged: false,
    };
  } catch (error) {
    return {
      profile: setup(),
      unreadable: error ?? new Error("The normaliser failed."),
      damaged: false,
    };
  }
}

/**
 * Drop confirmation dates that are not real calendar days on or before `today`
 * — the owner's local day, since that is the calendar the register was written in —
 * and the derived links to procedures, which are rebuilt whenever the template is.
 */
export function normalizeCustomKnowledge(value: unknown, today: string): KnowledgeItem[] | null {
  if (!Array.isArray(value)) return null;
  return stripProcedureLinks(value as KnowledgeItem[]).map((entry) => {
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
function normalizeLeaverAccessChecks(value: unknown): LeaverAccessCheck[] {
  if (!Array.isArray(value)) return [];
  const out: LeaverAccessCheck[] = [];
  for (const entry of value.slice(0, MAX_STORED_LEAVER_CHECKS)) {
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
  return trimLeaverChecks(out);
}

/** Each risk variable is bounded by its catalog definition, or falls back to the default. */
export function normalizeRiskVariables(value: unknown, base: RiskVariableState): RiskVariableState {
  const input = asRecord(value);
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
  const input = asRecord(value);
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
      input.bankRecSource === "outside"
        ? true
        : typeof input.independentBankRec === "boolean"
          ? input.independentBankRec
          : base.independentBankRec,
    // Whether the owner set these by hand survives a reload; without it the
    // next team edit would silently re-derive a figure the owner chose.
    ...(input.segregationSource === "manual" || input.segregationSource === "derived"
      ? { segregationSource: input.segregationSource }
      : {}),
    ...(input.bankRecSource === "manual" ||
    input.bankRecSource === "derived" ||
    input.bankRecSource === "outside"
      ? { bankRecSource: input.bankRecSource }
      : {}),
  };
}

const DECISION_STATUSES = ["open", "closed"] as const;
const REVIEW_OUTCOMES = ["done", "still_open", "no_longer_relevant"] as const;
const CONTINUITY_STEPS: readonly ContinuityStep[] = ["cover", "handoff", "document", "locate"];
const COVERAGE_STATUSES: readonly CoverageStatus[] = ["uncovered", "single", "thin", "covered"];
const DOCUMENTATION_STATES: readonly DocumentationState[] = ["none", "unlocated", "located"];

/** The setup credits taken off, read from a stored copy: known ids only, each once, in order. */
export function normalizeSetupControlsWithdrawn(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return SETUP_CONTROL_IDS.filter((id) => value.includes(id));
}

/**
 * The journal without the entries setup used to log for its own answers
 * ("The owner opens and reads the bank statement each month (answered at
 * setup)." and the outside-bookkeeper line). Setup logged them as "Watch it"
 * decisions the owner never made. An entry goes only when it is exactly one
 * of those: a control-in-place entry of that kind, under this industry, with
 * the text the stored setup answers still give for that control, and never
 * reviewed or judged. The answers credit the same control with the same text
 * (`setupControlsInPlace`), so no figure moves.
 */
export function withoutSetupEntries(
  decisions: DecisionEntry[],
  profile: Pick<PracticeProfile, "industry" | "setupAnswers">,
): DecisionEntry[] {
  const setup = setupControlsInPlace(profile.setupAnswers, profile.industry);
  if (setup.length === 0) return decisions;
  const seeded = (d: DecisionEntry) =>
    d.linkedTab === CONTROL_IN_PLACE_TAB &&
    d.kind === "monitor" &&
    (!d.linkedIndustry || d.linkedIndustry === profile.industry) &&
    !d.disposition &&
    !d.reviews?.length &&
    d.status !== "closed" &&
    setup.some((s) => s.controlId === d.linkedId && s.text === d.note);
  return decisions.some(seeded) ? decisions.filter((d) => !seeded(d)) : decisions;
}

/**
 * Journal entries of a known kind, rebuilt deeply so every downstream reader
 * gets safe history, and trimmed to MAX_DECISIONS by `trimDecisions`: an
 * entry linked to a finding of `industry`, a "Not valid" judgement and a risk
 * acceptance stay; the oldest of the rest go first.
 */
export function normalizeDecisions(value: unknown, industry?: IndustryId): DecisionEntry[] {
  if (!Array.isArray(value)) return [];
  const entries = value.slice(0, MAX_STORED_DECISIONS).flatMap((entry): DecisionEntry[] => {
    if (
      !isRecord(entry) ||
      !isEnum(entry.kind, Object.keys(DECISION_KIND_LABEL) as DecisionKind[])
    ) {
      return [];
    }
    const snapshot = normalizeDecisionSnapshot(entry.snapshot);
    const reviews = Array.isArray(entry.reviews)
      ? entry.reviews
          .slice(-MAX_DECISION_REVIEWS)
          .flatMap((review) => normalizeDecisionReview(review) ?? [])
      : undefined;
    const disposition = normalizeDisposition(entry.disposition);
    return [
      {
        id: text(entry.id, 80),
        createdAt: storedDate(entry.createdAt) ? entry.createdAt : "",
        subject: text(entry.subject, MAX_DECISION_SUBJECT),
        kind: entry.kind,
        note: text(entry.note, MAX_DECISION_NOTE),
        ...(calendarDate(entry.reviewBy) ? { reviewBy: entry.reviewBy } : {}),
        ...(finite(entry.residualAtDecision)
          ? { residualAtDecision: entry.residualAtDecision }
          : {}),
        ...(optionalText(entry.linkedTab) ? { linkedTab: text(entry.linkedTab, 80) } : {}),
        ...(optionalText(entry.linkedId) ? { linkedId: text(entry.linkedId, 80) } : {}),
        ...(isIndustryId(entry.linkedIndustry) ? { linkedIndustry: entry.linkedIndustry } : {}),
        ...(isEnum(entry.linkedStep, CONTINUITY_STEPS) ? { linkedStep: entry.linkedStep } : {}),
        ...(optionalText(entry.linkedPersonId)
          ? { linkedPersonId: text(entry.linkedPersonId, 120) }
          : {}),
        ...(optionalText(entry.linkedAbsenceId)
          ? { linkedAbsenceId: text(entry.linkedAbsenceId, 60) }
          : {}),
        ...(snapshot ? { snapshot } : {}),
        ...(reviews?.length ? { reviews } : {}),
        ...(isEnum(entry.status, DECISION_STATUSES) ? { status: entry.status } : {}),
        ...(disposition ? { disposition } : {}),
      },
    ];
  });
  return trimDecisions(entries, MAX_DECISIONS, industry).kept;
}

function normalizeDecisionReview(value: unknown): DecisionReview | undefined {
  if (!isRecord(value) || !storedDate(value.at) || !isEnum(value.outcome, REVIEW_OUTCOMES)) {
    return undefined;
  }
  const snapshot = normalizeDecisionSnapshot(value.snapshot);
  if (!snapshot) return undefined;
  return {
    at: value.at,
    outcome: value.outcome,
    ...(optionalText(value.note) ? { note: text(value.note, MAX_DECISION_NOTE) } : {}),
    snapshot,
  };
}

function normalizeDecisionSnapshot(value: unknown): DecisionSnapshot | undefined {
  if (
    !isRecord(value) ||
    !storedDate(value.at) ||
    !optionalText(value.scoringVersion) ||
    !finite(value.averageResidual) ||
    !finite(value.sodOpenConflicts) ||
    !finite(value.segregationHealth)
  ) {
    return undefined;
  }
  const continuity = normalizeContinuitySnapshot(value.continuity);
  return {
    at: value.at,
    scoringVersion: text(value.scoringVersion, 40),
    averageResidual: value.averageResidual,
    ...(finite(value.subjectResidual) ? { subjectResidual: value.subjectResidual } : {}),
    sodOpenConflicts: value.sodOpenConflicts,
    segregationHealth: value.segregationHealth,
    ...(continuity ? { continuity } : {}),
  };
}

function normalizeContinuitySnapshot(value: unknown): ContinuitySnapshot | undefined {
  if (!isRecord(value) || !finite(value.coverageIndex) || !finite(value.singlePoints)) {
    return undefined;
  }
  return {
    coverageIndex: value.coverageIndex,
    singlePoints: value.singlePoints,
    ...(isEnum(value.itemStatus, COVERAGE_STATUSES) ? { itemStatus: value.itemStatus } : {}),
    ...(isEnum(value.itemDocumentation, DOCUMENTATION_STATES)
      ? { itemDocumentation: value.itemDocumentation }
      : {}),
  };
}

/** A "Not valid" judgement with a known reason and a date, capped; anything else is dropped. */
function normalizeDisposition(value: unknown): DecisionDisposition | undefined {
  if (!isRecord(value) || value.verdict !== "not_valid") return undefined;
  const reason = value.reason;
  if (typeof reason !== "string" || !Object.hasOwn(DISPOSITION_REASON_LABEL, reason)) {
    return undefined;
  }
  if (!storedDate(value.at)) return undefined;
  const by = value.by;
  const validBy =
    isRecord(by) && typeof by.userId === "string" && by.userId && typeof by.name === "string"
      ? { userId: by.userId.slice(0, 80), name: by.name.slice(0, 120) }
      : undefined;
  const note = text(value.note, MAX_DISPOSITION_NOTE);
  return {
    verdict: "not_valid",
    reason: reason as DispositionReason,
    ...(note ? { note } : {}),
    ...(validBy ? { by: validBy } : {}),
    at: value.at,
  };
}

function isEnum<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function optionalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function storedDate(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 40) return false;
  const day = value.slice(0, 10);
  return (
    isCalendarDate(day) &&
    (value.length === 10 || value[10] === "T") &&
    Number.isFinite(Date.parse(value))
  );
}

function calendarDate(value: unknown): value is string {
  return typeof value === "string" && isCalendarDate(value);
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

// The keys live in a leaf module (./storage-keys); re-exported for existing importers.
export { ACTIVE_PROFILE_KEY, PORTFOLIO_KEY };

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
    profile.procedures?.length ||
    profile.places?.length ||
    !isDemoName(profile.practiceName),
  );
}

export function summarizeBusiness(p: PracticeProfile): BusinessSummary {
  const tpl = getIndustryTemplate(p.industry);
  const history = p.mapCompletenessHistory ?? [];
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

// ── Quarantine and removed businesses ──────────────────────────────────────

/** Where stored text this build could not read is kept, one key per distinct text. */
export const QUARANTINE_PREFIX = "precog.quarantine.";

/** The quarantine key for `raw`: the same text read on every reload lands in one key, not one per load. */
export function quarantineKey(raw: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${QUARANTINE_PREFIX}${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Keeps `raw` under its quarantine key. True when that key holds it
 * afterwards, so the caller may replace the original; false when the browser
 * refused the write, so the original must stay.
 */
export function quarantineText(raw: string, storage: StorageLike | null): boolean {
  const key = quarantineKey(raw);
  return readLocal(key, storage) === raw || writeLocal(key, raw, storage);
}

/** The ids of businesses removed on this device, oldest first. */
export const REMOVED_BUSINESSES_KEY = "precog.removedBusinesses.v1";
/** Most removed ids remembered; the oldest is forgotten first. */
export const MAX_REMOVED_BUSINESSES = 200;

/**
 * The businesses removed on this device. A removal matches the business id
 * alone, so a business set up again under a new id is listed as usual.
 */
export function removedBusinessIds(storage = browserStorage()): Set<string> {
  const raw = readLocal(REMOVED_BUSINESSES_KEY, storage);
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(
      Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}

/**
 * Remembers that the owner removed business `id` here, so neither a tab
 * still open on it nor a reload that finds it as the open business lists it
 * again. False when the browser refused the write.
 */
export function rememberRemovedBusiness(id: string, storage = browserStorage()): boolean {
  const ids = [...removedBusinessIds(storage)].filter((kept) => kept !== id);
  ids.push(id);
  return writeLocal(
    REMOVED_BUSINESSES_KEY,
    JSON.stringify(ids.slice(-MAX_REMOVED_BUSINESSES)),
    storage,
  );
}

/**
 * Forgets that business `id` was removed on this device: the account holds
 * it live again (restored, opened, loaded or saved there), so it is listed
 * and kept here as usual. True when a removal was forgotten.
 */
export function forgetRemovedBusiness(id: string, storage = browserStorage()): boolean {
  const removed = removedBusinessIds(storage);
  if (!removed.delete(id)) return false;
  return writeLocal(REMOVED_BUSINESSES_KEY, JSON.stringify([...removed]), storage);
}

// ── The list of businesses ─────────────────────────────────────────────────

/** The stored list as read: absent, a plain object of entries, or text that is not one. */
type StoredPortfolio =
  | { kind: "empty" }
  | { kind: "entries"; entries: Record<string, unknown> }
  /** `kept`: its text is held under its quarantine key, so a fresh list may replace it. */
  | { kind: "unreadable"; kept: boolean };

/** Reads the stored list. Text that is not a plain object is quarantined as read. */
function readStoredPortfolio(storage: StorageLike | null): StoredPortfolio {
  const raw = readLocal(PORTFOLIO_KEY, storage);
  if (!raw) return { kind: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (isRecord(parsed)) return { kind: "entries", entries: parsed };
  return { kind: "unreadable", kept: quarantineText(raw, storage) };
}

/**
 * Local portfolio: every business this device knows about, keyed by id
 * (includes the active one), each normalised as on every other load path.
 * An entry that is not an object, or that the normaliser throws on, is
 * skipped and its text kept under a quarantine key; a business removed on
 * this device is skipped. A stored list that is not an object at all reads
 * as empty, and its text is quarantined.
 */
export function loadPortfolio(storage = browserStorage()): Record<string, PracticeProfile> {
  // The business menu reads the list on every rename keystroke; normalising
  // every business each time lagged typing in a large portfolio. The same
  // stored text gives the same list, so it is normalised once.
  const text = `${readLocal(PORTFOLIO_KEY, storage)}\u0000${readLocal(REMOVED_BUSINESSES_KEY, storage)}`;
  const cached = storage ? portfolioCache.get(storage) : undefined;
  if (cached?.text === text) return { ...cached.list };
  const list = readPortfolio(storage);
  if (storage) portfolioCache.set(storage, { text, list });
  return { ...list };
}

/** The last list read from each storage, by the stored text it was read from. */
const portfolioCache = new WeakMap<
  StorageLike,
  { text: string; list: Record<string, PracticeProfile> }
>();

function readPortfolio(storage: StorageLike | null): Record<string, PracticeProfile> {
  const stored = readStoredPortfolio(storage);
  if (stored.kind !== "entries") return {};
  const removed = removedBusinessIds(storage);
  const out: Record<string, PracticeProfile> = {};
  for (const [id, entry] of Object.entries(stored.entries)) {
    if (removed.has(id)) continue;
    try {
      if (!isRecord(entry)) throw new Error("Not a business");
      // An entry saved without its id is the one it is listed under.
      const businessId = isBusinessId(entry.businessId) ? entry.businessId : id;
      out[id] = normalizeProfile({ ...entry, businessId });
    } catch {
      quarantineText(JSON.stringify({ [id]: entry }), storage);
    }
  }
  return out;
}

/**
 * What `writePortfolioEntry` did with one business.
 * - "saved": the list now holds this version.
 * - "not-listed": its setup is not finished, so it is not a business yet; nothing written.
 * - "removed": the owner removed this business on this device; nothing written.
 * - "refused": the browser refused the write (storage full or blocked).
 * - "unreadable": the stored list is not readable and the browser refused to
 *   keep its text under a quarantine key, so nothing is written over it.
 */
export type PortfolioWrite = "saved" | "not-listed" | "removed" | "refused" | "unreadable";

/**
 * Keeps one business in the portfolio, leaving every other entry as stored.
 * A business whose setup is not finished is not a business yet (it is the
 * sample behind the setup dialog), so it is never listed; nor is one the
 * owner removed on this device. A stored list this build cannot read is
 * replaced by a fresh one only once its text is kept under its quarantine key.
 */
export function writePortfolioEntry(
  profile: PracticeProfile,
  storage = browserStorage(),
): PortfolioWrite {
  if (profile.onboardingComplete === false) return "not-listed";
  const id = profile.businessId ?? DEFAULT_BUSINESS_ID;
  if (removedBusinessIds(storage).has(id)) return "removed";
  const stored = readStoredPortfolio(storage);
  if (stored.kind === "unreadable" && !stored.kept) return "unreadable";
  const all = stored.kind === "entries" ? stored.entries : {};
  all[id] = { ...profile, businessId: id };
  return writeLocal(PORTFOLIO_KEY, JSON.stringify(all), storage) ? "saved" : "refused";
}

/**
 * Keeps one business in the portfolio (see `writePortfolioEntry`).
 *
 * Returns true when this device's list of businesses is as it needs to be
 * for `profile`: the version was written ("saved"), or there is nothing to
 * list ("not-listed": setup not finished; "removed": the owner removed it on
 * this device). Returns false when the list does not hold this version: the
 * browser refused the write ("refused"), or the stored list is unreadable and
 * the browser refused to quarantine it, so it was not overwritten
 * ("unreadable"). On false, a caller says
 * this device did not keep the copy and offers a recovery download.
 */
export function savePortfolioEntry(profile: PracticeProfile, storage = browserStorage()): boolean {
  const result = writePortfolioEntry(profile, storage);
  return result === "saved" || result === "not-listed" || result === "removed";
}

/** Drops one business from the portfolio, leaving every other entry as stored. */
export function removePortfolioEntry(id: string, storage = browserStorage()): void {
  const stored = readStoredPortfolio(storage);
  if (stored.kind !== "entries" || !(id in stored.entries)) return;
  delete stored.entries[id];
  // Quota: a stale portfolio entry is harmless; it is re-derived on the next save.
  writeLocal(PORTFOLIO_KEY, JSON.stringify(stored.entries), storage);
}
