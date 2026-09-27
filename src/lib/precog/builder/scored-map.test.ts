import { describe, expect, it } from "vitest";
import { scoreMap } from "./scored-map";
import { untouchedStarterProcessIds } from "./map-state";
import { resolveTemplate } from "../active-template";
import { buildOwnTeam, ownBusinessProfile } from "../onboarding/own-team";
import { defaultProfile } from "../practice-profile";
import { buildProcessMapGraph } from "../process-graph";
import { HEAT_BANDS } from "../scoring/bands";

const people = buildOwnTeam([
  { name: "Ana Ruiz", role: "Owner", duties: ["bank_reconcile"] },
  { name: "Ben Ochoa", role: "Office Manager", duties: ["post_payments", "prepare_deposit"] },
]);

/** An own dental business that has assigned one owner to one starter process. */
function oneOwnerAssigned() {
  const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
  const processes = resolveTemplate(profile).processes;
  return {
    ...profile,
    customProcesses: processes.map((p, i) =>
      i === 0 ? { ...p, ownerPersonIds: [people[0].id] } : p,
    ),
  };
}

function score(profile: ReturnType<typeof oneOwnerAssigned>) {
  const tpl = resolveTemplate(profile);
  return scoreMap(tpl, tpl.processes, profile.staff, {
    profile,
    layout: profile.mapLayout ?? {},
    customized: true,
  });
}

describe("scoreMap", () => {
  it("scores only the processes the map page scores", () => {
    const profile = oneOwnerAssigned();
    const tpl = resolveTemplate(profile);
    const starter = untouchedStarterProcessIds(profile);
    const { health, unscoredCount } = score(profile);

    expect(unscoredCount).toBe(tpl.processes.length - 1);
    expect(health.processCount).toBe(1);
    // The one scored process has its owner, so nothing counts as unowned.
    expect(health.unownedProcesses).toBe(0);

    // The map page's hot count: processes that are scored and at or above "hot".
    const mapHot = buildProcessMapGraph(tpl, profile.staff).snapshots.filter(
      (s) => !starter.has(s.process.id) && s.heat >= HEAT_BANDS.hot,
    ).length;
    expect(health.hotProcesses).toBe(mapHot);
  });

  it("drops issues about untouched starter processes and keeps the rest", () => {
    const profile = oneOwnerAssigned();
    const starter = untouchedStarterProcessIds(profile);
    const { issues } = score(profile);
    expect(issues.every((i) => !i.processId || !starter.has(i.processId))).toBe(true);
  });

  it("scores the sample business in full", () => {
    const profile = defaultProfile();
    const tpl = resolveTemplate(profile);
    const { health, unscoredCount } = scoreMap(tpl, tpl.processes, profile.staff, { profile });
    expect(unscoredCount).toBe(0);
    expect(health.processCount).toBe(tpl.processes.length);
  });
});
