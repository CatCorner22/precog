import { describe, expect, it } from "vitest";
import { TERMS, termLabel } from "./terms";

const plain = (p: string) => p;
const tactical = (_p: string, t: string) => t;

describe("TERMS", () => {
  it("names the segregation figure in each mode", () => {
    expect(termLabel("segregationFigure", plain)).toBe("Duties kept apart");
    expect(termLabel("segregationFigure", tactical)).toBe("Duty separation");
  });

  it("uses the plain wording in tactical mode when a term has no tactical name", () => {
    expect(termLabel("dutyAssignments", tactical)).toBe("Duty assignments");
    expect(termLabel("businessSettings", tactical)).toBe("Business settings");
  });

  it("never lists a current name as retired", () => {
    const current = Object.values(TERMS).flatMap((t) => [t.plain, t.tactical]);
    for (const term of Object.values(TERMS)) {
      for (const old of term.retired) expect(current).not.toContain(old);
    }
  });
});
