import type { IndustryTemplate } from "./templates/types";
import type { ScenarioTemplate } from "./types";
import type { DetectedConflict } from "./sod/detect";
import { relationLevel, STRONG_LEVELS } from "./continuity/coverage";
import { CONFLICT_RULES, entitlementLabel, type EntitlementId } from "./sod/conflict-rules";
import { buildAssignments, type RoleAssignment } from "./sod/assignments";
import { teamHeldDuties } from "./sod/rule-match";
import { midSentence } from "./text";
import { controlConfirmedByOwner } from "./active-template";

/** The duty-conflict rules a scenario plays out: those it names and those linked to it. */
export function scenarioRuleIds(scenario: Pick<ScenarioTemplate, "id" | "sodRuleIds">): string[] {
  const ids = new Set(scenario.sodRuleIds ?? []);
  for (const rule of CONFLICT_RULES) if (rule.linkedScenarioId === scenario.id) ids.add(rule.id);
  return [...ids];
}

export interface ScenarioWatch {
  /** Open findings on the scenario's duty-conflict rules, one per person and rule. */
  conflicts: { personName: string; title: string }[];
  /**
   * Pairs on the scenario's rules that someone holds but the open count
   * leaves out, as the Duty conflicts tab's "Not counted as open" group does:
   * the owner's own pairs, and pairs dual release covers at every amount.
   * With one of them the card names it instead of "Nobody on the team holds
   * both duties".
   */
  notOpen: { personName: string; title: string; reason: "owner" | "dual" }[];
  /**
   * Duties the scenario's rules need that nobody active holds, in plain words.
   * With one of them unticked Precog cannot tell whether anyone holds a pair,
   * so the card says so instead of "Nobody on the team holds both duties".
   * A duty the setup answers place outside the team (dutiesOffTeam) is not
   * listed here, the same rule the Duty conflicts screen and the report use.
   */
  unassignedDuties: string[];
  /** Duties the scenario's rules need that nobody holds because the setup answers place them outside the team. */
  offTeamDuties: string[];
  /**
   * The control the scenario relies on, when the template has it. On an
   * owner's own business it is in place only when the owner confirmed it
   * (`controlConfirmedByOwner`); `example` marks one the owner never
   * confirmed, which the card names as Precog's example, not as in place.
   */
  control: { id: string; name: string; inPlace: boolean; example?: true } | null;
  /** The register entry the scenario turns on, when the template has it. */
  knowledge: { name: string; holders: string[]; outToday: string[] } | null;
}

export function scenarioWatch(
  tpl: Pick<IndustryTemplate, "controls" | "knowledge" | "relations" | "people"> &
    Partial<Pick<IndustryTemplate, "roleTemplates">>,
  scenario: Pick<ScenarioTemplate, "id" | "sodRuleIds" | "controlId" | "knowledgeId">,
  openConflicts: readonly Pick<DetectedConflict, "ruleId" | "personName" | "title">[],
  outTodayIds: ReadonlySet<string>,
  /** Duties the setup answers place outside the team: `dutiesOffTeam(profile.setupAnswers)`. */
  offTeam: ReadonlySet<EntitlementId> = new Set(),
  /**
   * The team's duty assignments, when the caller's conflict check already
   * built them from `tpl` (the detection report's `assignments`).
   */
  assignments: readonly Pick<RoleAssignment, "entitlements">[] = buildAssignments({
    people: tpl.people,
    roleTemplates: tpl.roleTemplates ?? {},
  }),
  /**
   * Every finding the conflict check made (the detection report's
   * `conflicts`), of which `openConflicts` are the open ones: the rest on
   * the scenario's rules are held but not counted as open.
   */
  allConflicts: readonly Pick<
    DetectedConflict,
    "ruleId" | "personName" | "title" | "ownerHeld"
  >[] = openConflicts.map((c) => ({ ...c, ownerHeld: false })),
  /**
   * On an owner's own business, the controls the owner confirmed
   * (`confirmedControlIds`): only those, and those with something the owner
   * recorded in place, read as in place. Null for the sample business, whose
   * controls are the sample's own facts.
   */
  ownerConfirmedControls: ReadonlySet<string> | null = null,
): ScenarioWatch {
  const ruleIds = new Set(scenarioRuleIds(scenario));
  const seen = new Set<string>();
  const conflicts: ScenarioWatch["conflicts"] = [];
  for (const conflict of openConflicts) {
    if (!ruleIds.has(conflict.ruleId)) continue;
    const key = `${conflict.personName}\u0000${conflict.ruleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    conflicts.push({ personName: conflict.personName, title: conflict.title });
  }
  const notOpen: ScenarioWatch["notOpen"] = [];
  for (const conflict of allConflicts) {
    if (!ruleIds.has(conflict.ruleId)) continue;
    const key = `${conflict.personName}\u0000${conflict.ruleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notOpen.push({
      personName: conflict.personName,
      title: conflict.title,
      reason: conflict.ownerHeld ? "owner" : "dual",
    });
  }

  const held = teamHeldDuties(assignments);
  const unassigned = new Set<EntitlementId>();
  const offTeamUnheld = new Set<EntitlementId>();
  for (const rule of CONFLICT_RULES) {
    if (!ruleIds.has(rule.id)) continue;
    for (const duty of [rule.a, rule.b]) {
      if (held.has(duty)) continue;
      (offTeam.has(duty) ? offTeamUnheld : unassigned).add(duty);
    }
  }

  const control = scenario.controlId
    ? tpl.controls.find((candidate) => candidate.id === scenario.controlId)
    : undefined;
  const item = scenario.knowledgeId
    ? tpl.knowledge.find((candidate) => candidate.id === scenario.knowledgeId)
    : undefined;
  const holders =
    item === undefined
      ? []
      : tpl.people.filter(
          (person) =>
            person.active &&
            STRONG_LEVELS.has(relationLevel(tpl.relations, person.id, item.id) ?? "aware"),
        );

  return {
    conflicts,
    notOpen,
    unassignedDuties: [...unassigned].map(dutyWords),
    offTeamDuties: [...offTeamUnheld].map(dutyWords),
    control: control ? watchedControl(control, ownerConfirmedControls) : null,
    knowledge: item
      ? {
          name: item.name,
          holders: holders.map((person) => person.name),
          outToday: holders
            .filter((person) => outTodayIds.has(person.id))
            .map((person) => person.name),
        }
      : null,
  };
}

/** The scenario's control as the card reads it: in place, not in place, or Precog's example. */
function watchedControl(
  control: IndustryTemplate["controls"][number],
  ownerConfirmed: ReadonlySet<string> | null,
): NonNullable<ScenarioWatch["control"]> {
  const { id, name } = control;
  if (!ownerConfirmed) return { id, name, inPlace: control.segregated };
  if (controlConfirmedByOwner(control, ownerConfirmed)) return { id, name, inPlace: true };
  return { id, name, inPlace: false, example: true };
}

/**
 * Whether the owner's own team closes the scenario's duty-conflict path: it
 * plays out a rule, nobody holds a pair it needs (open or not counted as
 * open), and every duty it needs is ticked for someone or placed outside the
 * team by the setup answers.
 */
export function teamClosesPath(
  scenario: Pick<ScenarioTemplate, "id" | "sodRuleIds">,
  watch: Pick<ScenarioWatch, "conflicts" | "notOpen" | "unassignedDuties">,
): boolean {
  return (
    scenarioRuleIds(scenario).length > 0 &&
    watch.conflicts.length === 0 &&
    watch.notOpen.length === 0 &&
    watch.unassignedDuties.length === 0
  );
}

/** A duty's label in running text: "enter payroll". */
function dutyWords(duty: EntitlementId): string {
  return midSentence(entitlementLabel(duty));
}
