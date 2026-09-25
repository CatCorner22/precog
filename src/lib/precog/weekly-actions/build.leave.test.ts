import { describe, expect, it } from "vitest";
import { defaultDualReleasePolicy } from "@/lib/precog/controls/dual-release";
import { getBaseTemplate, resolveTemplate } from "@/lib/precog/active-template";
import { firstName } from "@/lib/precog/continuity/coverage";
import type { DecisionEntry, PlannedAbsence } from "@/lib/precog/practice-profile";
import { buildWeeklyActions } from "./build";

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
    expect(action?.title).toContain(`${firstName(chris.name)} covers ${item.name}`);
    expect(action?.priority).toBe(92);
    expect(action?.why).not.toContain("Hand off by");
    expect(action?.why).toContain(`Tell ${firstName(chris.name)} today`);
    expect(action?.why).toContain("procedure at Drive/SOPs");
  });

  it("speaks of an unplanned absence as unexpected, not as leave", () => {
    const sick: PlannedAbsence = {
      ...leave,
      from: "2025-04-15",
      to: "2025-04-15",
      unplanned: true,
    };
    const action = build([sick], [], "2025-04-15").find((a) => a.id === "leave-abs-1");
    expect(action?.title).toBe(
      `${firstName(maya.name)} is out unexpectedly 15 Apr, out now: ${firstName(chris.name)} covers ${item.name}`,
    );
    expect(action?.priority).toBe(92);
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
    expect(action?.why).toContain("stops for the whole absence");
  });

  it("names the shared days when extra work only stops while a coworker is also out", () => {
    const [, , third] = dental.people;
    const shared = { ...dental.knowledge[1], id: "shared", criticality: "critical" as const };
    const withShared = resolveTemplate({
      industry: "dental",
      customKnowledge: [item, shared],
      customRelations: [
        { personId: maya.id, knowledgeId: item.id, level: "expert" },
        { personId: maya.id, knowledgeId: shared.id, level: "expert" },
        { personId: third.id, knowledgeId: shared.id, level: "expert" },
      ],
    });
    const action = buildWeeklyActions({
      tpl: withShared,
      staff,
      dualRelease: defaultDualReleasePolicy(withShared),
      today: "2025-04-01",
      decisions: [],
      plannedAbsences: [
        leave,
        {
          id: "abs-3",
          personId: third.id,
          industry: "dental",
          from: "2025-04-18",
          to: "2025-04-22",
        },
      ],
    }).find((a) => a.id === "leave-abs-1");
    expect(action?.why).toContain("2 register entries stop 18–20 Apr, while");
    expect(action?.why).toContain(`${third.name.split(" ")[0]} is also out`);
  });

  it("does not let covered leave use up the slots before leave that stops work", () => {
    // A temp who holds nothing and owns no process: their leave stops nothing at all.
    const temp = { id: "p-temp", name: "Temp Nine", role: "Intern", active: true };
    const withTemp = resolveTemplate({
      industry: "dental",
      customPeople: [...dental.people, temp],
      customKnowledge: [item],
      customRelations: [
        { personId: maya.id, knowledgeId: item.id, level: "expert" },
        { personId: chris.id, knowledgeId: item.id, level: "basic" },
      ],
    });
    const covered = (id: string, from: string, to: string): PlannedAbsence => ({
      id,
      personId: temp.id,
      industry: "dental",
      from,
      to,
    });
    const actions = buildWeeklyActions({
      tpl: withTemp,
      staff,
      dualRelease: defaultDualReleasePolicy(withTemp),
      today: "2025-04-01",
      decisions: [],
      plannedAbsences: [
        covered("abs-c1", "2025-04-03", "2025-04-04"),
        covered("abs-c2", "2025-04-07", "2025-04-08"),
        leave,
      ],
    });
    expect(actions.some((a) => a.id === "leave-abs-1")).toBe(true);
    expect(actions.some((a) => a.id.startsWith("leave-abs-c"))).toBe(false);
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

  it("does not let one leave's hand-off stand in for a later leave", () => {
    const later: PlannedAbsence = {
      ...leave,
      id: "abs-later",
      from: "2025-04-25",
      to: "2025-04-28",
    };
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
      linkedAbsenceId: leave.id,
      status: "open",
    };
    const actions = build([leave, later], [logged]);
    expect(actions.some((a) => a.id === "leave-abs-1")).toBe(false);
    expect(actions.some((a) => a.id === "leave-abs-later")).toBe(true);
  });

  it("asks the debrief once the leave is over", () => {
    const actions = build([leave], [], "2025-04-22");
    const debrief = actions.find((a) => a.id === "debrief-abs-1");
    expect(debrief?.title).toBe(
      `${firstName(maya.name)}'s back: can ${firstName(chris.name)} run ${item.name} alone now?`,
    );
    expect(debrief?.why).toContain("covered");
    expect(debrief?.why).toContain("8 days");
    expect(debrief?.tab).toBe("knowledge");
    expect(debrief?.priority).toBe(78);
    expect(actions.some((a) => a.id === "leave-abs-1")).toBe(false);
  });

  it("asks the debrief instead of recommending the same cross-training, until it is debriefed", () => {
    const single = resolveTemplate({
      industry: "dental",
      customKnowledge: [item],
      customRelations: [{ personId: maya.id, knowledgeId: item.id, level: "expert" }],
    });
    const run = (plannedAbsences: PlannedAbsence[]) =>
      buildWeeklyActions({
        tpl: single,
        staff,
        dualRelease: defaultDualReleasePolicy(single),
        today: "2025-04-22",
        decisions: [],
        plannedAbsences,
      });
    const during = run([]);
    expect(during.some((a) => a.id === `spof-${item.id}`)).toBe(true);
    const after = run([leave]);
    expect(after.some((a) => a.id === "debrief-abs-1")).toBe(true);
    expect(after.some((a) => a.id === `spof-${item.id}`)).toBe(false);
    const debriefed = run([{ ...leave, debriefedAt: "2025-04-21" }]);
    expect(debriefed.some((a) => a.id.startsWith("debrief-"))).toBe(false);
    expect(debriefed.some((a) => a.id === `spof-${item.id}`)).toBe(true);
  });
});
