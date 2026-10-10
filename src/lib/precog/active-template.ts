import { industryHasOwner, type IndustryId } from "./industry";
import { normalizeKnowledgeRelations } from "./knowledge-relations";
import { getIndustryTemplate, type IndustryTemplate } from "./templates";
import type { ControlItem, KnowledgeItem, KnowledgeRelation, Person, ProcessNode } from "./types";
import { CONFLICT_RULES } from "./sod/conflict-rules";
import { detectSodConflicts, type DetectedConflict } from "./sod/detect";
import { midSentence } from "./text";
import { linkProcedures } from "./procedures/coverage-link";
import type { Procedure } from "./procedures/types";

/** A journal entry's link to what it is about (see DecisionEntry in practice-profile). */
interface DecisionLink {
  linkedTab?: string;
  linkedId?: string;
  linkedIndustry?: IndustryId;
  /** The entry's note: for a control in place, what the owner does. */
  note?: string;
}

/** The slice of a practice profile that determines which template the engines see. */
export interface TemplateSource {
  industry: IndustryId;
  customProcesses?: ProcessNode[] | null;
  customPeople?: Person[] | null;
  customKnowledge?: KnowledgeItem[] | null;
  customRelations?: KnowledgeRelation[] | null;
  /** The journal: an entry linked to a starter control confirms that it runs here. */
  decisions?: readonly DecisionLink[] | null;
  /** Starter controls the owner has confirmed; read from `decisions` when absent. */
  confirmedControlIds?: readonly string[] | null;
  /**
   * Controls the owner already has, by control id; read from `decisions` and
   * `setupAnswers` when absent.
   */
  controlsInPlace?: Readonly<Record<string, readonly string[]>> | null;
  /** The setup answers: a few of them record a control the owner already has. */
  setupAnswers?: SetupInPlaceAnswers | null;
  /**
   * The setup credits the owner has taken off, by id (`setupControlsInPlace`):
   * the answer stands, but the control no longer counts it as in place.
   */
  setupControlsWithdrawn?: readonly string[] | null;
  /** Written procedures: a register item with one counts as written down. */
  procedures?: readonly Procedure[] | null;
}

/** The linkedTab of a journal entry that confirms a starter control runs in this business. */
export const CONTROL_CONFIRM_TAB = "control";

/**
 * Starter controls the owner has confirmed by logging a journal entry on them
 * ("This runs here" under Controls on Who controls what). Template ids repeat across
 * industries, so an entry counts only under the industry it was logged for.
 */
export function confirmedControlIds(
  decisions: readonly DecisionLink[] | null | undefined,
  industry: IndustryId,
): string[] {
  const ids = new Set<string>();
  for (const d of decisions ?? []) {
    if (d.linkedTab !== CONTROL_CONFIRM_TAB || !d.linkedId) continue;
    if (d.linkedIndustry && d.linkedIndustry !== industry) continue;
    ids.add(d.linkedId);
  }
  return [...ids].sort();
}

/**
 * Whether the owner of their own business has said a control runs there:
 * they confirmed it ("This runs here", a journal entry linked to it) or
 * recorded something in place against it (`controlsInPlace`, which
 * `resolveTemplate` puts in its compensating controls). A control's
 * "segregated" flag is not enough: on a starter control it is the sample's,
 * and on a control a conflict rule links to it says only that nobody on the
 * team holds both duties. Neither is the owner saying the control runs.
 */
export function controlConfirmedByOwner(
  control: Pick<ControlItem, "id" | "compensatingControls">,
  confirmed: ReadonlySet<string>,
): boolean {
  return confirmed.has(control.id) || control.compensatingControls.length > 0;
}

/** The linkedTab of a journal entry that records a control the owner already has against a duty gap. */
export const CONTROL_IN_PLACE_TAB = "control-in-place";

/** Longest description of a control in place that the engines carry. */
const MAX_IN_PLACE_TEXT = 200;

/**
 * Controls the owner already has, recorded under Controls on Who controls
 * what ("We already do something here"), by the control they narrow: for
 * example "The CFO reviews each bank reconciliation" against the cash
 * duty-separation control. Each is a
 * journal entry, so it carries a date and a review date, and removing the
 * entry removes the credit. Only entries logged under this industry count.
 * The setup answers credit their controls the same way
 * (`setupControlsInPlace`), until the owner takes a credit off
 * (`withdrawn`, by id): a deletion sticks, as deleting the entry setup
 * used to log did.
 */
export function controlsInPlace(
  decisions: readonly DecisionLink[] | null | undefined,
  industry: IndustryId,
  setupAnswers?: SetupInPlaceAnswers | null,
  withdrawn?: readonly string[] | null,
): Record<string, string[]> {
  const byControl: Record<string, string[]> = {};
  const add = (controlId: string, note: string | undefined) => {
    const text = (note ?? "").trim().slice(0, MAX_IN_PLACE_TEXT);
    if (!text) return;
    const list = (byControl[controlId] ??= []);
    if (!list.includes(text)) list.push(text);
  };
  for (const d of decisions ?? []) {
    if (d.linkedTab !== CONTROL_IN_PLACE_TAB || !d.linkedId) continue;
    if (d.linkedIndustry && d.linkedIndustry !== industry) continue;
    add(d.linkedId, d.note);
  }
  // The setup answers come last, where the entries setup used to log sat
  // (the oldest in the journal), so a control lists its texts in the same order.
  const off = new Set(withdrawn ?? []);
  for (const { id, controlId, text } of setupControlsInPlace(setupAnswers, industry)) {
    if (!off.has(id)) add(controlId, text);
  }
  return byControl;
}

/** The setup answers that record a control the owner already has. */
export interface SetupInPlaceAnswers {
  ownerReadsStatement?: string;
  bankRec?: string;
}

/** A control a setup answer credits as in place, with the text it carries. */
export interface SetupControlInPlace {
  /** The credit's id, the answer and the control ("ownerReadsStatement:c-sod-ap"); what taking it off records. */
  id: string;
  controlId: string;
  text: string;
}

/** The id of the credit a setup answer gives one control (`SetupControlInPlace.id`). */
export function setupControlId(answer: keyof SetupInPlaceAnswers, controlId: string): string {
  return `${answer}:${controlId}`;
}

/** Every credit the setup answers can give, by id: the ids a profile's withdrawals are read against. */
export const SETUP_CONTROL_IDS: readonly string[] = [
  setupControlId("bankRec", "c-sod-cash"),
  setupControlId("ownerReadsStatement", "c-sod-ap"),
  setupControlId("ownerReadsStatement", "c-sod-cash"),
];

/**
 * The controls the owner said at setup that they already have, each with the
 * text it carries on its control, newest first as the journal lists them.
 * They are facts the owner gave, not decisions about a finding, so they
 * credit the control without entering the Decisions log; the owner takes
 * one off under Controls on Who controls what ("Take it off"), which
 * records its id on the profile (`setupControlsWithdrawn`).
 */
export function setupControlsInPlace(
  answers: SetupInPlaceAnswers | null | undefined,
  industry: IndustryId,
): SetupControlInPlace[] {
  if (!answers) return [];
  const out: SetupControlInPlace[] = [];
  const credit = (answer: keyof SetupInPlaceAnswers, controlId: string, text: string) =>
    out.push({ id: setupControlId(answer, controlId), controlId, text });
  if (answers.bankRec === "outside") {
    credit(
      "bankRec",
      "c-sod-cash",
      "An outside bookkeeper or CPA reconciles the bank account each month (answered at setup).",
    );
  }
  if (answers.ownerReadsStatement === "yes") {
    const text = industryHasOwner(industry)
      ? "The owner opens and reads the bank statement each month (answered at setup)."
      : "A board member opens and reads the bank statement each month (answered at setup).";
    credit("ownerReadsStatement", "c-sod-ap", text);
    credit("ownerReadsStatement", "c-sod-cash", text);
  }
  return out;
}

/**
 * Layer a business's own people, process map, and duty/knowledge register
 * over its industry template, with each register item's written procedures.
 *
 * Pure: the same source always yields an equivalent template, so callers on
 * the server can build one per request and callers in React can memoize on
 * the inputs. Knowledge relations and process owners that point at people or
 * items that are no longer present are dropped so no engine ever sees a
 * dangling reference.
 */
export function resolveTemplate(source: TemplateSource): IndustryTemplate {
  const base = getIndustryTemplate(source.industry);
  const peopleOverrides = source.customPeople ?? null;
  const processOverrides = source.customProcesses ?? null;
  const knowledgeOverrides = source.customKnowledge ?? null;
  const relationOverrides = source.customRelations ?? null;
  const people = peopleOverrides ?? base.people;
  const ids = new Set(people.map((p) => p.id));
  const knowledge = linkProcedures(
    knowledgeOverrides ?? base.knowledge,
    source.procedures,
    source.industry,
  );
  const knowledgeIds = new Set(knowledge.map((k) => k.id));
  const rawRelations = relationOverrides ?? base.relations;
  const relations =
    peopleOverrides || knowledgeOverrides || relationOverrides
      ? normalizeKnowledgeRelations(
          rawRelations.filter((r) => ids.has(r.personId) && knowledgeIds.has(r.knowledgeId)),
        )
      : rawRelations;
  const processes = (processOverrides ?? base.processes).map((p) => ({
    ...p,
    ownerPersonIds: (p.ownerPersonIds ?? []).filter((id) => ids.has(id)),
  }));
  const resolved = { ...base, people, knowledge, relations, processes };
  const confirmed = new Set(
    source.confirmedControlIds ?? confirmedControlIds(source.decisions, source.industry),
  );
  const inPlace =
    source.controlsInPlace ??
    controlsInPlace(
      source.decisions,
      source.industry,
      source.setupAnswers,
      source.setupControlsWithdrawn,
    );
  return {
    ...resolved,
    // The sample's own array handed back as customPeople is still the sample
    // team, so it carries no flag; an emptied team ([]) is the owner's.
    ...(peopleOverrides && peopleOverrides !== base.people ? { ownPeople: true as const } : {}),
    controls: peopleOverrides
      ? ownControls(base.controls, resolved, confirmed, inPlace)
      : base.controls,
  };
}

const RULE_LINKED_CONTROLS = new Set(
  CONFLICT_RULES.map((r) => r.linkedControlId).filter((id): id is string => Boolean(id)),
);

/**
 * The duty pairs a starter control separates when no conflict rule links to
 * it, named by the rule for each pair: writing off receivables is approving
 * and entering write-offs, and invoice matching is entering and approving
 * bills. A confirmed control listed here is segregated exactly when no
 * employee holds one of its pairs; a confirmed control not listed has no
 * pair Precog can read from the team, so it earns no separation credit.
 */
const STARTER_CONTROL_PAIRS: Readonly<Record<string, readonly string[]>> = {
  "c-sod-ar": ["rule-writeoff"],
  "c-ap": ["rule-invoice-approve"],
};

/**
 * The sample business's control records describe the sample team: one
 * accepted residual risk, compensating controls its people perform,
 * "segregated" flags written by hand and descriptions of the sample's gaps.
 * None of that is a fact about this owner's business. With the owner's own
 * people:
 * - a control a conflict rule links to is segregated exactly when no employee
 *   holds one of its pairs, and its description names the pairs that are open;
 * - every other control is marked as a starter until the owner confirms it
 *   runs here (a journal entry linked to it); once confirmed it is segregated
 *   only when different people hold its duties (STARTER_CONTROL_PAIRS), never
 *   because the sample's flag says so;
 * - nothing is accepted, and nothing is credited as in place until the owner
 *   records it (see controlsInPlace).
 */
function ownControls(
  controls: readonly ControlItem[],
  tpl: IndustryTemplate,
  confirmed: ReadonlySet<string>,
  inPlace: Readonly<Record<string, readonly string[]>>,
): ControlItem[] {
  const openByControl = new Map<string, DetectedConflict[]>();
  const ownerHolds = new Set<string>();
  const conflicts = detectSodConflicts(tpl).conflicts;
  const heldByEmployee = new Set(conflicts.filter((c) => !c.ownerHeld).map((c) => c.ruleId));
  for (const conflict of conflicts) {
    const controlId = conflict.linkedControlId;
    if (!controlId) continue;
    if (conflict.ownerHeld) {
      ownerHolds.add(controlId);
      continue;
    }
    openByControl.set(controlId, [...(openByControl.get(controlId) ?? []), conflict]);
  }
  return controls.map((c) => {
    const own = {
      ...c,
      residualRiskAccepted: false,
      compensatingControls: [...(inPlace[c.id] ?? [])],
    };
    // A control no conflict rule covers is the example's until the owner says
    // it runs here. Once confirmed, its separation comes from who holds its
    // duties on this team, not from the example's flag.
    if (!RULE_LINKED_CONTROLS.has(c.id)) {
      if (!confirmed.has(c.id)) return { ...own, starter: true };
      const pairs = STARTER_CONTROL_PAIRS[c.id] ?? [];
      return {
        ...own,
        segregated: pairs.length > 0 && pairs.every((ruleId) => !heldByEmployee.has(ruleId)),
      };
    }
    const open = openByControl.get(c.id) ?? [];
    return {
      ...own,
      segregated: open.length === 0,
      description: describeOwnControl(open, ownerHolds.has(c.id)),
    };
  });
}

/** What a rule-linked control covers on this team, named from the pairs actually open. */
function describeOwnControl(open: readonly DetectedConflict[], ownerHolds: boolean): string {
  if (open.length === 0) {
    return ownerHolds
      ? "Only the owner holds a pair of duties this control covers; someone outside the pair reading the records closes it."
      : "Nobody on your team holds a pair of duties this control covers.";
  }
  const shown = open
    .slice(0, 3)
    .map((c) => `${c.personName} (${midSentence(c.title)})`)
    .join("; ");
  const more = open.length - 3;
  return `Open on your team: ${shown}${more > 0 ? `; and ${more} more` : ""}.`;
}
