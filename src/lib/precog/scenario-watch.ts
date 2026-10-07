import type { IndustryTemplate } from "./templates/types";
import type { ScenarioTemplate } from "./types";
import type { DetectedConflict } from "./sod/detect";
import { relationLevel, STRONG_LEVELS } from "./continuity/coverage";
import { CONFLICT_RULES } from "./sod/conflict-rules";

/** The duty-conflict rules a scenario plays out: those it names and those linked to it. */
export function scenarioRuleIds(scenario: Pick<ScenarioTemplate, "id" | "sodRuleIds">): string[] {
  const ids = new Set(scenario.sodRuleIds ?? []);
  for (const rule of CONFLICT_RULES) if (rule.linkedScenarioId === scenario.id) ids.add(rule.id);
  return [...ids];
}

export interface ScenarioWatch {
  /** Open findings on the scenario's duty-conflict rules, one per person and rule. */
  conflicts: { personName: string; title: string }[];
  /** The control the scenario relies on, when the template has it. */
  control: { id: string; name: string; inPlace: boolean } | null;
  /** The register entry the scenario turns on, when the template has it. */
  knowledge: { name: string; holders: string[]; outToday: string[] } | null;
}

export function scenarioWatch(
  tpl: Pick<IndustryTemplate, "controls" | "knowledge" | "relations" | "people">,
  scenario: Pick<ScenarioTemplate, "id" | "sodRuleIds" | "controlId" | "knowledgeId">,
  openConflicts: readonly Pick<DetectedConflict, "ruleId" | "personName" | "title">[],
  outTodayIds: ReadonlySet<string>,
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
    control: control ? { id: control.id, name: control.name, inPlace: control.segregated } : null,
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
