import { describe, expect, it } from "vitest";
import { JOHARI_PLAYBOOK } from "./johari-applications";

describe("Johari playbook wording", () => {
  it("is written for any business, in the owner's words", () => {
    // Tab ids ("sod", "precog") are navigation targets, not wording.
    const text = JSON.stringify(JOHARI_PLAYBOOK, (key, value: unknown) =>
      key === "precogTab" ? undefined : value,
    );
    expect(text).not.toMatch(
      /patient|\bPMS\b|HIPAA|dental|\bOM\b|practices?\b|SPOF|\bUU\b|ontology|epistemic|\bSoD\b/i,
    );
  });

  it("gives every quadrant examples and every domain a reason it matters", () => {
    for (const q of JOHARI_PLAYBOOK.quadrants) expect(q.examples.length).toBeGreaterThan(0);
    for (const d of JOHARI_PLAYBOOK.domains) expect(d.whyItMatters).not.toBe("");
  });
});
