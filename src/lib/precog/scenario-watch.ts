import type { IndustryTemplate } from "./templates/types";
import type { ScenarioTemplate } from "./types";
import type { DetectedConflict } from "./sod/detect";
import { relationLevel, STRONG_LEVELS } from "./continuity/coverage";
import { registerAssessed } from "./continuity/register-state";
import { CONFLICT_RULES, entitlementLabel, type EntitlementId } from "./sod/conflict-rules";
import { buildAssignments, type RoleAssignment } from "./sod/assignments";
import { teamHeldDuties } from "./sod/rule-match";
import { joinWithAnd, midSentence, verb } from "./text";

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
   * Duties the scenario's rules need that nobody active holds, in plain words.
   * With one of them unticked Precog cannot tell whether anyone holds a pair,
   * so the card says so instead of "Nobody on the team holds both duties".
   * A duty the setup answers place outside the team (dutiesOffTeam) is not
   * listed here, the same rule the Duty conflicts screen and the report use.
   */
  unassignedDuties: string[];
  /** Duties the scenario's rules need that nobody holds because the setup answers place them outside the team. */
  offTeamDuties: string[];
  /** The control the scenario relies on, when the template has it. */
  control: { id: string; name: string; inPlace: boolean } | null;
  /** The register entry the scenario turns on, when the template has it. */
  knowledge: { name: string; holders: string[]; outToday: string[]; recorded: boolean } | null;
}

export function scenarioWatch(
  tpl: Pick<IndustryTemplate, "id" | "controls" | "knowledge" | "relations" | "people"> &
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
  const recorded =
    item !== undefined &&
    (tpl.relations.some(
      (relation) =>
        relation.knowledgeId === item.id &&
        tpl.people.some((person) => person.id === relation.personId && person.active),
    ) ||
      (tpl.relations.length === 0 && registerAssessed(tpl)));

  return {
    conflicts,
    unassignedDuties: [...unassigned].map(dutyWords),
    offTeamDuties: [...offTeamUnheld].map(dutyWords),
    control: control ? { id: control.id, name: control.name, inPlace: control.segregated } : null,
    knowledge: item
      ? {
          name: item.name,
          holders: holders.map((person) => person.name),
          outToday: holders
            .filter((person) => outTodayIds.has(person.id))
            .map((person) => person.name),
          recorded,
        }
      : null,
  };
}

export function knowledgeFact(knowledge: NonNullable<ScenarioWatch["knowledge"]>): string {
  if (!knowledge.recorded) {
    return `${knowledge.name}: who can run it alone isn't recorded yet; mark it on Who knows what.`;
  }
  if (knowledge.holders.length === 0) {
    return `${knowledge.name}: nobody can run it alone.`;
  }
  return `${knowledge.name}: ${joinWithAnd(knowledge.holders)} can run it alone.`;
}

export function dutyFacts(watch: ScenarioWatch): string[] {
  if (watch.conflicts.length > 0) {
    return [
      ...watch.conflicts.slice(0, 3).map((conflict) => {
        return `${conflict.personName} holds both duties: ${conflict.title}`;
      }),
      ...(watch.conflicts.length > 3 ? [`and ${watch.conflicts.length - 3} more`] : []),
    ];
  }
  if (watch.unassignedDuties.length > 0) {
    return [
      `Nobody on the team is ticked for ${joinWithAnd(watch.unassignedDuties)}, so Precog cannot tell whether one person holds both duties this needs. Tick whoever does ${verb(watch.unassignedDuties.length, "it", "them")} on the Team tab.`,
      ...(watch.offTeamDuties.length > 0
        ? [`Your setup answers place ${joinWithAnd(watch.offTeamDuties)} outside the team.`]
        : []),
    ];
  }
  if (watch.offTeamDuties.length > 0) {
    return [
      `Your setup answers place ${joinWithAnd(watch.offTeamDuties)} outside the team, so nobody on the team holds both duties this needs.`,
    ];
  }
  return ["Nobody on the team holds both duties this needs."];
}

/** A duty's label in running text: "enter payroll". */
function dutyWords(duty: EntitlementId): string {
  return midSentence(entitlementLabel(duty));
}
