import { describe, expect, it } from "vitest";
import { continuityTemplate, knowledgeItem } from "@/test/fixtures";
import { coverageReport } from "./coverage";
import { coverageBadge, noNoticeText, statusBadge } from "./planner-copy";
import { itemRecorded } from "./register-state";

const people = [
  { id: "a", name: "Ana", role: "Owner", active: true },
  { id: "b", name: "Ben", role: "Assistant", active: true },
];

describe("coverageBadge", () => {
  it("reads 'Not marked yet' until someone is marked on the entry at any level", () => {
    const tpl = continuityTemplate({
      people,
      knowledge: [knowledgeItem("unmarked"), knowledgeItem("aware")],
      relations: [{ personId: "b", knowledgeId: "aware", level: "aware" }],
    });
    const report = coverageReport(tpl);
    const [unmarked, aware] = report.items;
    expect(coverageBadge(unmarked, tpl)).toEqual({
      label: "Not marked yet",
      variant: "default",
    });
    expect(coverageBadge(aware, tpl)).toEqual({
      label: "Nobody can do this alone",
      variant: "danger",
    });
  });

  it("counts a former-only relation as covered by the register but leaves untouched rows neutral", () => {
    const tpl = continuityTemplate({
      people: [...people, { id: "former", name: "Avery", role: "Former", active: false }],
      knowledge: [knowledgeItem("appeals"), knowledgeItem("untouched")],
      relations: [{ personId: "former", knowledgeId: "appeals", level: "proficient" }],
    });
    const report = coverageReport(tpl);
    const formerHeld = report.items.find((row) => row.item.id === "appeals")!;
    const untouched = report.items.find((row) => row.item.id === "untouched")!;

    expect(coverageBadge(formerHeld, tpl)).toEqual({
      label: "Nobody can do this alone",
      variant: "danger",
    });
    expect(coverageBadge(untouched, tpl)).toEqual({
      label: "Not marked yet",
      variant: "default",
    });
  });

  it("keeps an owner-written list with no relations in its existing unmarked state", () => {
    const tpl = continuityTemplate({
      people,
      knowledge: [knowledgeItem("owner-written")],
      relations: [],
    });
    const row = coverageReport(tpl).items[0];

    expect(itemRecorded(tpl, row.item.id)).toBe(true);
    expect(coverageBadge(row, tpl)).toEqual({
      label: "Not marked yet",
      variant: "default",
    });
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
