import { describe, expect, it } from "vitest";
import { continuityTemplate, knowledgeItem } from "@/test/fixtures";
import { coverageReport } from "./coverage";
import { coverageBadge, noNoticeText, statusBadge } from "./planner-copy";

const people = [
  { id: "a", name: "Ana", role: "Owner", active: true },
  { id: "b", name: "Ben", role: "Assistant", active: true },
];

describe("coverageBadge", () => {
  it("reads 'Not marked yet' until someone is marked on the entry at any level", () => {
    const report = coverageReport(
      continuityTemplate({
        people,
        knowledge: [knowledgeItem("unmarked"), knowledgeItem("aware")],
        relations: [{ personId: "b", knowledgeId: "aware", level: "aware" }],
      }),
    );
    const [unmarked, aware] = report.items;
    expect(coverageBadge(unmarked)).toEqual({ label: "Not marked yet", variant: "default" });
    expect(coverageBadge(aware)).toEqual({ label: "Nobody can do this alone", variant: "danger" });
  });
});

describe("statusBadge", () => {
  it("uses a neutral badge only for unrecorded uncovered entries", () => {
    expect(statusBadge("uncovered", false)).toEqual({
      label: "Not marked yet",
      variant: "default",
    });
    expect(statusBadge("uncovered", true)).toEqual({
      label: "Nobody can do this alone",
      variant: "danger",
    });
    expect(statusBadge("single", false)).toEqual({ label: "Only one person", variant: "danger" });
  });
});

describe("noNoticeText", () => {
  it("says nobody has given notice only while nobody has left either", () => {
    expect(noNoticeText([])).toMatch(/^Nobody has given notice\./);
  });

  it("does not contradict the access checklist for someone who has left", () => {
    const text = noNoticeText(["Tony Ruiz"]);
    expect(text).not.toMatch(/^Nobody has given notice/);
    expect(text).toMatch(/^Nobody still on the team has given notice\. Tony Ruiz left/);
    expect(noNoticeText(["Ana", "Ben"])).toContain("Ana and Ben left");
  });
});
