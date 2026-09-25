import { describe, expect, it } from "vitest";
import { defaultDualReleasePolicy } from "@/lib/precog/controls/dual-release";
import { getBaseTemplate, resolveTemplate } from "@/lib/precog/active-template";
import { firstName } from "@/lib/precog/continuity/coverage";
import { markLeft, setLastDay } from "@/lib/precog/continuity/leavers";
import type { DecisionEntry } from "@/lib/precog/practice-profile";
import type { Person } from "@/lib/precog/types";
import { buildWeeklyActions } from "./build";

const dental = getBaseTemplate("dental");
const [maya, chris] = dental.people;
const item = {
  ...dental.knowledge[0],
  criticality: "critical" as const,
  documented: false,
  confirmedAt: "2025-03-20",
};

function build(people: Person[], decisions: DecisionEntry[] = [], today = "2025-04-01") {
  const tpl = resolveTemplate({
    industry: "dental",
    customPeople: people,
    customKnowledge: [item],
    customRelations: [
      { personId: maya.id, knowledgeId: item.id, level: "expert" },
      { personId: chris.id, knowledgeId: item.id, level: "basic" },
    ],
  });
  return buildWeeklyActions({
    tpl,
    staff: { ...tpl.staffComposition, independentBankRec: true, dualControlPayments: true },
    dualRelease: defaultDualReleasePolicy(tpl),
    today,
    decisions,
    plannedAbsences: [],
  });
}

const notice = setLastDay(dental.people, maya.id, "2025-04-20");

describe("buildWeeklyActions leavers", () => {
  it("makes the hand-over the week's continuity action, with a deadline no later than the last day", () => {
    const actions = build(notice);
    const action = actions.find((a) => a.id === `leaver-${maya.id}`);
    expect(action?.title).toBe(
      `${firstName(maya.name)} leaves in 19 days: train ${firstName(chris.name)} on ${item.name}`,
    );
    expect(action?.why).toContain("Hand over by 2025-04-20");
    expect(action?.why).toContain("1 has nothing written down");
    expect(action?.why).toContain("Left in the business after 2025-04-20");
    expect(action?.effort).toBe("medium");
    expect(action?.priority).toBe(87);
    expect(action?.tab).toBe("knowledge");
    // The same entry is not also recommended as ordinary cross-training.
    expect(actions.some((a) => a.id === `spof-${item.id}`)).toBe(false);
  });

  it("escalates inside the last week", () => {
    const action = build(notice, [], "2025-04-15").find((a) => a.id === `leaver-${maya.id}`);
    expect(action?.title).toContain("leaves in 5 days");
    expect(action?.priority).toBe(91);
  });

  it("asks about a logged training step at hand-over urgency instead of giving fresh advice", () => {
    const logged: DecisionEntry = {
      id: "d-train",
      createdAt: "2025-04-01T09:00:00.000Z",
      subject: item.name,
      kind: "remediate",
      note: "Train Chris before Maya goes",
      reviewBy: "2025-04-12",
      linkedTab: "knowledge",
      linkedId: item.id,
      linkedIndustry: "dental",
      linkedStep: "cover",
      linkedPersonId: chris.id,
      status: "open",
    };
    const actions = build(notice, [logged], "2025-04-15");
    expect(actions.some((a) => a.id === `leaver-${maya.id}`)).toBe(false);
    const reminder = actions.find((a) => a.id === "commit-d-train");
    expect(reminder?.title).toBe(
      `Review overdue: can ${firstName(chris.name)} run ${item.name} alone yet?`,
    );
    expect(reminder?.why).toContain(`only ${firstName(maya.name)} can run it alone`);
    expect(reminder?.priority).toBe(91);
  });

  it("asks to mark them as left once the last day has passed, while they still count as cover", () => {
    const action = build(notice, [], "2025-04-23").find((a) => a.id === `leaver-${maya.id}`);
    expect(action?.title).toBe(
      `${firstName(maya.name)} left 3 days ago: mark ${firstName(maya.name)} as left`,
    );
    expect(action?.why).toContain("still counts as cover for 1 register entry");
    expect(action?.priority).toBe(93);
  });

  it("stops once they are marked as left, and the entry falls back to ordinary coverage advice", () => {
    const actions = build(markLeft(notice, maya.id, "2025-04-23"), [], "2025-04-23");
    expect(actions.some((a) => a.id.startsWith("leaver-"))).toBe(false);
    expect(actions.find((a) => a.id === `spof-${item.id}`)?.title).toBe(
      `Find someone to own ${item.name}`,
    );
  });

  it("says nothing about someone whose work is all shared", () => {
    const tplPeople = setLastDay(dental.people, chris.id, "2025-04-20");
    const actions = build(tplPeople);
    expect(actions.some((a) => a.id === `leaver-${chris.id}`)).toBe(false);
  });
});
