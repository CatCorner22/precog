import { getIndustryTemplate, type IndustryTemplate } from "../templates";
import { industryMeta, type IndustryId } from "../industry";
import type { ScenarioTemplate } from "../types";

/**
 * What the scores may count for this business.
 *
 * The industry template carries a sample business: its people, its register
 * of who can do what, its process map and its scenarios. Once an owner enters
 * their own people, those sample pieces become a starting point, not facts
 * about the business, and no index may count them until the owner has made
 * them their own. These helpers answer that question in one place so every
 * screen and every engine agrees.
 */

/** True when the template carries the owner's own people rather than the sample team. */
export function isOwnBusiness(tpl: Pick<IndustryTemplate, "id" | "people">): boolean {
  return tpl.people !== getIndustryTemplate(tpl.id).people;
}

/** The sentence every screen shows where register-derived rows would have been. */
export const REGISTER_NOT_ASSESSED =
  "Register not assessed yet: mark who can do each item on Who knows what.";

/**
 * Whether the process map describes the owner's own processes, judged from the
 * template alone (use mapAssessed in builder/map-state where a profile is at
 * hand). For the owner's own people, a map in which no process has an owner is
 * the starter map nobody has worked on, and an empty map has nothing to score.
 */
export function templateMapAssessed(
  tpl: Pick<IndustryTemplate, "id" | "people" | "processes">,
): boolean {
  if (!isOwnBusiness(tpl)) return true;
  if (tpl.processes.length === 0) return false;
  return tpl.processes.some((p) => (p.ownerPersonIds ?? []).length > 0);
}

/** A decision the owner logged on a scenario, as the journal stores it. */
export interface ScenarioDecision {
  linkedTab?: string;
  linkedId?: string;
  linkedIndustry?: IndustryId;
}

/**
 * Scenarios the owner has made their own by logging a decision on them
 * ("This could happen here" on What could happen, or any journal entry linked
 * to the scenario). Template ids repeat across industries, so an entry only
 * counts under the industry it was logged for.
 */
export function confirmedScenarioIds(
  decisions: readonly ScenarioDecision[] | null | undefined,
  industry: IndustryId,
): Set<string> {
  const ids = new Set<string>();
  for (const d of decisions ?? []) {
    if (d.linkedTab !== "precog" || !d.linkedId) continue;
    if (d.linkedIndustry && d.linkedIndustry !== industry) continue;
    ids.add(d.linkedId);
  }
  return ids;
}

/**
 * The scenarios an index or a "this business" total may count.
 *
 * The sample business counts all of its scenarios. For an owner's own people
 * the template's scenarios are starter scenarios from the industry example:
 * their losses and timelines are the example's assumptions, so they count
 * only once the owner has confirmed one.
 */
export function scenariosInScope(
  tpl: Pick<IndustryTemplate, "id" | "people" | "scenarios">,
  confirmed?: ReadonlySet<string>,
): ScenarioTemplate[] {
  if (!isOwnBusiness(tpl)) return tpl.scenarios;
  return tpl.scenarios.filter((s) => confirmed?.has(s.id));
}

/** Starter scenarios left out of the indices, for the note that says so. */
export function starterScenariosLeftOut(
  tpl: Pick<IndustryTemplate, "id" | "people" | "scenarios">,
  confirmed?: ReadonlySet<string>,
): ScenarioTemplate[] {
  if (!isOwnBusiness(tpl)) return [];
  return tpl.scenarios.filter((s) => !confirmed?.has(s.id));
}

/** "Starter scenarios from the dental / medical office example" */
export function starterScenarioLabel(industry: IndustryId): string {
  return `Starter scenarios from the ${industryMeta(industry).label.toLowerCase()} example`;
}

/** The plain sentence that says how a starter scenario becomes the owner's own. */
export const MAKE_SCENARIO_YOURS =
  'To make one your own, open it on What could happen and choose "This could happen here"; it then counts in the threat index and your totals.';

/**
 * The note shown where starter scenarios would have counted, or null when none
 * is left out.
 */
export function starterScenarioNote(
  tpl: Pick<IndustryTemplate, "id" | "people" | "scenarios">,
  confirmed?: ReadonlySet<string>,
): string | null {
  const left = starterScenariosLeftOut(tpl, confirmed);
  if (left.length === 0) return null;
  return `${starterScenarioLabel(tpl.id)} (${left.length}) are left out: their losses and timelines are the example's assumptions, not facts about your business. ${MAKE_SCENARIO_YOURS}`;
}

const NARRATIVE_CACHE = new WeakMap<IndustryTemplate, IndustryTemplate>();

/**
 * The template with its scenario narrative in words that fit the owner's
 * business: the sample team's first names ("Jordan resigns") become the role
 * the scenario implies ("The front desk lead resigns"). Ids, figures and every
 * other field are unchanged, so the engines score the result exactly as the
 * original. The sample business keeps its narrative as written.
 */
export function withOwnScenarioWording(tpl: IndustryTemplate): IndustryTemplate {
  if (!isOwnBusiness(tpl)) return tpl;
  const cached = NARRATIVE_CACHE.get(tpl);
  if (cached) return cached;
  const base = getIndustryTemplate(tpl.id);
  const scenarios = tpl.scenarios.map((s) => ownScenarioWording(s, base));
  const out = { ...tpl, scenarios };
  NARRATIVE_CACHE.set(tpl, out);
  return out;
}

/** One scenario's narrative with the sample team's names replaced by role words. */
export function ownScenarioWording(
  s: ScenarioTemplate,
  sample: Pick<IndustryTemplate, "people" | "relations">,
): ScenarioTemplate {
  const replacements = sampleNameRoles(s, sample);
  if (replacements.length === 0) return s;
  const rewrite = (text: string) => replaceNames(text, replacements);
  return {
    ...s,
    title: rewrite(s.title),
    description: rewrite(s.description),
    mitigations: s.mitigations.map((m) => ({ ...m, label: rewrite(m.label) })),
  };
}

function sampleNameRoles(
  s: ScenarioTemplate,
  sample: Pick<IndustryTemplate, "people" | "relations">,
): { name: string; role: string }[] {
  const text = [s.title, s.description, ...s.mitigations.map((m) => m.label)].join(" ");
  // The role the scenario's own title names ("Front desk lead leaves ...") is
  // the word the text implies; otherwise the sample person's role.
  const titleRole = /^(.+?) leaves\b/i.exec(s.title)?.[1]?.trim();
  const out: { name: string; role: string }[] = [];
  for (const person of sample.people) {
    const first = person.name
      .replace(/^(dr|mr|mrs|ms)\.?\s+/i, "")
      .split(/\s+/)[0]
      ?.replace(/[^A-Za-z'-]/g, "");
    if (!first || first.length < 2) continue;
    if (!new RegExp(`\\b${first}\\b`).test(text)) continue;
    // The title names the role of the person the scenario is about; a name
    // that belongs to someone else in the sample falls back to their role.
    const aboutThem =
      !s.knowledgeId ||
      sample.relations.some((r) => r.personId === person.id && r.knowledgeId === s.knowledgeId);
    const role = aboutThem && titleRole ? titleRole : person.role.split(" / ")[0];
    out.push({ name: first, role: roleWords(role) });
  }
  return out;
}

/** "Front desk lead" → "front desk lead"; acronyms such as "AR" keep their capitals. */
function roleWords(role: string): string {
  return role
    .split(/\s+/)
    .map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase()))
    .join(" ");
}

function replaceNames(text: string, replacements: { name: string; role: string }[]): string {
  let out = text;
  for (const { name, role } of replacements) {
    out = out
      .replace(new RegExp(`\\b${name}'s\\b`, "g"), `the ${role}'s`)
      .replace(new RegExp(`\\b${name}\\b`, "g"), `the ${role}`);
  }
  // A replacement at the start of a sentence starts with a capital.
  return out.replace(/(^|[.!?]\s+)the /g, (_m, lead: string) => `${lead}The `);
}
