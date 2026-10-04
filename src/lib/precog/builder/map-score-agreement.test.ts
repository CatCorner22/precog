import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { buildOwnTeam, ownBusinessProfile } from "../onboarding/own-team";
import { defaultProfile } from "../practice-profile";
import { buildControlReportModel } from "../report/build-control-report";
import { buildSharePayload } from "../share/share-payload";
import { scoreMap } from "./scored-map";

const people = buildOwnTeam([
  { name: "Ana Ruiz", role: "Owner", duties: ["bank_reconcile"] },
  { name: "Ben Ochoa", role: "Office Manager", duties: ["post_payments", "prepare_deposit"] },
]);

/** An own-team business with one starter process assigned, the rest untouched. */
function oneTouched() {
  const base = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
  const starter = resolveTemplate(base).processes;
  return {
    ...base,
    customProcesses: starter.map((p, i) =>
      i === 0 ? { ...p, ownerPersonIds: [people[0].id] } : p,
    ),
  };
}

describe("map score agreement", () => {
  it("the report, the share payload and the map pill score the same processes", () => {
    const profile = oneTouched();
    const tpl = resolveTemplate(profile);
    const scored = scoreMap(tpl, tpl.processes, profile.staff, {
      profile: { industry: profile.industry, customPeople: profile.customPeople },
      people: tpl.people,
      layout: profile.mapLayout ?? {},
      customized: true,
    });
    expect(scored.unscoredCount).toBe(tpl.processes.length - 1);

    const report = buildControlReportModel({
      tpl,
      profile,
      mapCustomized: true,
      today: "2026-09-26",
      trackFreshness: false,
      mapReady: true,
      businessName: profile.practiceName,
    });
    expect(report.mapHealth.score).toBe(scored.health.score);
    expect(report.issues).toEqual(scored.issues);

    const shared = buildSharePayload(profile, [], undefined, false);
    expect(shared.health.score).toBe(scored.health.score);
    expect(shared.processes.length).toBe(scored.snapshots.length);
    expect(shared.health.processCount).toBe(scored.snapshots.length);
  });

  it("reports no drift when the stored history matches the printed score", () => {
    const profile = oneTouched();
    const tpl = resolveTemplate(profile);
    const scored = scoreMap(tpl, tpl.processes, profile.staff, {
      profile: { industry: profile.industry, customPeople: profile.customPeople },
      people: tpl.people,
      layout: profile.mapLayout ?? {},
      customized: true,
    });
    const withHistory = {
      ...profile,
      mapCompletenessHistory: [{ at: "2026-09-20T00:00:00.000Z", score: scored.health.score }],
    };
    const report = buildControlReportModel({
      tpl,
      profile: withHistory,
      mapCustomized: true,
      today: "2026-09-26",
      trackFreshness: false,
      mapReady: true,
      businessName: profile.practiceName,
    });
    expect(report.healthDelta).toBeNull();
  });
});
