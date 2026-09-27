import { describe, expect, it } from "vitest";
import { defaultProfile } from "../practice-profile";
import { resolveTemplate } from "../active-template";
import { healthDelta, previewMapHealth } from "./what-if";

const profile = defaultProfile("dental");
const tpl = resolveTemplate(profile);
const health = previewMapHealth(tpl, tpl.processes, profile.staff);

describe("healthDelta", () => {
  it("names no driver when nothing moved", () => {
    expect(healthDelta(health, health)).toEqual({
      before: health.score,
      after: health.score,
      delta: 0,
      driver: undefined,
    });
  });

  it("names the dimension that moved most", () => {
    const unowned = tpl.processes.map((p) => ({ ...p, ownerPersonIds: [] }));
    const after = previewMapHealth(tpl, unowned, profile.staff);
    const delta = healthDelta(health, after);
    expect(delta.delta).toBeLessThan(0);
    expect(delta.driver?.delta).toBeLessThan(0);
  });
});
