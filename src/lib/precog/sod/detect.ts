/**
 * Duty-conflict detection: who holds two duties one person must not hold
 * together, how serious each pair is, and what the team should do first.
 *
 * For each active person, every pair of their duties is read against the
 * rulebook (rule-match.ts: named rules, rules read through another channel of
 * a duty, the duty-family catch-all), scored (score.ts), and summed into the
 * team's segregation health index. The recommendations are in
 * recommendations.ts; the assignments themselves in assignments.ts.
 */
import { industryHasOwner, type IndustryId } from "../industry";
import type { IndustryTemplate } from "../templates";
import type { StaffComposition } from "../types";
import { mitigatedSodRuleIds, type DualReleasePolicy } from "../controls/dual-release";
import { buildAssignments, type RoleAssignment } from "./assignments";
import {
  SUBSUMED_BY,
  type DutyFamily,
  type EntitlementId,
  entitlementLabel,
} from "./conflict-rules";
import { teamOwnerId } from "./owner-role";
import { inOverseerWords, sodRecommendations } from "./recommendations";
import {
  ENTITLEMENT_ORDER,
  SUBSUMED_DEFAULTS,
  canonicalPair,
  entitlementFamily,
  entitlementProcesses,
  familyPair,
  familyRuleId,
  findRule,
  sodMatrix,
  teamHeldDuties,
  type RuleMatch,
  type SodMatrixCell,
} from "./rule-match";
import {
  OWNER_HELD_DISCOUNT,
  clampScore,
  rawConflictScore,
  segregationHealthIndex,
  segregationPressure,
  type FindingSeverity,
} from "./score";

export { buildAssignments, type RoleAssignment } from "./assignments";

export interface DetectedConflict {
  id: string;
  ruleId: string;
  personId: string;
  personName: string;
  role: string;
  entitlementA: EntitlementId;
  entitlementB: EntitlementId;
  labelA: string;
  labelB: string;
  severity: FindingSeverity;
  title: string;
  why: string;
  fraudPath: string;
  score: number; // 0–100
  /** Controls that would close or narrow this gap: the rule's suggestions plus anything recorded as in place. */
  compensatingControls: string[];
  /** Controls recorded as in place for this gap (the business's own controls and an active dual-release rule). Only these lower the score. */
  controlsInPlace: string[];
  /**
   * Both duties sit with the owner. An owner cannot steal from themselves, so
   * the exposure is error, tax and lender reliance rather than theft; the
   * finding stays, ranks below every employee's, and asks for an outside reader.
   */
  ownerHeld: boolean;
  residualRiskAccepted: boolean;
  dualReleaseMitigated: boolean;
  linkedScenarioId?: string;
  linkedControlId?: string;
  processIds: string[];
}

export interface SodDetectionReport {
  assignments: RoleAssignment[];
  conflicts: DetectedConflict[];
  matrix: readonly SodMatrixCell[];
  entitlementOrder: readonly EntitlementId[];
  summary: {
    /** Open findings (not owner-held, not narrowed by dual release) by severity. */
    critical: number;
    high: number;
    medium: number;
    family: number;
    /** People with at least one open finding. */
    peopleWithConflicts: number;
    openWithoutAcceptance: number;
    dualReleaseMitigated: number;
    /** Pairs held by the owner: listed, ranked last, counted at half weight. */
    ownerHeld: number;
    /** Money duties no active person holds: a CPA asks who banks the deposits before asking who does two things. */
    unheldDuties: EntitlementId[];
    segregationHealth: number;
  };
  recommendations: string[];
}

export interface SodDetectionOptions {
  assignments?: RoleAssignment[];
  residualAcceptedControlIds?: Set<string>;
  compensatingByControlId?: Record<string, string[]>;
  /** SoD rule IDs mitigated by dual-release policy */
  dualReleaseMitigatedRuleIds?: Set<string>;
  /**
   * The person who owns the business alone, when the caller scans part of a
   * team (one person at a time) and already knows it from the whole team.
   * Omitted, it is read from `assignments`; null means nobody is the sole owner.
   */
  soleOwnerId?: string | null;
  /** The line of business, when there is no template to read it from: a nonprofit has no owner. */
  industry?: IndustryId;
}

/**
 * Duties that check or approve rather than handle or record. For the owner
 * these are the controls themselves: an owner who signs and reads the
 * statement is the design, not a gap.
 */
export const OVERSIGHT_DUTIES: ReadonlySet<EntitlementId> = new Set<EntitlementId>([
  "sign_checks",
  "approve_vendor",
  "approve_invoices",
  "approve_payroll",
  "approve_writeoffs",
  "bank_reconcile",
  "manage_user_access",
  "pms_admin_roles",
  "review_audit_logs",
  "manage_backups",
  "review_card_statement",
  "approve_expenses",
  "view_reports_only",
]);

/**
 * What the business's own control records say: which linked controls carry an
 * accepted residual risk and which list compensating controls in place. Every
 * surface that scores the team reads these the same way, so the health index
 * is one number wherever it appears.
 */
export function controlOptions(
  tpl: Pick<IndustryTemplate, "controls">,
): Pick<SodDetectionOptions, "residualAcceptedControlIds" | "compensatingByControlId"> {
  const compensatingByControlId: Record<string, string[]> = {};
  for (const control of tpl.controls) {
    if (control.compensatingControls.length) {
      compensatingByControlId[control.id] = control.compensatingControls;
    }
  }
  return {
    residualAcceptedControlIds: new Set(
      tpl.controls.filter((control) => control.residualRiskAccepted).map((control) => control.id),
    ),
    compensatingByControlId,
  };
}

export function sodDetectionOptions(
  tpl: IndustryTemplate,
  dualRelease: DualReleasePolicy,
): SodDetectionOptions {
  return {
    ...controlOptions(tpl),
    dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(dualRelease, tpl),
  };
}

/**
 * Conflicts on assignments the caller already holds (a power map, a what-if),
 * with no template needed.
 */
export function detectAssignments(
  options: SodDetectionOptions & { assignments: RoleAssignment[] },
  staff?: StaffComposition,
): SodDetectionReport {
  return detectSodConflicts(undefined, staff, options);
}

/**
 * Conflicts on a team: the template's people with their duties, or the
 * assignments the caller passes (see `detectAssignments`). The template is
 * read for its people only when the options carry no assignments.
 */
export function detectSodConflicts(
  tpl: (Pick<IndustryTemplate, "people" | "roleTemplates"> & { id?: IndustryId }) | undefined,
  staff?: StaffComposition,
  options?: SodDetectionOptions,
): SodDetectionReport {
  const assignments = options?.assignments ?? (tpl ? buildAssignments(tpl) : undefined);
  if (!assignments) throw new Error("detectSodConflicts needs a template or assignments");
  const industry = options?.industry ?? tpl?.id;
  // Only a business with one owner has a seat that cannot steal from itself;
  // partners and co-owners can each take from the others.
  const ownerId =
    options?.soleOwnerId !== undefined ? options.soleOwnerId : teamOwnerId(assignments, industry);
  const context: ScanContext = {
    ownerId,
    hasOwner: industryHasOwner(industry),
    staff,
    residualAccepted: options?.residualAcceptedControlIds ?? new Set<string>(),
    compensatingByControl: options?.compensatingByControlId ?? {},
    dualMitigatedRules: options?.dualReleaseMitigatedRuleIds ?? new Set<string>(),
    // Who approves bills for payment. Another person's approval of each bill
    // is a control in place on that person's bill entry plus payment release.
    billApprovers: assignments.filter((a) => a.entitlements.includes("approve_invoices")),
  };

  const scored = assignments.flatMap((person) => [
    ...namedFindings(person, context),
    // The catch-all is for pairs no rule names. For the sole owner, whose
    // named pairs are already listed as owner-held, a vaguer "one pair of
    // hands" finding about their own business says nothing an owner can act on.
    ...(person.personId === ownerId ? [] : familyFindings(person, staff)),
  ]);

  // Every employee's finding before any owner-held pair, whatever the
  // severity: an owner cannot steal from themselves, so a critical label on
  // their own pair must not push an employee's open high pair down the list.
  // Then severity, so a named high pair never sits below a family catch-all.
  scored.sort(
    (a, b) =>
      Number(a.finding.ownerHeld) - Number(b.finding.ownerHeld) ||
      SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] ||
      b.finding.score - a.finding.score ||
      b.raw - a.raw ||
      a.finding.id.localeCompare(b.finding.id),
  );
  const conflicts = scored.map((s) => s.finding);

  return {
    assignments,
    conflicts,
    matrix: sodMatrix(),
    entitlementOrder: ENTITLEMENT_ORDER,
    summary: summarize(assignments, conflicts),
    recommendations: sodRecommendations(assignments, conflicts, {
      hasOwner: context.hasOwner,
      soleOwnerId: ownerId,
    }),
  };
}

/** What every finding for one team reads besides the person's own duties. */
interface ScanContext {
  ownerId: string | null;
  hasOwner: boolean;
  staff?: StaffComposition;
  residualAccepted: Set<string>;
  compensatingByControl: Record<string, string[]>;
  dualMitigatedRules: Set<string>;
  billApprovers: RoleAssignment[];
}

/** A finding with the unclamped score it sorts by. */
interface ScoredFinding {
  finding: DetectedConflict;
  raw: number;
}

/** One person's findings under named rules: one per rule, a direct pair winning over one read through a channel. */
function namedFindings(person: RoleAssignment, context: ScanContext): ScoredFinding[] {
  const owner = person.personId === context.ownerId;
  const ruleMatches = new Map<string, RuleMatch>();
  const ents = person.entitlements;
  for (let i = 0; i < ents.length; i++) {
    for (let j = i + 1; j < ents.length; j++) {
      const match = findRule(ents[i], ents[j]);
      if (!match) continue;
      if (owner && OVERSIGHT_DUTIES.has(ents[i]) && OVERSIGHT_DUTIES.has(ents[j])) continue;
      const seen = ruleMatches.get(match.rule.id);
      if (!seen || (!seen.direct && match.direct)) ruleMatches.set(match.rule.id, match);
    }
  }
  for (const [ruleId, over] of Object.entries(SUBSUMED_BY)) {
    if (ruleMatches.has(ruleId) && ruleMatches.has(over)) ruleMatches.delete(ruleId);
  }
  return [...ruleMatches.values()].map((match) => namedFinding(person, match, owner, context));
}

function namedFinding(
  person: RoleAssignment,
  match: RuleMatch,
  owner: boolean,
  context: ScanContext,
): ScoredFinding {
  const rule = match.rule;
  // Labels and processes name the duties the person holds; the rating is the rule's.
  const [heldA, heldB] = canonicalPair(match.a, match.b);
  const dualMitigated = context.dualMitigatedRules.has(rule.id);
  // A rule's suggested controls are advice, not controls the business has;
  // only what is recorded as in place lowers the score.
  const otherApprovers =
    rule.id === BILL_APPROVAL_RULE
      ? context.billApprovers.filter((a) => a.personId !== person.personId)
      : [];
  const inPlace = [
    ...(rule.linkedControlId ? (context.compensatingByControl[rule.linkedControlId] ?? []) : []),
    ...(dualMitigated ? ["Dual-release policy active on related channel"] : []),
    ...(otherApprovers.length > 0
      ? [
          `${listNames(otherApprovers.map((a) => a.personName))} approves each bill before anyone pays it`,
        ]
      : []),
  ];
  const suggested = owner
    ? [OWNER_HELD_SUGGESTION]
    : [...rule.compensatingDefaults, ...(SUBSUMED_DEFAULTS[rule.id] ?? [])];
  const accepted = rule.linkedControlId
    ? context.residualAccepted.has(rule.linkedControlId)
    : false;
  const raw =
    rawConflictScore({
      severity: rule.severity,
      pair: canonicalPair(rule.a, rule.b),
      accepted,
      controlsInPlace: inPlace.length,
      dualMitigated,
      staff: context.staff,
    }) - (owner ? OWNER_HELD_DISCOUNT : 0);
  const words = (text: string) => inOverseerWords(text, context.hasOwner);
  return {
    raw,
    finding: {
      id: `${person.personId}:${rule.id}`,
      ruleId: rule.id,
      personId: person.personId,
      personName: person.personName,
      role: person.role,
      entitlementA: heldA,
      entitlementB: heldB,
      labelA: entitlementLabel(heldA),
      labelB: entitlementLabel(heldB),
      severity: rule.severity,
      title: rule.title,
      why: owner ? `${OWNER_HELD_WHY} ${rule.why}` : words(rule.why),
      fraudPath: owner ? OWNER_HELD_PATH : words(rule.fraudPath),
      score: clampScore(raw),
      compensatingControls: Array.from(new Set([...suggested.map(words), ...inPlace])),
      controlsInPlace: Array.from(new Set(inPlace)),
      ownerHeld: owner,
      residualRiskAccepted: accepted,
      dualReleaseMitigated: dualMitigated,
      linkedScenarioId: rule.linkedScenarioId,
      linkedControlId: rule.linkedControlId,
      processIds: processesOf(heldA, heldB),
    },
  };
}

/**
 * One person's family findings: pairs no named rule describes whose duty
 * families conflict. Once a named rule has already flagged one of the two
 * duties for this person, a second, vaguer finding on the same duty adds
 * noise, not risk.
 */
function familyFindings(person: RoleAssignment, staff?: StaffComposition): ScoredFinding[] {
  const ents = person.entitlements;
  const namedDuties = new Set<EntitlementId>();
  for (let i = 0; i < ents.length; i++) {
    for (let j = i + 1; j < ents.length; j++) {
      if (findRule(ents[i], ents[j])) namedDuties.add(ents[i]).add(ents[j]);
    }
  }
  const findings: ScoredFinding[] = [];
  for (let i = 0; i < ents.length; i++) {
    for (let j = i + 1; j < ents.length; j++) {
      const [a, b] = canonicalPair(ents[i], ents[j]);
      if (namedDuties.has(a) || namedDuties.has(b) || !familyPair(a, b)) continue;
      findings.push(familyFinding(person, a, b, staff));
    }
  }
  return findings;
}

function familyFinding(
  person: RoleAssignment,
  a: EntitlementId,
  b: EntitlementId,
  staff?: StaffComposition,
): ScoredFinding {
  const familyA = entitlementFamily(a);
  const familyB = entitlementFamily(b);
  const same = familyA === familyB;
  const raw = rawConflictScore({
    severity: "family",
    pair: [a, b],
    accepted: false,
    controlsInPlace: 0,
    dualMitigated: false,
    staff,
  });
  return {
    raw,
    finding: {
      id: `${person.personId}:family:${a}:${b}`,
      ruleId: familyRuleId(familyA, familyB),
      personId: person.personId,
      personName: person.personName,
      role: person.role,
      entitlementA: a,
      entitlementB: b,
      labelA: entitlementLabel(a),
      labelB: entitlementLabel(b),
      severity: "family",
      title: same
        ? `One person holds two ${SAME_FAMILY_NOUN[familyA]} duties`
        : `${FAMILY_LABEL[familyA]} and ${FAMILY_LABEL[familyB]} in one pair of hands`,
      why: same
        ? `One person holds both of these ${SAME_FAMILY_NOUN[familyA]} duties. Either one alone is ordinary; together they let the same hands complete a transaction end to end with nobody in between.`
        : (FAMILY_WHY[[familyA, familyB].sort().join("-")] ??
          `One person both ${FAMILY_VERB[familyA]} and ${FAMILY_VERB[familyB]}, so no step in that sequence gets a second look.`),
      fraudPath: same
        ? "Complete both steps alone, with no hand-off anyone would notice"
        : "Act, then write or check the record of the act, unobserved",
      score: clampScore(raw),
      compensatingControls: [
        `Move either "${entitlementLabel(a)}" or "${entitlementLabel(b)}" to someone else`,
        "Have a second person review this sequence on a set cadence",
      ],
      controlsInPlace: [],
      ownerHeld: false,
      residualRiskAccepted: false,
      dualReleaseMitigated: false,
      processIds: processesOf(a, b),
    },
  };
}

function summarize(
  assignments: readonly RoleAssignment[],
  conflicts: readonly DetectedConflict[],
): SodDetectionReport["summary"] {
  const open = conflicts.filter((c) => !c.dualReleaseMitigated && !c.ownerHeld);
  const bySeverity = (severity: FindingSeverity) =>
    open.filter((c) => c.severity === severity).length;
  const held = teamHeldDuties(assignments);
  // A business that takes no cash or checks has no deposit to prepare; the
  // seat is empty only when someone takes payments.
  const collects = assignments.some((a) => a.entitlements.includes("collect_cash"));
  return {
    critical: bySeverity("critical"),
    high: bySeverity("high"),
    medium: bySeverity("medium"),
    family: bySeverity("family"),
    // The owner's own pairs are not theft findings, so they count no one here.
    peopleWithConflicts: new Set(open.map((c) => c.personId)).size,
    openWithoutAcceptance: open.filter((c) => !c.residualRiskAccepted).length,
    dualReleaseMitigated: conflicts.filter((c) => c.dualReleaseMitigated).length,
    ownerHeld: conflicts.filter((c) => c.ownerHeld).length,
    unheldDuties: UNHELD_WATCH.filter((d) => !held.has(d) && (d !== "prepare_deposit" || collects)),
    segregationHealth: segregationHealthIndex(segregationPressure(conflicts)),
  };
}

function processesOf(a: EntitlementId, b: EntitlementId): string[] {
  return Array.from(new Set([...entitlementProcesses(a), ...entitlementProcesses(b)]));
}

/** "Ana", "Ana or Ben", "Ana, Ben or Cy": the people any one of whom can approve. */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** The rule another person's bill approval narrows: entering a bill and paying it. */
const BILL_APPROVAL_RULE = "rule-invoice-pay";

const OWNER_HELD_WHY =
  "Both duties sit with the owner, who cannot steal from themselves; the exposure is error, tax and lender reliance rather than theft, and it closes when someone outside the pair reads the records.";
const OWNER_HELD_PATH = "An error or a tax problem that nobody but the owner would see";
/** The one control that closes an owner-held pair; OWNER_HELD_WHY says why the owner's own review does not. */
const OWNER_HELD_SUGGESTION =
  "An outside bookkeeper or accountant reads the bank statement and the payroll register each month";

/**
 * The duties every business with money has to give someone; an empty seat is
 * its own finding. Setting up suppliers is on the list because a team that
 * pays suppliers with nobody recorded as setting them up hides the supplier +
 * payment pair. Entering bills is not: none of the samples records it, and
 * many small businesses pay from the statement without entering bills.
 */
const UNHELD_WATCH: readonly EntitlementId[] = [
  "prepare_deposit",
  "bank_reconcile",
  "release_payment",
  "create_vendor",
  "approve_payroll",
];

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  family: 3,
};

/**
 * Plain wording for the duty families: a mechanism the owner can act on, and
 * a remedy that names the actual duties, rather than a framework's name for
 * the pair.
 */
const FAMILY_LABEL: Record<DutyFamily, string> = {
  authorization: "Approving",
  custody: "Handling the money",
  recording: "Writing the records",
  reconciliation: "Checking the records",
  master_data: "Changing master records",
};

const FAMILY_VERB: Record<DutyFamily, string> = {
  authorization: "approves it",
  custody: "handles the money",
  recording: "writes the record",
  reconciliation: "checks the record",
  master_data: "changes a master record (a payee, a customer, a price, a sign-in)",
};

/**
 * Wording for a pair drawn from the same family — two custody duties, say.
 * The family labels cannot carry those on their own: rendering them gives
 * "Handling the money and Handling the money", so the entitlement labels do
 * the distinguishing work instead.
 */
const SAME_FAMILY_NOUN: Record<DutyFamily, string> = {
  authorization: "approval",
  custody: "money-handling",
  recording: "record-keeping",
  reconciliation: "checking",
  master_data: "master-record",
};

/** Mechanism for the pairings worth spelling out. Keys are sorted pairs. */
const FAMILY_WHY: Record<string, string> = {
  "authorization-custody":
    "The same person approves a payment and then hands over the money, so the approval is the only check and it is their own.",
  "custody-recording":
    "The same person handles the money and writes down what they handled, so the books will always match what they actually took.",
  "custody-reconciliation":
    "The same person holds the money and confirms it arrived, which leaves nobody able to notice a shortfall.",
  "recording-reconciliation":
    "The same person writes the records and checks them, so an error or an omission has no independent reader.",
  "authorization-master_data":
    "The same person can change a master record (a payee, a customer, a price or a sign-in) and approve what depends on it, so the same hands approve a change made for their own benefit.",
  "custody-master_data":
    "The same person can change a master record (a payee, a customer, a price or a sign-in) and handle the money that record governs, so they can bend the record to fit what they took.",
  "master_data-recording":
    "The same person can change a master record (a payee, a customer, a price or a sign-in) and write the entries that depend on it, so a changed record and its entries agree by construction.",
  "authorization-recording":
    "The same person approves a transaction and writes its record, so they can write the approval after the fact to fit.",
};
