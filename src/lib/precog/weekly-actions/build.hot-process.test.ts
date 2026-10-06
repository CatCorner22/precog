import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { INDUSTRIES, type IndustryId } from "@/lib/precog/industry";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { buildProcessMapGraph, type ProcessMapSnapshot } from "@/lib/precog/process-graph";
import { HEAT_BANDS } from "@/lib/precog/scoring/bands";
import { buildWeeklyActions } from "./build";

function actionsFor(industry: IndustryId, edit = (s: ProcessMapSnapshot[]) => s) {
  const profile = defaultProfile(industry);
  const tpl = resolveTemplate(profile);
  const { snapshots } = buildProcessMapGraph(tpl, profile.staff);
  return buildWeeklyActions({
    tpl,
    staff: profile.staff,
    dualRelease: profile.dualRelease,
    mapSnapshots: edit(snapshots),
    today: "2026-10-06",
  });
}

describe("a hot process in the week's actions", () => {
  it("reads as the control its worst open conflict needs, for the person who holds it", () => {
    const cash = actionsFor("restaurant").find((a) => a.id === "map-heat-proc-cash");
    expect(cash?.title).toBe("Have someone other than Keisha approve write-offs and voids");
    expect(cash?.why).toMatch(
      /^In Cash, tips & deposits, Keisha can both prepare bank deposit and approve write-offs and voids\. /,
    );
    expect(cash?.effort).toBe("medium");
  });

  it("hands the check to someone else, not the act", () => {
    const cash = actionsFor("professional_services").find((a) => a.id === "map-heat-proc-cash");
    expect(cash?.title).toBe("Have someone other than Greg reconcile the bank account");
  });

  it("never prints tool words, a heat figure or the same hand-off twice, in any sample", () => {
    for (const { id } of INDUSTRIES) {
      const actions = actionsFor(id as IndustryId);
      const hot = actions.filter((a) => a.id.startsWith("map-heat-"));
      for (const a of hot) {
        expect(a.title, id).toMatch(/^Have someone other than \S+ /);
        expect(`${a.title} ${a.why}`, id).not.toMatch(/hot process|Heat \d|map builder/i);
      }
      const titles = actions.map((a) => a.title);
      expect(new Set(titles).size, id).toBe(titles.length);
    }
  });

  it("gives no action for a hot process with no open duty conflict", () => {
    const actions = actionsFor("restaurant", (snapshots) => {
      const hot = snapshots.find((s) => s.heat >= HEAT_BANDS.hot)!;
      // A hot process no duty touches: it has no conflict to name.
      return [{ ...hot, process: { ...hot.process, id: "proc-none", name: "Menu planning" } }];
    });
    expect(actions.map((a) => a.id)).not.toContain("map-heat-proc-none");
  });
});
