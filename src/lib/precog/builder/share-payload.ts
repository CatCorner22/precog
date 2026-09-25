import { resolveTemplate } from "../active-template";
import { industryMeta } from "../industry";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap } from "../process-graph";
import type { PracticeProfile } from "../practice-profile";
import { evidenceStatus } from "./evidence";
import type { SharedMapPayload } from "./share-schema";

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

  return redactNames ? redactSharePayload(payload) : payload;
}

/** Replace people names with deterministic role labels for privacy-safe sharing. */
export function redactSharePayload(payload: SharedMapPayload): SharedMapPayload {
  const labels = new Map<string, string>();
  const roleCounts = new Map<string, number>();
  const labelFor = (name: string, role?: string) => {
    const existing = labels.get(name);
    if (existing) return existing;
    const labelRole = role?.trim() || "Team member";
    const count = roleCounts.get(labelRole) ?? 0;
    const label = `${labelRole} ${String.fromCharCode(65 + count)}`;
    roleCounts.set(labelRole, count + 1);
    labels.set(name, label);
    return label;
  };

  for (const person of payload.people) labelFor(person.name, person.role);
  for (const process of payload.processes) {
    for (const owner of process.owners) labelFor(owner);
  }

  const roleByName = new Map(payload.people.map((person) => [person.name, person.role]));
  return {
    ...payload,
    people: payload.people.map((person) => ({
      ...person,
      name: labels.get(person.name) ?? person.name,
    })),
    processes: payload.processes.map((process) => ({
      ...process,
      owners: process.owners.map(
        (owner) => labels.get(owner) ?? labelFor(owner, roleByName.get(owner)),
      ),
    })),
  };
}
