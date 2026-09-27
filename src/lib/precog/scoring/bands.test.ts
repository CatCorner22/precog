import { describe, expect, it } from "vitest";
import { HEALTH_SCALE, healthTone } from "./bands";

describe("healthTone", () => {
  it("draws one health score in one colour whatever the surface", () => {
    expect(healthTone(HEALTH_SCALE.strong)).toBe("ok");
    expect(healthTone(65)).toBe("primary");
    expect(healthTone(HEALTH_SCALE.weak)).toBe("warn");
    expect(healthTone(HEALTH_SCALE.weak - 1)).toBe("danger");
  });
});
