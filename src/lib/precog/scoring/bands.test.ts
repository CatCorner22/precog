import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "../industry";
import { defaultProfile } from "../practice-profile";
import { getIndustryTemplate } from "../templates";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { openSeverityCounts } from "../sod/open-findings";
import { HEALTH_SCALE, healthLevel, healthTone, segregationLevel } from "./bands";

describe("healthTone", () => {
  it("draws one health score in one colour whatever the surface", () => {
    expect(healthTone(HEALTH_SCALE.strong)).toBe("ok");
    expect(healthTone(65)).toBe("primary");
    expect(healthTone(HEALTH_SCALE.weak)).toBe("warn");
    expect(healthTone(HEALTH_SCALE.weak - 1)).toBe("danger");
  });
});

describe("segregationLevel", () => {
  it("is at best weak while a critical finding is open", () => {
    expect(segregationLevel(85, { openCritical: 1, openHigh: 0 })).toBe("weak");
    expect(segregationLevel(85, { openCritical: 1, openHigh: 2 })).toBe("weak");
  });

  it("is at best adequate while a high finding is open and no critical one is", () => {
    expect(segregationLevel(85, { openCritical: 0, openHigh: 1 })).toBe("adequate");
  });

  it("reads the number alone when nothing critical or high is open", () => {
    expect(segregationLevel(85, { openCritical: 0, openHigh: 0 })).toBe("strong");
  });

  it("never raises a level the number already puts lower", () => {
    expect(segregationLevel(30, { openCritical: 1, openHigh: 0 })).toBe("critical");
    expect(segregationLevel(50, { openCritical: 0, openHigh: 1 })).toBe("weak");
  });

  it("over every sample team, and each sample person alone, never reads strong or adequate with a critical finding open", () => {
    let capped = 0;
    for (const { id } of INDUSTRIES) {
      const sample = getIndustryTemplate(id);
      const profile = defaultProfile(id);
      const teams = [sample, ...sample.people.map((p) => ({ ...sample, people: [p] }))];
      for (const tpl of teams) {
        const sod = detectSodConflicts(
          tpl,
          profile.staff,
          sodDetectionOptions(tpl, profile.dualRelease),
        );
        const open = openSeverityCounts(sod.conflicts, profile.dualRelease);
        const health = sod.summary.segregationHealth;
        const level = segregationLevel(health, open);
        if (open.openCritical > 0) {
          expect(["strong", "adequate"]).not.toContain(level);
          if (healthLevel(health) !== level) capped += 1;
        }
        if (open.openHigh > 0) expect(level).not.toBe("strong");
      }
    }
    // The cap is not idle: some team's number alone would read strong or adequate.
    expect(capped).toBeGreaterThan(0);
  });
});
