import { describe, expect, it } from "vitest";
import { defaultDualReleasePolicy } from "@/lib/precog/controls/dual-release";
import { getBaseTemplate, resolveTemplate } from "@/lib/precog/active-template";
import type { DecisionEntry, PlannedAbsence } from "@/lib/precog/practice-profile";
import { buildWeeklyActions } from "./weekly-action-plan-data";

const dental = getBaseTemplate("dental");
const [maya, chris] = dental.people;
const item = {
  ...dental.knowledge[0],
  criticality: "critical" as const,
  documented: true,
  procedureLocation: "Drive/SOPs",
  confirmedAt: "2025-03-20",
};
const tpl = resolveTemplate({
  industry: "dental",
  customKnowledge: [item],
  customRelations: [
    { personId: maya.id, knowledgeId: item.id, level: "expert" },
    { personId: chris.id, knowledgeId: item.id, level: "basic" },
  ],
});
const staff = { ...tpl.staffComposition, independentBankRec: true, dualControlPayments: true };

const leave: PlannedAbsence = {
  id: "abs-1",
  personId: maya.id,
  industry: "dental",
  from: "2025-04-13",
  to: "2025-04-20",
};

function build(
  plannedAbsences: PlannedAbsence[],
  decisions: DecisionEntry[] = [],
  today = "2025-04-01",
) {
  return buildWeeklyActions({
    tpl,
    staff,
    dualRelease: defaultDualReleasePolicy(tpl),
    today,
    decisions,
    plannedAbsences,
  });
}

describe("buildWeeklyActions planned leave", () => {
  it("warns ahead of leave that stops critical work, with lead time and hand-off deadline", () => {
    const action = build([leave]).find((a) => a.id === "leave-abs-1");
    expect(action).toBeDefined();
    expect(action?.title).toContain("in 12 days");
    expect(action?.title).toContain("13–20 Apr");
    expect(action?.title).toContain(`hand off ${item.name} to`);
    expect(action?.effort).toBe("low");
    expect(action?.why).toContain("Hand off by 2025-04-12");
    expect(action?.why).toContain("Left in the business");
    expect(action?.tab).toBe("knowledge");
    expect(action?.priority).toBe(85);
  });

  it("escalates once the leave is under way", () => {
    const action = build([leave], [], "2025-04-15").find((a) => a.id === "leave-abs-1");
    expect(action?.title).toContain("out now");
    expect(action?.priority).toBe(92);
    expect(action?.why).not.toContain("Hand off by");
  });

  it("ignores leave further than 30 days out, in another industry, or already over", () => {
    const far = build([{ ...leave, from: "2025-06-01", to: "2025-06-05" }]);
    const retail = build([{ ...leave, industry: "retail" }]);
    const past = build([{ ...leave, from: "2025-03-01", to: "2025-03-05" }]);
    for (const actions of [far, retail, past]) {
      expect(actions.some((a) => a.id.startsWith("leave-"))).toBe(false);
    }
  });

  it("flags overlapping leave by name", () => {
    const action = build([
      leave,
      { id: "abs-2", personId: chris.id, industry: "dental", from: "2025-04-18", to: "2025-04-22" },
    ]).find((a) => a.id === "leave-abs-1");
    expect(action?.why).toContain(`${chris.name.split(" ")[0]} is also out for part of it`);
  });

  it("reports a logged hand-off as in progress instead of fresh advice", () => {
    const logged: DecisionEntry = {
      id: "d-handoff",
      createdAt: "2025-04-01T09:00:00.000Z",
      subject: item.name,
      kind: "remediate",
      note: "Hand off before leave",
      reviewBy: "2025-04-12",
      linkedTab: "knowledge",
      linkedId: item.id,
      linkedIndustry: "dental",
      linkedStep: "handoff",
      status: "open",
    };
    const actions = build([leave], [logged]);
    expect(actions.some((a) => a.id === "leave-abs-1")).toBe(false);
    const reminder = actions.find((a) => a.id.startsWith("commit-"));
    expect(reminder?.why).toContain("out 13–20 Apr, in 12 days");
  });
});
