import { describe, expect, it } from "vitest";
import { briefClaims, parseBriefSelection, renderBriefSelection } from "./brief-selection";
import type { StructuredBrief } from "./types";

const brief: StructuredBrief = {
  situation: "Control design remains unverified.",
  highestRisks: [],
  tradeoffs: [],
  frontierNextMove: "Verify the control design.",
  evidence: [],
  variableCascades: [],
  specialistNotes: [],
  advancedReasoning: [],
  decisions: [0, 1, 2, 3].map((n) => ({
    action: `Action ${n}`,
    rationale: `Only when condition ${n} holds.`,
    effort: "low",
    horizonDays: 7,
    evidenceIds: [],
  })),
  chickenLittleWarnings: ["No conclusion about actual operation.", "Coverage remains unverified."],
  markdown: `## Recommended moves
${[0, 1, 2, 3].map((n) => `1. **Action ${n}**: Only when condition ${n} holds.`).join("\n")}

## Source brief
Complete rules-authored content.`,
};

describe("bounded selection protocol", () => {
  const claims = briefClaims(brief);
  it.each(["null", "[]", "true", "1", '"move-0"', "{broken", " "])(
    "rejects non-protocol input %s",
    (text) => {
      expect(parseBriefSelection(text, claims)).toBeNull();
    },
  );
  it("rejects oversized output even with a valid plan at the end", () => {
    expect(
      parseBriefSelection(" ".repeat(4096) + '{"version":1,"highlightIds":["move-0"]}', claims),
    ).toBeNull();
  });
  it("rejects more than three highlights and nonstring ids", () => {
    expect(
      parseBriefSelection(
        JSON.stringify({ version: 1, highlightIds: ["move-0", "move-1", "move-2", "move-3"] }),
        claims,
      ),
    ).toBeNull();
    expect(
      parseBriefSelection(JSON.stringify({ version: 1, highlightIds: [0] }), claims),
    ).toBeNull();
  });
  it("returns the selected statements in rules order and does not append the brief", () => {
    const selected = parseBriefSelection(
      '{"version":1,"highlightIds":["move-2","move-0"]}',
      claims,
    )!;
    const result = renderBriefSelection(brief, claims, selected);
    expect(result.indexOf("Action 0")).toBeLessThan(result.indexOf("Action 2"));
    expect(result).toContain("Only when condition 0 holds.");
    expect(result).toContain("Only when condition 2 holds.");
    expect(result).not.toContain("Most relevant");
    expect(result).not.toContain("## Source brief");
    expect(result).not.toContain("Grok picked");
    for (const warning of brief.chickenLittleWarnings) expect(result).not.toContain(warning);
  });
  it("keeps each selected condition and adds no limits block", () => {
    const result = renderBriefSelection(brief, claims, ["move-0", "move-2"]);
    expect(result).toContain("Action 0: Only when condition 0 holds.");
    expect(result).toContain("Action 2: Only when condition 2 holds.");
    expect(result).not.toContain("Important limits");
    expect(result).not.toContain(brief.markdown);
  });
  it("does not copy warnings into the selection", () => {
    const partiallyCovered = {
      ...brief,
      markdown: `${brief.markdown}\n- ${brief.chickenLittleWarnings[0]}`,
    };
    const result = renderBriefSelection(partiallyCovered, claims, ["move-0"]);
    expect(result).toBe("Action 0: Only when condition 0 holds.");
    expect(result).not.toContain(brief.chickenLittleWarnings[1]);
  });
  it("omits an overlong statement instead of truncating its condition", () => {
    const long = {
      ...brief,
      decisions: [{ ...brief.decisions[0], rationale: "x".repeat(6000) + " Only after approval." }],
    };
    expect(briefClaims(long)).toEqual([]);
  });
  it("uses a complete situation only when there are no decisions", () => {
    expect(briefClaims({ ...brief, decisions: [] })).toEqual([
      { id: "situation", text: brief.situation },
    ]);
    expect(briefClaims({ ...brief, decisions: [], situation: "" })).toEqual([]);
  });
});
