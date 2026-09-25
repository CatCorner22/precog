import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { mapAssessed } from "@/lib/precog/builder/map-state";
import { buildOwnTeam, ownBusinessProfile } from "@/lib/precog/onboarding/own-team";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { buildProcessMapGraph } from "@/lib/precog/process-graph";
import { buildWeeklyActions } from "./build";

const people = buildOwnTeam([
  { name: "Ana Ruiz", role: "Owner", duties: ["approve_payroll"] },
  { name: "Ben Ochoa", role: "Office Manager", duties: ["post_payments", "bank_reconcile"] },
]);

function actionsFor(profile: ReturnType<typeof ownBusinessProfile>) {
  const tpl = resolveTemplate(profile);
  const { snapshots } = buildProcessMapGraph(tpl, profile.staff);
  return buildWeeklyActions({
    tpl,
    staff: { ...profile.staff, independentBankRec: true, dualControlPayments: true },
    dualRelease: profile.dualRelease,
    mapSnapshots: snapshots,
    today: "2026-09-23",
    trackFreshness: true,
    mapAssessed: mapAssessed(profile),
  });
}

describe("weekly plan on a starter map nobody has assigned", () => {
  it("asks the owner to assign owners instead of scoring the starter processes", () => {
    const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
    const actions = actionsFor(profile);
    const ids = actions.map((a) => a.id);
    expect(ids).toContain("map-start");
    expect(ids.some((id) => id.startsWith("map-heat-") || id.startsWith("map-owner-"))).toBe(false);
    const start = actions.find((a) => a.id === "map-start")!;
    expect(start.title).toBe("Assign an owner to each of the 8 starter processes");
    expect(start.tab).toBe("map");
    expect(start.effort).toBe("low");
    expect(start.priority).toBe(84);
    expect(start.why).toContain("dental / medical / veterinary office example");
    // Just below the register's own start action, so the two read in order.
    const register = actions.find((a) => a.id === "register-start")!;
    expect(register.priority).toBeGreaterThan(start.priority);
    expect(ids.indexOf("register-start")).toBeLessThan(ids.indexOf("map-start"));
  });

  it("asks for processes when the owner's own map is empty", () => {
    const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
    const actions = actionsFor({ ...profile, customProcesses: [] });
    expect(actions.find((a) => a.id === "map-start")?.title).toBe(
      "Add the processes your business runs to the map",
    );
  });

  it("scores the map normally once one process has an owner", () => {
    const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
    const base = resolveTemplate(profile).processes;
    const actions = actionsFor({
      ...profile,
      customProcesses: base.map((p, i) => (i === 0 ? { ...p, ownerPersonIds: ["own-2"] } : p)),
    });
    const ids = actions.map((a) => a.id);
    expect(ids).not.toContain("map-start");
    expect(ids.some((id) => id.startsWith("map-heat-") || id.startsWith("map-owner-"))).toBe(true);
  });

  it("keeps the sample business's map actions when mapAssessed is not given", () => {
    const profile = defaultProfile();
    const tpl = resolveTemplate(profile);
    const { snapshots } = buildProcessMapGraph(tpl, profile.staff);
    const actions = buildWeeklyActions({
      tpl,
      staff: profile.staff,
      dualRelease: profile.dualRelease,
      mapSnapshots: snapshots,
      today: "2026-09-23",
    });
    expect(actions.map((a) => a.id)).not.toContain("map-start");
  });
});
