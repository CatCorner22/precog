import { describe, expect, it } from "vitest";
import { defaultDualReleasePolicy } from "@/lib/precog/controls/dual-release";
import { getBaseTemplate, resolveTemplate } from "@/lib/precog/active-template";
import type { DecisionEntry } from "@/lib/precog/practice-profile";
import { buildWeeklyActions } from "./weekly-action-plan-data";

const dental = getBaseTemplate("dental");
const holder = dental.people[0];
const trainee = dental.people[1];
const item = {
  ...dental.knowledge[0],
  criticality: "critical" as const,
  documented: true,
  procedureLocation: "Drive/SOPs",
  confirmedAt: "2025-03-20",
};
const single = resolveTemplate({
  industry: "dental",
  customKnowledge: [item],
  customRelations: [{ personId: holder.id, knowledgeId: item.id, level: "expert" }],
});
const staff = { ...single.staffComposition, independentBankRec: true, dualControlPayments: true };

function coverDecision(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    id: "d-cover",
    createdAt: "2025-03-01T09:00:00.000Z",
    subject: `Train ${trainee.name} on ${item.name}`,
    kind: "remediate",
    note: "",
    reviewBy: "2025-05-01",
    linkedTab: "knowledge",
    linkedId: item.id,
    linkedIndustry: "dental",
    linkedStep: "cover",
    linkedPersonId: trainee.id,
    status: "open",
    ...overrides,
  };
}

function build(decisions: DecisionEntry[], today = "2025-04-01") {
  return buildWeeklyActions({
    tpl: single,
    staff,
    dualRelease: defaultDualReleasePolicy(single),
    today,
    decisions,
  });
}

describe("buildWeeklyActions journal awareness", () => {
  it("recommends cross-training when nothing is logged", () => {
    const actions = build([]);
    expect(actions).toContainEqual(
      expect.objectContaining({ id: `spof-${item.id}`, tab: "knowledge", priority: 82 }),
    );
    expect(actions.some((a) => a.id.startsWith("commit-"))).toBe(false);
  });

  it("reports an open cross-training decision as in progress instead of fresh advice", () => {
    const actions = build([coverDecision()]);
    expect(actions.some((a) => a.id === `spof-${item.id}`)).toBe(false);
    const first = trainee.name.split(" ")[0];
    expect(actions).toContainEqual(
      expect.objectContaining({
        id: "commit-d-cover",
        title: `In progress: ${first} on ${item.name} — review 2025-05-01`,
        tab: "journal",
        effort: "low",
        priority: 40,
      }),
    );
    const action = actions.find((a) => a.id === "commit-d-cover");
    expect(action?.why).toContain(
      `You logged "Train ${trainee.name} on ${item.name}" on 2025-03-01`,
    );
    expect(action?.why).toContain("the register still says only one person");
  });

  it("asks whether the training happened once the review date has passed", () => {
    const actions = build([coverDecision()], "2025-05-02");
    const first = trainee.name.split(" ")[0];
    expect(actions).toContainEqual(
      expect.objectContaining({
        id: "commit-d-cover",
        title: `Review overdue: can ${first} run ${item.name} alone yet?`,
        tab: "journal",
        priority: 82,
      }),
    );
    expect(actions.find((a) => a.id === "commit-d-cover")?.why).toContain(
      "Close it in the Journal",
    );
    expect(actions.some((a) => a.id === `spof-${item.id}`)).toBe(false);
  });

  it("keeps a review due today as in progress", () => {
    const actions = build([coverDecision()], "2025-05-01");
    expect(actions.find((a) => a.id === "commit-d-cover")?.title).toMatch(/^In progress/);
  });

  it("falls back to the item when the planned trainee left the team", () => {
    const actions = build([coverDecision({ linkedPersonId: "p-gone" })], "2025-05-02");
    expect(actions.find((a) => a.id === "commit-d-cover")?.title).toBe(
      `Review overdue: is ${item.name} backed up yet?`,
    );
  });

  it("still recommends the next uncommitted gap when the top-ranked gaps are already logged", () => {
    const items = [0, 1, 2].map((i) => ({
      ...item,
      id: `k-gap-${i}`,
      name: `Gap ${i}`,
    }));
    const three = resolveTemplate({
      industry: "dental",
      customKnowledge: items,
      customRelations: items.map((k) => ({
        personId: holder.id,
        knowledgeId: k.id,
        level: "expert" as const,
      })),
    });
    const actions = buildWeeklyActions({
      tpl: three,
      staff,
      dualRelease: defaultDualReleasePolicy(three),
      today: "2025-05-02",
      decisions: [
        coverDecision({ id: "c0", linkedId: "k-gap-0" }),
        coverDecision({ id: "c1", linkedId: "k-gap-1" }),
      ],
    });
    expect(actions.some((a) => a.id === "spof-k-gap-2")).toBe(true);
    expect(actions.filter((a) => a.id.startsWith("commit-")).map((a) => a.id)).toEqual([
      "commit-c0",
      "commit-c1",
    ]);
  });

  it("does not treat a monitor-only Journal entry on the item as training in progress", () => {
    const actions = build([
      coverDecision({ kind: "monitor", linkedStep: undefined, linkedPersonId: undefined }),
    ]);
    expect(actions.some((a) => a.id === `spof-${item.id}`)).toBe(true);
    expect(actions.some((a) => a.id.startsWith("commit-"))).toBe(false);
  });

  it("recommends the step again once the decision is closed", () => {
    const actions = build([coverDecision({ status: "closed" })]);
    expect(actions.some((a) => a.id === `spof-${item.id}`)).toBe(true);
    expect(actions.some((a) => a.id.startsWith("commit-"))).toBe(false);
  });

  it("ignores decisions from another industry, unlinked entries and other steps", () => {
    const actions = build([
      coverDecision({ id: "retail", linkedIndustry: "retail" }),
      coverDecision({ id: "unlinked", linkedTab: undefined, linkedId: undefined }),
      coverDecision({ id: "doc", linkedStep: "document" }),
    ]);
    expect(actions.some((a) => a.id === `spof-${item.id}`)).toBe(true);
    expect(actions.some((a) => a.id.startsWith("commit-"))).toBe(false);
  });

  it("treats write-it-down and record-the-location as separate commitments", () => {
    const undocumented = resolveTemplate({
      industry: "dental",
      customKnowledge: [{ ...item, documented: false, procedureLocation: undefined }],
      customRelations: [{ personId: holder.id, knowledgeId: item.id, level: "expert" }],
    });
    const run = (decisions: DecisionEntry[]) =>
      buildWeeklyActions({
        tpl: undocumented,
        staff,
        dualRelease: defaultDualReleasePolicy(undocumented),
        today: "2025-06-01",
        decisions,
      });
    const fresh = run([]);
    expect(fresh).toContainEqual(expect.objectContaining({ id: `docs-${item.id}`, priority: 84 }));

    const located = run([coverDecision({ id: "d-locate", linkedStep: "locate" })]);
    expect(located.some((a) => a.id === `docs-${item.id}`)).toBe(true);
    expect(located.some((a) => a.id === "commit-d-locate")).toBe(false);

    const documented = run([
      coverDecision({
        id: "d-doc",
        subject: `Write down ${item.name}`,
        linkedStep: "document",
        linkedPersonId: undefined,
      }),
    ]);
    expect(documented.some((a) => a.id === `docs-${item.id}`)).toBe(false);
    expect(documented).toContainEqual(
      expect.objectContaining({
        id: "commit-d-doc",
        title: `Review overdue: is ${item.name} written down yet?`,
        tab: "journal",
        priority: 84,
      }),
    );
    expect(documented.find((a) => a.id === "commit-d-doc")?.why).toContain(
      "the register still says nothing written down",
    );
  });
});
