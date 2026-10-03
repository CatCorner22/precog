import { describe, expect, it } from "vitest";
import { defaultProfile } from "../practice-profile";
import { resolveTemplate } from "../active-template";
import { rankDepartureRisk } from "./departure";
import { previewMapHealth } from "./what-if";

const profile = defaultProfile("dental");
const tpl = resolveTemplate(profile);
const ranked = rankDepartureRisk(tpl, tpl.processes, tpl.people, profile.staff);

describe("rankDepartureRisk", () => {
  it("scores everyone against the same baseline, highest impact first", () => {
    const baseline = previewMapHealth(tpl, tpl.processes, profile.staff, {
      people: tpl.people,
    }).score;
    expect(ranked.every((d) => d.healthBefore === baseline)).toBe(true);
    expect(ranked.map((d) => d.impact)).toEqual(
      [...ranked.map((d) => d.impact)].sort((a, b) => b - a),
    );
  });

  it("orphans a process only its departing owner held", () => {
    // Jordan Blake is the only owner of cash handling in the dental sample.
    const jordan = ranked.find((d) => d.person.name === "Jordan Blake")!;
    expect(jordan.orphanedProcesses.map((p) => p.id)).toContain("proc-cash");
    expect(jordan.coveredProcesses.map((p) => p.id)).toContain("proc-schedule");
    expect(jordan.recommendations[0]).toMatch(/^Name a new owner on "Cash handling & deposits"/);
  });
});
