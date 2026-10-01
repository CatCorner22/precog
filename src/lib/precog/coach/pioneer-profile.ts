import { isIndustryId, type IndustryId } from "../industry";
import { resolveTemplate } from "../active-template";
import { mergeDualReleasePolicy, type DualReleasePolicy } from "../controls/dual-release";
import {
  DECISION_KIND_LABEL,
  defaultProfile,
  normalizePlannedAbsences,
  normalizeRiskVariables,
  type DecisionEntry,
  type DecisionKind,
  type PlannedAbsence,
  type PracticeProfile,
} from "../practice-profile";
import type { ContinuityStep } from "../decisions/follow-through";
import type { RiskVariableState } from "../scoring/dynamic-variables";
import type {
  KnowledgeItem,
  KnowledgeRelation,
  Person,
  ProcessNode,
  StaffComposition,
} from "../types";
import { PIONEER_LIST_CAPS } from "../public-inputs";
import { linkOnlyProcedure, type ProcedureLinkInput } from "../procedures/coverage-link";
import { PROCEDURE_LIMITS } from "../procedures/normalize";

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
  /**
   * Which register items have a written procedure, so Pioneer counts them as
   * written down as every other screen does. Only the links are sent, never
   * the steps, people or pictures.
   */
  procedureLinks?: ProcedureLinkInput[] | null;
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

/** A procedure link from an untrusted payload, bounded; null without an id, title or item. */
function sanitizeProcedureLink(value: unknown): ProcedureLinkInput | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const id = optionalString(raw.id, 60)?.trim();
  const title = optionalString(raw.title, PROCEDURE_LIMITS.title)?.trim();
  const knowledgeIds = Array.isArray(raw.knowledgeIds)
    ? [
        ...new Set(
          raw.knowledgeIds.filter((k): k is string => typeof k === "string" && k.length <= 120),
        ),
      ].slice(0, PROCEDURE_LIMITS.links)
    : [];
  if (!id || !title || !knowledgeIds.length) return null;
  return { id, title, knowledgeIds, ...(raw.draft === true ? { draft: true as const } : {}) };
}

/**
 * Build the canonical profile Pioneer reasons over. Missing fields fall back
 * to the chosen industry's template — never to another industry's. `today`
 * dates the link-only procedures, which no rule reads the date of.
 */
export function pioneerProfileFrom(
  input: PioneerProfileInput,
  today = new Date().toISOString().slice(0, 10),
): PracticeProfile {
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
  const seenLinks = new Set<string>();
  const procedures = (Array.isArray(input.procedureLinks) ? input.procedureLinks : [])
    .slice(0, PIONEER_LIST_CAPS.procedures)
    .map(sanitizeProcedureLink)
    .filter((l): l is ProcedureLinkInput => {
      if (!l || seenLinks.has(l.id)) return false;
      seenLinks.add(l.id);
      return true;
    })
    .map((l) => linkOnlyProcedure(l, industry, today));
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
    ...(procedures.length ? { procedures } : {}),
  };
}
