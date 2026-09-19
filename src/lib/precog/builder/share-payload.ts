import { resolveTemplate } from "../active-template";
import { industryMeta } from "../industry";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap } from "../process-graph";
import type { PracticeProfile } from "../practice-profile";
import { evidenceStatus } from "./evidence";
import type { SharedMapPayload } from "./share-server";

/** Build the frozen share payload from the profile and its resolved template. */
export function buildSharePayload(
  profile: PracticeProfile,
  actions: { title: string; why: string; effort: string }[],
  note?: string,
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

  return {
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
}
