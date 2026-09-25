import { normalizeRiskVariables } from "../practice-profile";
import { isIndustryId, type IndustryId } from "../industry";
import { resolveTemplate } from "../active-template";
import { mergeDualReleasePolicy, type DualReleasePolicy } from "../controls/dual-release";
import {
  DECISION_KIND_LABEL,
  defaultProfile,
  normalizePlannedAbsences,
  type DecisionEntry,
  type DecisionKind,
  type PlannedAbsence,
  type PracticeProfile,
} from "../practice-profile";
import type { ContinuityStep } from "../continuity/absence-impact";
import type { RiskVariableState } from "../scoring/dynamic-variables";
import type {
  KnowledgeItem,
  KnowledgeRelation,
  Person,
  ProcessNode,
  StaffComposition,
} from "../types";
import { PIONEER_LIST_CAPS } from "../public-inputs";

/** The slice of a PracticeProfile that changes what Pioneer computes. */
export interface PioneerProfileInput {
  industry?: IndustryId;
  practiceName?: string;
  staff?: Partial<StaffComposition>;
  riskVariables?: Partial<RiskVariableState>;
  dualRelease?: Partial<DualReleasePolicy> | null;
  customProcesses?: ProcessNode[] | null;
  customPeople?: Person[] | null;
  customKnowledge?: KnowledgeItem[] | null;
  customRelations?: KnowledgeRelation[] | null;
  /** Journal entries, so Pioneer knows which continuity steps are already committed to. */
  decisions?: DecisionEntry[] | null;
  /** Known leave, so Pioneer can warn ahead of it. */
  plannedAbsences?: PlannedAbsence[] | null;
}

function capList<T>(list: T[] | null | undefined): T[] | null {
  return Array.isArray(list) ? list.slice(0, PIONEER_LIST_CAPS.nodes) : null;
}

const MAX_DECISION_TEXT = 300;
const CONTINUITY_STEPS: readonly ContinuityStep[] = ["cover", "handoff", "document", "locate"];

function optionalString(value: unknown, max = 120): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

function isDecisionKind(value: unknown): value is DecisionKind {
  return typeof value === "string" && value in DECISION_KIND_LABEL;
}

/**
 * Rebuild a Journal entry from an untrusted payload, keeping only the fields
 * Pioneer reads and only when they have the expected shape. Entries without a
 * usable id, date or kind are dropped; snapshots and review history are not
 * needed server-side and are not carried.
 */
function sanitizeDecision(value: unknown): DecisionEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.createdAt !== "string") return null;
  if (!isDecisionKind(raw.kind)) return null;
  const status = raw.status === "open" || raw.status === "closed" ? raw.status : undefined;
  const linkedStep = CONTINUITY_STEPS.find((s) => s === raw.linkedStep);
  const linkedIndustry = isIndustryId(raw.linkedIndustry) ? raw.linkedIndustry : undefined;
  return {
    id: raw.id.slice(0, MAX_DECISION_TEXT),
    createdAt: raw.createdAt.slice(0, 40),
    subject: optionalString(raw.subject, MAX_DECISION_TEXT) ?? "",
    kind: raw.kind,
    note: optionalString(raw.note, MAX_DECISION_TEXT) ?? "",
    reviewBy: optionalString(raw.reviewBy, 40),
    linkedTab: optionalString(raw.linkedTab),
    linkedId: optionalString(raw.linkedId),
    linkedIndustry,
    linkedStep,
    linkedPersonId: optionalString(raw.linkedPersonId),
    linkedAbsenceId: optionalString(raw.linkedAbsenceId),
    status,
  };
}

/**
 * Build the canonical profile Pioneer reasons over. Missing fields fall back
 * to the chosen industry's template — never to another industry's.
 */
export function pioneerProfileFrom(input: PioneerProfileInput): PracticeProfile {
  const industry: IndustryId = isIndustryId(input.industry) ? input.industry : "general";
  const base = defaultProfile(industry);
  const staff: StaffComposition = { ...base.staff, ...(input.staff ?? {}) };
  const customProcesses = capList(input.customProcesses);
  const customPeople = capList(input.customPeople);
  const customKnowledge = capList(input.customKnowledge);
  const customRelations = Array.isArray(input.customRelations)
    ? input.customRelations.slice(0, PIONEER_LIST_CAPS.relations)
    : null;
  const dualRelease = mergeDualReleasePolicy(
    resolveTemplate({ industry, customProcesses, customPeople, customKnowledge, customRelations }),
    input.dualRelease,
    staff,
  );
  const riskVariables: RiskVariableState = {
    ...normalizeRiskVariables(input.riskVariables, base.riskVariables),
    hasDualControl: staff.dualControlPayments,
    hasIndependentBankRec: staff.independentBankRec,
  };
  const practiceName = (input.practiceName ?? "").trim().slice(0, 80);
  const decisions = Array.isArray(input.decisions)
    ? input.decisions
        .slice(0, PIONEER_LIST_CAPS.decisions)
        .map(sanitizeDecision)
        .filter((d): d is DecisionEntry => d !== null)
    : base.decisions;
  const plannedAbsences = normalizePlannedAbsences(input.plannedAbsences).slice(
    0,
    PIONEER_LIST_CAPS.absences,
  );
  return {
    ...base,
    practiceName: practiceName || base.practiceName,
    industry,
    staff,
    riskVariables,
    dualRelease,
    customProcesses,
    customPeople,
    customKnowledge,
    customRelations,
    decisions,
    plannedAbsences,
  };
}
