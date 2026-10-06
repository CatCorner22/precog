import type {
  KnowledgeItem,
  KnowledgeRelation,
  Person,
  ProcessNode,
  StaffComposition,
} from "./types";
import { mergeStaffIntoVariables, type RiskVariableState } from "./scoring/dynamic-variables";
import {
  mergeDualReleasePolicy,
  mitigatedSodRuleIds,
  staffFlagsFromDualRelease,
  type DualReleasePolicy,
} from "./controls/dual-release";
import { refreshIntegrationDriftSummary } from "./integrations/drift-profile";
import type { IntegrationDrift } from "./integrations/qbo/model";
import { industryHasOwner, industryMeta, isDemoName, type IndustryId } from "./industry";
import { resolveTemplate } from "./active-template";
import { residualScope } from "./scoring/scope";
import { getIndustryTemplate, type IndustryTemplate } from "./templates";
import { deriveStaffFromTeam } from "./sod/derive-staff";
import { soleOwnerCriticalCount } from "./continuity/coverage";
import type { ContinuityStep } from "./decisions/follow-through";
import { trimDecisions } from "./decisions/trim";
import {
  applyDecisionReview,
  captureDecisionSnapshot,
  linkedKnowledgeId,
} from "./decisions/follow-through";
import {
  defaultProfile,
  MAX_DECISION_NOTE,
  MAX_DECISION_SUBJECT,
  MAX_DECISIONS,
  type DecisionDisposition,
  type DecisionEntry,
  type DecisionKind,
  type DecisionReviewOutcome,
  type MapVersion,
  type PlannedAbsence,
  type PracticeProfile,
} from "./practice-profile";
import type { SavedProcessBlock } from "./builder/process-blocks";
import type { MapSnapshot } from "./builder/map-history";
import { adoptOwnTeam, processesToEdit, replacesSampleTeam } from "./business-lifecycle";
import {
  confirmAccessRemoved,
  departuresBetween,
  noteDepartures,
  type Departure,
} from "./continuity/access-removal";
import type { ReviewRecord } from "./firm/reviews";
import type { AccessReconciliation } from "./firm/reconcile";
import { localDateKey, formatDay } from "./dates";
import { nameKey, uid } from "./text";
import { DEFAULT_BUSINESS_ID, MAX_BUSINESS_NAME } from "./business-id";
import { stripProcedureLinks } from "./procedures/coverage-link";
import { verifyProcedure, withProcedureEdit, type VerifyingAccount } from "./procedures/lifecycle";
import { PROCEDURE_LIMITS, proceduresBytes } from "./procedures/normalize";
import { withProof } from "./procedures/proof";
import { verificationBlockers } from "./procedures/writing";
import type { Place, Procedure, ProcedureProof } from "./procedures/types";

/**
 * Every edit the app makes to a business, as a pure function from one
 * profile to the next. The provider wraps each in a state update; tests and
 * server code can call them directly. None of them stamps `updatedAt` — the
 * reducer does that for every edit that produces a new object.
 *
 * Every edit that moves the team, the map or the register re-derives the
 * staff figures from it, and every write of the staff figures keeps the risk
 * variables' copy of the two control flags in step (`mergeStaffIntoVariables`).
 */

export interface DecisionInput {
  subject: string;
  kind: DecisionKind;
  note: string;
  reviewBy?: string;
  residualAtDecision?: number;
  linkedTab?: string;
  linkedId?: string;
  linkedStep?: ContinuityStep;
  linkedPersonId?: string;
  linkedAbsenceId?: string;
  /** Set only by "Not valid" on a duty-conflict card: the finding was judged not valid. */
  disposition?: DecisionDisposition;
}

const MAX_MAP_VERSIONS = 12;
const MAX_HEALTH_POINTS = 90;
const MAX_SAVED_BLOCKS = 24;

// ── Reads ──────────────────────────────────────────────────────────────────

/**
 * A React-style update (a value, or an updater of the current value) applied
 * to `current`. `C` differs from `T` for the overrides whose value may be
 * null ("back to the template") while the updater receives the list in use.
 */
export function resolveUpdate<T, C = T>(update: T | ((current: C) => T), current: C): T {
  return typeof update === "function" ? (update as (c: C) => T)(current) : update;
}

/** The people the map builder edits: the owner's, or the sample's. */
export function currentPeople(p: PracticeProfile): Person[] {
  return p.customPeople ?? getIndustryTemplate(p.industry).people;
}

/** True when the process map differs from the industry template. */
export function isMapCustomized(p: PracticeProfile): boolean {
  return Boolean(p.customProcesses || p.customPeople || Object.keys(p.mapLayout ?? {}).length > 0);
}

// ── Setup ──────────────────────────────────────────────────────────────────

/**
 * The business renamed. With `businessId`, only when `p` is that business: a
 * name typed for one business and committed after a switch leaves the next
 * one as it was.
 */
export function withPracticeName(
  p: PracticeProfile,
  name: string,
  businessId?: string,
): PracticeProfile {
  if (businessId !== undefined && (p.businessId ?? DEFAULT_BUSINESS_ID) !== businessId) return p;
  return { ...p, practiceName: name.slice(0, MAX_BUSINESS_NAME) };
}

/** A fresh profile for the industry, keeping the name (unless it was a demo's), the journal and the id. */
export function withIndustry(p: PracticeProfile, industry: IndustryId): PracticeProfile {
  return {
    ...defaultProfile(industry),
    practiceName: isDemoName(p.practiceName) ? industryMeta(industry).demoName : p.practiceName,
    decisions: p.decisions,
    businessId: p.businessId,
    onboardingComplete: true,
  };
}

/** Someone the roster left out who is on the team after all is not a leaver. */
export function withRosterLeavers(
  p: PracticeProfile,
  people: readonly Person[],
  leftOut: readonly Departure[],
  today = localDateKey(new Date()),
): PracticeProfile {
  const onTeam = new Set(people.map((person) => nameKey(person.name)));
  const gone = leftOut.filter((who) => !onTeam.has(nameKey(who.name)));
  if (gone.length === 0) return p;
  return {
    ...p,
    leaverAccessChecks: noteDepartures(
      p.leaverAccessChecks ?? [],
      gone,
      "roster",
      p.industry,
      today,
    ),
  };
}

// ── Settings ───────────────────────────────────────────────────────────────

/**
 * The owner's figures. On an own team the segregation score and the bank
 * reconciliation answer come from the team's duties alone, so a value passed
 * here for either is not saved: change who holds which duties to move them.
 * A sample business keeps both as set, marked manual so the report says
 * they were set by hand.
 */
export function withStaff(p: PracticeProfile, raw: StaffComposition): PracticeProfile {
  if (p.customPeople) return withStaffFigures(p, { ...raw, ...dutyFigures(p.staff) });
  return withStaffFigures(p, {
    ...raw,
    ...(raw.segregationScore !== p.staff.segregationScore
      ? { segregationSource: "manual" as const }
      : {}),
    ...(raw.independentBankRec !== p.staff.independentBankRec
      ? { bankRecSource: "manual" as const }
      : {}),
  });
}

export function withRiskVariables(p: PracticeProfile, next: RiskVariableState): PracticeProfile {
  const staff: StaffComposition = {
    ...p.staff,
    dualControlPayments: next.hasDualControl,
    independentBankRec: p.customPeople ? p.staff.independentBankRec : next.hasIndependentBankRec,
  };
  return withStaffFigures({ ...p, riskVariables: next }, staff);
}

/** The two staff figures an own team's duties decide, as they stand. */
function dutyFigures(
  staff: StaffComposition,
): Pick<
  StaffComposition,
  "segregationScore" | "segregationSource" | "independentBankRec" | "bankRecSource"
> {
  return {
    segregationScore: staff.segregationScore,
    segregationSource: staff.segregationSource,
    independentBankRec: staff.independentBankRec,
    bankRecSource: staff.bankRecSource,
  };
}

/** The dual-release policy; dual control on payments follows its master switch and payment rules. */
export function withDualRelease(
  p: PracticeProfile,
  raw: DualReleasePolicy,
  now: Date,
): PracticeProfile {
  const tpl = resolveTemplate(p);
  const dualRelease = mergeDualReleasePolicy(tpl, raw, p.staff, now);
  // The same reading as the SoD engine: payment channels someone can operate, no blanket waiver.
  const flags = staffFlagsFromDualRelease(dualRelease, tpl, localDateKey(now));
  const staff = { ...p.staff, dualControlPayments: flags.dualControlPayments };
  return {
    ...p,
    dualRelease: { ...dualRelease, updatedAt: now.toISOString() },
    staff,
    riskVariables: mergeStaffIntoVariables(p.riskVariables, staff),
  };
}

/** Drops the manual segregation score: it is read from the team's duties again. */
export function withDerivedSegregation(p: PracticeProfile): PracticeProfile {
  return withStaffFromTeam(
    { ...p, staff: { ...p.staff, segregationSource: "derived" } },
    resolveTemplate(p),
  );
}

// ── Journal ────────────────────────────────────────────────────────────────

export function withDecision(
  p: PracticeProfile,
  input: DecisionInput,
  id: string,
  now: Date,
): PracticeProfile {
  const snapshot = captureDecisionSnapshot(
    resolveTemplate(p),
    p.staff,
    p.dualRelease,
    input.subject,
    now,
    input.linkedTab === "knowledge" ? input.linkedId : undefined,
    residualScope({ decisions: p.decisions, industry: p.industry, riskVariables: p.riskVariables }),
  );
  const entry: DecisionEntry = {
    id,
    createdAt: now.toISOString(),
    subject: input.subject.slice(0, MAX_DECISION_SUBJECT),
    kind: input.kind,
    note: input.note.slice(0, MAX_DECISION_NOTE),
    reviewBy: input.reviewBy,
    residualAtDecision: input.residualAtDecision ?? snapshot.subjectResidual,
    linkedTab: input.linkedTab,
    linkedId: input.linkedId,
    ...(input.linkedId ? { linkedIndustry: p.industry } : {}),
    ...(input.linkedStep ? { linkedStep: input.linkedStep } : {}),
    ...(input.linkedPersonId ? { linkedPersonId: input.linkedPersonId } : {}),
    ...(input.linkedAbsenceId ? { linkedAbsenceId: input.linkedAbsenceId } : {}),
    ...(input.disposition ? { disposition: input.disposition } : {}),
    snapshot,
  };
  return { ...p, decisions: withinDecisionCap([entry, ...p.decisions], p.industry) };
}

/** The journal (newest first) within MAX_DECISIONS, trimmed as `trimDecisions` trims. */
function withinDecisionCap(entries: DecisionEntry[], industry: IndustryId): DecisionEntry[] {
  return trimDecisions(entries, MAX_DECISIONS, industry).kept;
}

/**
 * How many older entries the journal loses when `added` (newest first) are
 * logged on `p`: what `withDecision` and `withLeaversConfirmed` trim, read
 * before the edit so the owner can be told.
 */
export function decisionsTrimmedBy(
  p: PracticeProfile,
  added: readonly Pick<DecisionEntry, "kind" | "linkedId" | "disposition">[],
): number {
  if (p.decisions.length + added.length <= MAX_DECISIONS) return 0;
  const incoming = added.map((d) => ({ ...d, linkedIndustry: p.industry }));
  return trimDecisions([...incoming, ...p.decisions], MAX_DECISIONS, p.industry).dropped;
}

/** What the owner is told when logging decisions trimmed `dropped` older ones. */
export function decisionsTrimmedNotice(dropped: number): string {
  const cap = MAX_DECISIONS.toLocaleString("en-US");
  const older = dropped === 1 ? "1 older one" : `${dropped.toLocaleString("en-US")} older ones`;
  return `Precog kept the newest ${cap} decisions and removed ${older} that no current finding uses. Download a recovery copy first if you need them.`;
}

export function withoutDecision(p: PracticeProfile, id: string): PracticeProfile {
  return { ...p, decisions: p.decisions.filter((d) => d.id !== id) };
}

export function withDecisionReview(
  p: PracticeProfile,
  id: string,
  outcome: DecisionReviewOutcome,
  note: string | undefined,
  extendDays: number,
  now: Date,
): PracticeProfile {
  const decision = p.decisions.find((d) => d.id === id);
  if (!decision) return p;
  const snapshot = captureDecisionSnapshot(
    resolveTemplate(p),
    p.staff,
    p.dualRelease,
    decision.subject,
    now,
    linkedKnowledgeId(decision, p.industry),
    residualScope({ decisions: p.decisions, industry: p.industry, riskVariables: p.riskVariables }),
  );
  const trimmedNote = note?.trim();
  const reviewed = applyDecisionReview(
    decision,
    { at: snapshot.at, outcome, ...(trimmedNote ? { note: trimmedNote } : {}), snapshot },
    extendDays,
  );
  return { ...p, decisions: p.decisions.map((d) => (d.id === id ? reviewed : d)) };
}

// ── Leavers ────────────────────────────────────────────────────────────────

/** The owner confirmed these leavers are off payroll and their logins removed. */
export function withLeaversConfirmed(
  p: PracticeProfile,
  checkIds: string[],
  today: string,
): PracticeProfile {
  const { checks, decisions } = confirmAccessRemoved(p.leaverAccessChecks ?? [], checkIds, today);
  if (decisions.length === 0) return p;
  return {
    ...p,
    leaverAccessChecks: checks,
    decisions: withinDecisionCap([...decisions, ...p.decisions], p.industry),
  };
}

// ── Team, map and register ─────────────────────────────────────────────────

/**
 * Replace the team. Replacing the sample's people with the owner's gives the
 * same clean slate as setup; anyone who has just left, by being marked as
 * left or arriving terminated in an imported roster, gets a pay-and-logins
 * check. A nonprofit has no owner, so no imported person keeps the mark.
 */
export function withPeople(
  p: PracticeProfile,
  given: Person[] | null,
  today: string,
): PracticeProfile {
  const current = currentPeople(p);
  const next =
    given && !industryHasOwner(p.industry)
      ? given.map((person) => (person.owner === false ? person : { ...person, owner: false }))
      : given;
  const base = next && replacesSampleTeam(p, next) ? adoptOwnTeam(p, next) : p;
  const withTeam = { ...base, customPeople: next };
  const derived = next ? withStaffFromTeam(withTeam, resolveTemplate(withTeam)) : withTeam;
  const sample = getIndustryTemplate(p.industry).people;
  const known = new Set(current.map((person) => person.id));
  const left = departuresBetween(current, next, sample);
  const before = base.leaverAccessChecks ?? [];
  let checks = noteDepartures(
    before,
    left.filter((who) => who.personId && known.has(who.personId)),
    "marked",
    p.industry,
    today,
  );
  checks = noteDepartures(
    checks,
    left.filter((who) => !who.personId || !known.has(who.personId)),
    "roster",
    p.industry,
    today,
  );
  return checks !== before ? { ...derived, leaverAccessChecks: checks } : derived;
}

export function withProcesses(p: PracticeProfile, next: ProcessNode[] | null): PracticeProfile {
  const withMap = { ...p, customProcesses: next };
  return p.customPeople ? withStaffFromTeam(withMap, resolveTemplate(withMap)) : withMap;
}

export function withKnowledge(p: PracticeProfile, next: KnowledgeItem[] | null): PracticeProfile {
  return withContinuityStaff({ ...p, customKnowledge: next && stripProcedureLinks(next) });
}

export function withRelations(
  p: PracticeProfile,
  next: KnowledgeRelation[] | null,
): PracticeProfile {
  return withContinuityStaff({ ...p, customRelations: next });
}

export function withPlannedAbsences(p: PracticeProfile, next: PlannedAbsence[]): PracticeProfile {
  return { ...p, plannedAbsences: next };
}

export function withPlaces(p: PracticeProfile, next: Place[]): PracticeProfile {
  return { ...p, places: next.slice(0, PROCEDURE_LIMITS.places) };
}

/**
 * The business with `next` saved over the procedure of the same id (or added
 * first). A content change clears its verification (see withProcedureEdit).
 * Unchanged when the procedures would no longer fit the byte budget; check
 * `procedureFits` first to tell the owner why.
 */
export function withProcedure(p: PracticeProfile, next: Procedure, today: string): PracticeProfile {
  const list = p.procedures ?? [];
  const prev = list.find((x) => x.id === next.id) ?? null;
  if (!prev && list.length >= PROCEDURE_LIMITS.procedures) return p;
  const saved = withProcedureEdit(prev, next, today);
  const procedures = prev ? list.map((x) => (x.id === next.id ? saved : x)) : [saved, ...list];
  if (proceduresBytes(procedures) > PROCEDURE_LIMITS.bytes) return p;
  return { ...p, procedures };
}

/** Whether saving `next` keeps the procedures within their count and byte limits. */
export function procedureFits(p: PracticeProfile, next: Procedure, today: string): boolean {
  const list = p.procedures ?? [];
  const prev = list.find((x) => x.id === next.id) ?? null;
  if (!prev && list.length >= PROCEDURE_LIMITS.procedures) return false;
  const others = list.filter((x) => x.id !== next.id);
  // Measured as withProcedure will store it, with the change-log entry the edit adds.
  const saved = withProcedureEdit(prev, next, today);
  return proceduresBytes([saved, ...others]) <= PROCEDURE_LIMITS.bytes;
}

/**
 * The business with procedure `id` verified by `verifiedBy` (a person id, or
 * "owner") on `today`, recorded under the signed-in `account` when there is one.
 * A procedure whose writing has errors (procedures/writing.ts) stays unverified.
 */
export function withProcedureVerified(
  p: PracticeProfile,
  id: string,
  verifiedBy: string,
  today: string,
  account?: VerifyingAccount | null,
): PracticeProfile {
  return {
    ...p,
    procedures: (p.procedures ?? []).map((x) =>
      x.id === id && verificationBlockers(x).length === 0
        ? verifyProcedure(x, verifiedBy, today, account)
        : x,
    ),
  };
}

/** The business with a run of procedure `id` recorded (see procedures/proof.ts). */
export function withProcedureProof(
  p: PracticeProfile,
  id: string,
  proof: Omit<ProcedureProof, "id">,
): PracticeProfile {
  return {
    ...p,
    procedures: (p.procedures ?? []).map((x) => (x.id === id ? withProof(x, proof) : x)),
  };
}

export function withoutProcedure(p: PracticeProfile, id: string): PracticeProfile {
  return { ...p, procedures: (p.procedures ?? []).filter((x) => x.id !== id) };
}

export function withMapLayout(
  p: PracticeProfile,
  next: Record<string, { x: number; y: number }>,
): PracticeProfile {
  return { ...p, mapLayout: next };
}

export function withSavedBlocks(p: PracticeProfile, next: SavedProcessBlock[]): PracticeProfile {
  return { ...p, savedProcessBlocks: next.slice(0, MAX_SAVED_BLOCKS) };
}

/**
 * Append a map completeness point when the score changes; rapid edits within
 * a minute collapse into one. Points go to the completeness series; the
 * retired map health series stays as saved.
 */
export function withMapHealth(p: PracticeProfile, score: number, now: Date): PracticeProfile {
  const history = p.mapCompletenessHistory ?? [];
  const last = history[history.length - 1];
  if (last && last.score === score) return p;
  const trimmed =
    last && now.getTime() - new Date(last.at).getTime() < 60_000 ? history.slice(0, -1) : history;
  return {
    ...p,
    mapCompletenessHistory: [...trimmed, { at: now.toISOString(), score }].slice(
      -MAX_HEALTH_POINTS,
    ),
  };
}

export function makeMapVersion(p: PracticeProfile, name: string, healthScore: number): MapVersion {
  const tpl = getIndustryTemplate(p.industry);
  return {
    id: uid("ver"),
    name: name.trim().slice(0, 60) || `Version ${formatDay(new Date())}`,
    createdAt: new Date().toISOString(),
    healthScore,
    processes: structuredClone(processesToEdit(p)),
    people: structuredClone(p.customPeople ?? tpl.people),
    layout: { ...(p.mapLayout ?? {}) },
  };
}

export function withMapVersion(p: PracticeProfile, version: MapVersion): PracticeProfile {
  return { ...p, mapVersions: [version, ...(p.mapVersions ?? [])].slice(0, MAX_MAP_VERSIONS) };
}

export function withoutMapVersion(p: PracticeProfile, id: string): PracticeProfile {
  return { ...p, mapVersions: (p.mapVersions ?? []).filter((v) => v.id !== id) };
}

/**
 * Put a map snapshot back (undo, redo): the processes, the team and the
 * layout. The team goes through `withPeople`, so the staff figures, the
 * nonprofit owner rule and the leaver checks follow the team that comes back,
 * exactly as they do after an edit.
 */
export function withMapSnapshot(
  p: PracticeProfile,
  snapshot: MapSnapshot,
  today: string,
): PracticeProfile {
  const withMap = withProcesses(
    { ...p, mapLayout: snapshot.mapLayout ?? {} },
    snapshot.customProcesses ?? null,
  );
  return withPeople(withMap, snapshot.customPeople ?? null, today);
}

export function withRestoredVersion(
  p: PracticeProfile,
  v: MapVersion,
  today: string,
): PracticeProfile {
  return withMapSnapshot(
    p,
    {
      customProcesses: structuredClone(v.processes),
      customPeople: structuredClone(v.people),
      mapLayout: { ...v.layout },
    },
    today,
  );
}

// ── Records ────────────────────────────────────────────────────────────────

/** Monthly close results, replaced as a list: a later result is appended by `recordReview`. */
export function withMonthlyReviews(p: PracticeProfile, next: ReviewRecord[]): PracticeProfile {
  return { ...p, monthlyReviews: next };
}

export function withAccessReconciliation(
  p: PracticeProfile,
  next: AccessReconciliation,
): PracticeProfile {
  const draft = { ...p, accessReconciliation: next };
  const integrationDriftSummary = refreshIntegrationDriftSummary(draft);
  return integrationDriftSummary
    ? { ...draft, integrationDriftSummary }
    : { ...draft, integrationDriftSummary: undefined };
}

export function withIntegrationDriftSummary(
  p: PracticeProfile,
  qboDrift: IntegrationDrift | null,
): PracticeProfile {
  const integrationDriftSummary = refreshIntegrationDriftSummary(p, qboDrift);
  return integrationDriftSummary
    ? { ...p, integrationDriftSummary }
    : { ...p, integrationDriftSummary: undefined };
}

/** Stamps the day the report first went to the owner's advisor; a later click keeps the first stamp. */
export function withReportSent(p: PracticeProfile, now: Date): PracticeProfile {
  if (p.engagement?.reportSentAt) return p;
  return { ...p, engagement: { ...p.engagement, reportSentAt: now.toISOString() } };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sets the staff figures. The risk variables' copy of the two control flags
 * follows them, and turning dual control on or off here turns the
 * dual-release master switch with it.
 */
function withStaffFigures(p: PracticeProfile, staff: StaffComposition): PracticeProfile {
  const switched = staff.dualControlPayments !== p.staff.dualControlPayments;
  return {
    ...p,
    staff,
    riskVariables: mergeStaffIntoVariables(p.riskVariables, staff),
    dualRelease: switched
      ? { ...p.dualRelease, enabled: staff.dualControlPayments }
      : p.dualRelease,
  };
}

/**
 * The staff figures re-read from a real team: everything derivable is
 * derived, including a figure the sample it replaced had set by hand.
 */
function withStaffFromTeam(p: PracticeProfile, tpl: IndustryTemplate): PracticeProfile {
  return withStaffFigures(
    p,
    deriveStaffFromTeam(
      tpl,
      {
        ...p.staff,
        segregationSource: "derived",
        bankRecSource: p.staff.bankRecSource === "outside" ? "outside" : "derived",
      },
      { dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(p.dualRelease, tpl) },
    ),
  );
}

/**
 * Re-derive the staff figures that depend on the register. With a real team
 * everything derivable is derived; with template people only the sole-owner
 * count moves, read from the register in use (the sample's own register
 * included), so every screen shows the same figure.
 */
function withContinuityStaff(p: PracticeProfile): PracticeProfile {
  const tpl = resolveTemplate(p);
  if (p.customPeople) return withStaffFromTeam(p, tpl);
  return { ...p, staff: { ...p.staff, soleOwnerKnowledgeCount: soleOwnerCriticalCount(tpl) } };
}
