import type { SetStateAction } from "react";
import type {
  KnowledgeItem,
  KnowledgeRelation,
  Person,
  ProcessNode,
  StaffComposition,
} from "./types";
import type { RiskVariableState } from "./scoring/dynamic-variables";
import {
  mergeDualReleasePolicy,
  mitigatedSodRuleIds,
  staffFlagsFromDualRelease,
  type DualReleasePolicy,
} from "./controls/dual-release";
import { industryHasOwner, industryMeta, isDemoName, type IndustryId } from "./industry";
import { resolveTemplate } from "./active-template";
import { getIndustryTemplate } from "./templates";
import { deriveStaffFromTeam } from "./sod/derive-staff";
import { soleOwnerCriticalCount } from "./continuity/coverage";
import { type ContinuityStep } from "./continuity/absence-impact";
import {
  applyDecisionReview,
  captureDecisionSnapshot,
  linkedKnowledgeId,
  localDateKey,
} from "./decisions/follow-through";
import {
  defaultProfile,
  type DecisionEntry,
  type DecisionKind,
  type DecisionReviewOutcome,
  type MapVersion,
  type PlannedAbsence,
  type PracticeProfile,
} from "./practice-profile";
import type { SavedProcessBlock } from "./builder/process-blocks";
import { adoptOwnTeam, processesToEdit, replacesSampleTeam } from "./business-lifecycle";
import {
  confirmAccessRemoved,
  departuresBetween,
  markPrompted,
  noteDepartures,
  type Departure,
} from "./continuity/access-removal";

/**
 * Every edit the app makes to a business, as a pure function from one
 * profile to the next. The provider wraps each in a state update; tests and
 * server code can call them directly. None of them stamps `updatedAt` — the
 * reducer does that for every edit that produces a new object.
 */
export const MAX_DECISIONS = 100;
const MAX_MAP_VERSIONS = 12;
const MAX_HEALTH_POINTS = 90;
const MAX_SAVED_BLOCKS = 24;

/** A React-style update (value or updater) applied to the current value. */
export function resolveUpdate<T>(update: SetStateAction<T>, current: T): T {
  return typeof update === "function" ? (update as (c: T) => T)(current) : update;
}

/**
 * Re-derive the staff figures that depend on the register. With a real team
 * everything derivable is derived; with template people only the sole-owner
 * count moves, read from the register in use (the sample's own register
 * included), so every screen shows the same figure.
 */
function deriveContinuityStaff(p: PracticeProfile): StaffComposition {
  const tpl = resolveTemplate(p);
  if (p.customPeople) {
    return deriveStaffFromTeam(tpl, p.staff, {
      dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(p.dualRelease, tpl),
    });
  }
  return { ...p.staff, soleOwnerKnowledgeCount: soleOwnerCriticalCount(tpl) };
}

export function withPracticeName(p: PracticeProfile, name: string): PracticeProfile {
  return { ...p, practiceName: name.slice(0, 80) };
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

export function withStaff(p: PracticeProfile, raw: StaffComposition): PracticeProfile {
  const scoreSet =
    p.customPeople && raw.segregationScore !== p.staff.segregationScore
      ? { ...raw, segregationSource: "manual" as const }
      : raw;
  // Flipping the bank-reconciliation flag by hand keeps it: later team
  // edits no longer re-read it from the duties.
  const next =
    p.customPeople && raw.independentBankRec !== p.staff.independentBankRec
      ? { ...scoreSet, bankRecSource: "manual" as const }
      : scoreSet;
  return {
    ...p,
    staff: next,
    dualRelease: { ...p.dualRelease, enabled: next.dualControlPayments },
    riskVariables: {
      ...p.riskVariables,
      hasDualControl: next.dualControlPayments,
      hasIndependentBankRec: next.independentBankRec,
    },
  };
}

export function withRiskVariables(p: PracticeProfile, next: RiskVariableState): PracticeProfile {
  return {
    ...p,
    riskVariables: next,
    staff: {
      ...p.staff,
      dualControlPayments: next.hasDualControl,
      independentBankRec: next.hasIndependentBankRec,
      ...(p.customPeople && next.hasIndependentBankRec !== p.staff.independentBankRec
        ? { bankRecSource: "manual" as const }
        : {}),
    },
    dualRelease: { ...p.dualRelease, enabled: next.hasDualControl },
  };
}

export function withDualRelease(
  p: PracticeProfile,
  raw: DualReleasePolicy,
  now: Date,
): PracticeProfile {
  const dualRelease = mergeDualReleasePolicy(resolveTemplate(p), raw, p.staff);
  const flags = staffFlagsFromDualRelease(dualRelease);
  return {
    ...p,
    dualRelease: { ...dualRelease, updatedAt: now.toISOString() },
    staff: { ...p.staff, dualControlPayments: flags.dualControlPayments },
    riskVariables: { ...p.riskVariables, hasDualControl: flags.dualControlPayments },
  };
}

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
}

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
  );
  const entry: DecisionEntry = {
    id,
    createdAt: now.toISOString(),
    subject: input.subject.slice(0, 120),
    kind: input.kind,
    note: input.note.slice(0, 800),
    reviewBy: input.reviewBy,
    residualAtDecision: input.residualAtDecision ?? snapshot.subjectResidual,
    linkedTab: input.linkedTab,
    linkedId: input.linkedId,
    ...(input.linkedId ? { linkedIndustry: p.industry } : {}),
    ...(input.linkedStep ? { linkedStep: input.linkedStep } : {}),
    ...(input.linkedPersonId ? { linkedPersonId: input.linkedPersonId } : {}),
    ...(input.linkedAbsenceId ? { linkedAbsenceId: input.linkedAbsenceId } : {}),
    snapshot,
  };
  return { ...p, decisions: [entry, ...p.decisions].slice(0, MAX_DECISIONS) };
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
  );
  const trimmedNote = note?.trim();
  const reviewed = applyDecisionReview(
    decision,
    { at: snapshot.at, outcome, ...(trimmedNote ? { note: trimmedNote } : {}), snapshot },
    extendDays,
  );
  return { ...p, decisions: p.decisions.map((d) => (d.id === id ? reviewed : d)) };
}

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
    decisions: [...decisions, ...p.decisions].slice(0, MAX_DECISIONS),
  };
}

export function withLeaversPrompted(p: PracticeProfile, checkIds: string[]): PracticeProfile {
  const before = p.leaverAccessChecks ?? [];
  const after = markPrompted(before, checkIds);
  return after.some((check, i) => check !== before[i]) ? { ...p, leaverAccessChecks: after } : p;
}

/** The people the map builder edits: the owner's, or the sample's. */
export function currentPeople(p: PracticeProfile): Person[] {
  return p.customPeople ?? getIndustryTemplate(p.industry).people;
}

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
  const nextTemplate = next ? resolveTemplate({ ...base, customPeople: next }) : null;
  const staff = nextTemplate
    ? deriveStaffFromTeam(nextTemplate, base.staff, {
        dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(base.dualRelease, nextTemplate),
      })
    : base.staff;
  const sample = getIndustryTemplate(p.industry).people;
  const known = new Set(current.map((person) => person.id));
  const left = departuresBetween(current, next, sample);
  let checks = base.leaverAccessChecks ?? [];
  checks = noteDepartures(
    checks,
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
  return {
    ...base,
    customPeople: next,
    staff,
    ...(checks !== (base.leaverAccessChecks ?? []) ? { leaverAccessChecks: checks } : {}),
  };
}

export function withProcesses(p: PracticeProfile, next: ProcessNode[] | null): PracticeProfile {
  const nextTemplate = p.customPeople ? resolveTemplate({ ...p, customProcesses: next }) : null;
  const staff = nextTemplate
    ? deriveStaffFromTeam(nextTemplate, p.staff, {
        dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(p.dualRelease, nextTemplate),
      })
    : p.staff;
  return { ...p, customProcesses: next, staff };
}

export function withKnowledge(p: PracticeProfile, next: KnowledgeItem[] | null): PracticeProfile {
  const withRegister = { ...p, customKnowledge: next };
  return { ...withRegister, staff: deriveContinuityStaff(withRegister) };
}

export function withRelations(
  p: PracticeProfile,
  next: KnowledgeRelation[] | null,
): PracticeProfile {
  const withRegister = { ...p, customRelations: next };
  return { ...withRegister, staff: deriveContinuityStaff(withRegister) };
}

export function withPlannedAbsences(p: PracticeProfile, next: PlannedAbsence[]): PracticeProfile {
  return { ...p, plannedAbsences: next };
}

export function withDerivedSegregation(p: PracticeProfile): PracticeProfile {
  const tpl = resolveTemplate(p);
  return {
    ...p,
    staff: deriveStaffFromTeam(
      tpl,
      { ...p.staff, segregationSource: "derived" },
      { dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(p.dualRelease, tpl) },
    ),
  };
}

export function withMapLayout(
  p: PracticeProfile,
  next: Record<string, { x: number; y: number }>,
): PracticeProfile {
  return { ...p, mapLayout: next };
}

export function isMapCustomized(p: PracticeProfile): boolean {
  return Boolean(p.customProcesses || p.customPeople || Object.keys(p.mapLayout ?? {}).length > 0);
}

export function withSavedBlocks(p: PracticeProfile, next: SavedProcessBlock[]): PracticeProfile {
  return { ...p, savedProcessBlocks: next.slice(0, MAX_SAVED_BLOCKS) };
}

/** Append a health point when the score changes; rapid edits within a minute collapse into one. */
export function withMapHealth(p: PracticeProfile, score: number, now: Date): PracticeProfile {
  const history = p.mapHealthHistory ?? [];
  const last = history[history.length - 1];
  if (last && last.score === score) return p;
  const trimmed =
    last && now.getTime() - new Date(last.at).getTime() < 60_000 ? history.slice(0, -1) : history;
  return {
    ...p,
    mapHealthHistory: [...trimmed, { at: now.toISOString(), score }].slice(-MAX_HEALTH_POINTS),
  };
}

export function makeMapVersion(p: PracticeProfile, name: string, healthScore: number): MapVersion {
  const tpl = getIndustryTemplate(p.industry);
  return {
    id: `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, 60) || `Version ${new Date().toLocaleDateString()}`,
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

export function withRestoredVersion(p: PracticeProfile, v: MapVersion): PracticeProfile {
  return {
    ...p,
    customProcesses: structuredClone(v.processes),
    customPeople: structuredClone(v.people),
    mapLayout: { ...v.layout },
  };
}

/** Someone the roster left out who is on the team after all is not a leaver. */
export function withRosterLeavers(
  p: PracticeProfile,
  people: readonly Person[],
  leftOut: readonly Departure[],
  today = localDateKey(new Date()),
): PracticeProfile {
  const onTeam = new Set(people.map((person) => person.name.trim().toLowerCase()));
  const gone = leftOut.filter((who) => !onTeam.has(who.name.trim().toLowerCase()));
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
