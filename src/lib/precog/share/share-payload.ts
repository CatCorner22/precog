import { resolveTemplate } from "../active-template";
import { industryMeta } from "../industry";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap } from "../process-graph";
import type { PracticeProfile } from "../practice-profile";
import { evidenceStatus } from "../builder/evidence";
import type { SharedMapPayload } from "./share-schema";
import { firstName } from "../text";

/** Build the frozen share payload from the profile and its resolved template. */
export function buildSharePayload(
  profile: PracticeProfile,
  actions: { title: string; why: string; effort: string }[],
  note?: string,
  redactNames = false,
): SharedMapPayload {
  const tpl = resolveTemplate(profile);
  const meta = industryMeta(profile.industry);
  const { snapshots } = buildProcessMapGraph(tpl, profile.staff);
  const issues = validateProcessMap(
    tpl.processes,
    tpl.people,
    new Set(tpl.controls.map((c) => c.id)),
    profile.mapLayout ?? {},
  );
  const health = computeMapHealth(snapshots, issues, {
    customized: Boolean(profile.customProcesses || profile.customPeople),
  });
  const nameOf = (id: string) => tpl.people.find((p) => p.id === id)?.name;

  const payload: SharedMapPayload = {
    version: 1,
    businessName: profile.practiceName,
    industry: profile.industry,
    industryLabel: meta.label,
    teamLabel: meta.teamLabel,
    generatedAt: new Date().toISOString(),
    health: {
      score: health.score,
      bandLabel: health.bandLabel,
      summary: health.summary,
      dimensions: health.dimensions,
      processCount: health.processCount,
      avgHeat: health.avgHeat,
      hotProcesses: health.hotProcesses,
    },
    processes: snapshots
      .slice()
      .sort((a, b) => (a.process.stage ?? 0) - (b.process.stage ?? 0))
      .map((s) => ({
        id: s.process.id,
        name: s.process.name,
        description: s.process.description,
        stage: s.process.stage ?? 0,
        heat: s.heat,
        owners: (s.process.ownerPersonIds ?? []).map(nameOf).filter((x): x is string => Boolean(x)),
        controls: s.process.controlIds
          .map((id) => tpl.controls.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
          .map((c) => ({ name: c.name, segregated: c.segregated })),
        risks: (s.process.risks ?? []).slice(0, 5).map((r) => ({
          title: r.title,
          kind: r.kind,
          severity: r.severity,
          likelihood: r.likelihood,
        })),
        dependencies: s.process.dependencies,
        evidence: (s.process.evidence ?? []).map((e) => ({
          label: e.label,
          frequency: e.frequency,
          status: evidenceStatus(e).status,
        })),
      })),
    people: tpl.people.filter((p) => p.active).map((p) => ({ name: p.name, role: p.role })),
    issues: issues
      .filter((i) => i.severity !== "info")
      .map((i) => i.message)
      .slice(0, 10),
    actions: actions.slice(0, 6),
    note: note?.trim().slice(0, 600) || undefined,
  };

  return redactNames ? redactSharePayload(payload, tpl.people) : payload;
}

/**
 * Replace people's names with role labels ("Office Manager A") everywhere the
 * payload carries text: the people list, process owners and every sentence
 * (open issues, weekly actions, the health summary and hints, the note, and
 * process, risk, control and evidence wording), full names and first names
 * alike. Issues and actions name people ("Cara Voss has left", "Cross-train
 * Ben"), so relabelling the people list alone left the names on the page.
 *
 * `team` is the whole team, people who have left included: a departed owner
 * keeps their role in the label, and a name that appears only inside a
 * sentence is still caught. The server calls this again without a team, so
 * a payload already marked `namesHidden` comes back unchanged.
 */
export function redactSharePayload(
  payload: SharedMapPayload,
  team: readonly { name: string; role: string }[] = [],
): SharedMapPayload {
  if (payload.namesHidden) return payload;
  const labels = roleLabels(payload, team);
  const scrub = nameScrubber(labels);
  return {
    ...payload,
    namesHidden: true,
    health: {
      ...payload.health,
      summary: scrub(payload.health.summary),
      dimensions: payload.health.dimensions.map((d) => ({ ...d, hint: scrub(d.hint) })),
    },
    processes: payload.processes.map((process) => ({
      ...process,
      name: scrub(process.name),
      description: scrub(process.description),
      owners: process.owners.map((owner) => labels.get(owner) ?? scrub(owner)),
      controls: process.controls.map((c) => ({ ...c, name: scrub(c.name) })),
      risks: process.risks.map((r) => ({ ...r, title: scrub(r.title) })),
      evidence: process.evidence.map((e) => ({ ...e, label: scrub(e.label) })),
    })),
    people: payload.people.map((person) => ({
      ...person,
      name: labels.get(person.name) ?? person.name,
    })),
    issues: payload.issues.map(scrub),
    actions: payload.actions.map((a) => ({ ...a, title: scrub(a.title), why: scrub(a.why) })),
    note: payload.note === undefined ? undefined : scrub(payload.note),
  };
}

/**
 * One label per name: the listed people first, in order, then process owners,
 * then anyone else on the team. Each role counts its own letters ("Hygienist
 * A", "Hygienist B"); a name with no known role is a "Team member".
 */
function roleLabels(
  payload: SharedMapPayload,
  team: readonly { name: string; role: string }[],
): Map<string, string> {
  const roleOf = new Map(team.map((person) => [person.name, person.role]));
  for (const person of payload.people) roleOf.set(person.name, person.role);
  const labels = new Map<string, string>();
  const perRole = new Map<string, number>();
  const add = (name: string) => {
    if (!name.trim() || labels.has(name)) return;
    const role = roleOf.get(name)?.trim() || "Team member";
    const n = perRole.get(role) ?? 0;
    perRole.set(role, n + 1);
    labels.set(name, `${role} ${n < 26 ? String.fromCharCode(65 + n) : n + 1}`);
  };
  for (const person of payload.people) add(person.name);
  for (const process of payload.processes) process.owners.forEach(add);
  for (const person of team) add(person.name);
  return labels;
}

/**
 * Replaces every labelled name in a sentence, whole words only and
 * case-sensitive, so "Cara" goes but "Caramel" and "cara" stay. A first name
 * two people share becomes "Team member", since it cannot say which one.
 */
function nameScrubber(labels: Map<string, string>): (text: string) => string {
  const replacements = new Map<string, string>();
  const byFirstName = new Map<string, string | null>();
  for (const [name, label] of labels) {
    replacements.set(name.trim(), label);
    const first = firstName(name);
    if (first.length < 2) continue;
    const seen = byFirstName.get(first);
    byFirstName.set(first, seen === undefined || seen === label ? label : null);
  }
  for (const [first, label] of byFirstName) {
    if (!replacements.has(first)) replacements.set(first, label ?? "Team member");
  }
  if (!replacements.size) return (text) => text;
  const alternatives = [...replacements.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, "gu");
  return (text) => text.replace(pattern, (name) => replacements.get(name) ?? name);
}
