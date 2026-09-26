import { describe, expect, it } from "vitest";
import { defaultDualReleasePolicy } from "@/lib/precog/controls/dual-release";
import { getBaseTemplate, resolveTemplate } from "@/lib/precog/active-template";
import { documentationDebt } from "@/lib/precog/continuity/documentation";
import { buildWeeklyActions } from "./build";
import { firstName } from "../text";

const dental = getBaseTemplate("dental");

describe("buildWeeklyActions documentation advice", () => {
  it("adds critical documentation gaps to the action plan", () => {
    const actions = buildWeeklyActions({
      tpl: dental,
      staff: { ...dental.staffComposition, independentBankRec: true, dualControlPayments: true },
      dualRelease: defaultDualReleasePolicy(dental),
    });
    const docs = actions.filter((action) => action.id.startsWith("docs-"));
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].tab).toBe("knowledge");
    expect(docs[0].title).toMatch(/^(Write down |Record where )/);
    const singleGap = documentationDebt(dental).gaps.find(
      (gap) =>
        gap.item.criticality === "critical" &&
        gap.state === "none" &&
        (gap.coverage === "single" || gap.coverage === "uncovered"),
    );
    if (singleGap) {
      expect(actions).toContainEqual(
        expect.objectContaining({
          id: `docs-${singleGap.item.id}`,
          priority: 84,
        }),
      );
    }
  });

  it("does not add documentation actions when every procedure is findable", () => {
    const documented = resolveTemplate({
      industry: "dental",
      customKnowledge: dental.knowledge.map((k) => ({
        ...k,
        documented: true,
        procedureLocation: "Drive/SOPs",
      })),
    });
    const actions = buildWeeklyActions({
      tpl: documented,
      staff: documented.staffComposition,
      dualRelease: defaultDualReleasePolicy(documented),
    });
    expect(actions.some((action) => action.id.startsWith("docs-"))).toBe(false);
  });

  it("turns stale register entries into a check-in with the person who holds most of them", () => {
    const item = {
      ...dental.knowledge[0],
      documented: true,
      procedureLocation: "Drive/SOPs",
    };
    const quiet = resolveTemplate({
      industry: "dental",
      customKnowledge: [item],
      customRelations: [
        { personId: dental.people[0].id, knowledgeId: item.id, level: "proficient" },
        { personId: dental.people[1].id, knowledgeId: item.id, level: "proficient" },
      ],
    });
    const staff = {
      ...quiet.staffComposition,
      independentBankRec: true,
      dualControlPayments: true,
    };
    const actions = buildWeeklyActions({
      tpl: quiet,
      staff,
      dualRelease: defaultDualReleasePolicy(quiet),
      today: "2025-04-01",
      trackFreshness: true,
    });
    const checkIn = actions.find((action) => action.id.startsWith("check-in-"));
    expect(checkIn).toMatchObject({ tab: "knowledge", priority: 60 });
    expect(checkIn?.title).toMatch(/^Check in with \S+: 1 register entry$/);
    expect(checkIn?.why).toContain(item.name);
    expect(checkIn?.why).toContain("1 more person to check in with");
    expect(
      buildWeeklyActions({
        tpl: quiet,
        staff,
        dualRelease: defaultDualReleasePolicy(quiet),
        today: "2025-04-01",
      }).some((action) => action.id.startsWith("check-in-")),
    ).toBe(false);
  });

  it("falls back to a direct re-confirm when nobody active holds the stale entries", () => {
    const item = {
      ...dental.knowledge[0],
      criticality: "nice-to-have" as const,
      documented: true,
      procedureLocation: "Drive/SOPs",
    };
    const orphaned = resolveTemplate({
      industry: "dental",
      customKnowledge: [item],
      customRelations: [],
    });
    const actions = buildWeeklyActions({
      tpl: orphaned,
      staff: {
        ...orphaned.staffComposition,
        independentBankRec: true,
        dualControlPayments: true,
      },
      dualRelease: defaultDualReleasePolicy(orphaned),
      today: "2025-04-01",
      trackFreshness: true,
    });
    expect(actions.some((action) => action.id.startsWith("check-in-"))).toBe(false);
    expect(actions).toContainEqual(
      expect.objectContaining({
        id: "confirm-register",
        title: "Re-confirm 1 register entry nobody holds",
      }),
    );
  });
});

describe("buildWeeklyActions de-duplication", () => {
  it("keeps two actions whose titles share a 40-character prefix", () => {
    const base = { ...dental.knowledge[0], criticality: "critical" as const, documented: false };
    const knowledge = [
      { ...base, id: "kb-submit", name: "Insurance claims and follow-up: submit" },
      { ...base, id: "kb-appeal", name: "Insurance claims and follow-up: appeal" },
    ];
    const [first, second] = dental.people;
    const tpl = resolveTemplate({
      industry: "dental",
      customKnowledge: knowledge,
      customRelations: knowledge.flatMap((k) => [
        { personId: first.id, knowledgeId: k.id, level: "expert" as const },
        { personId: second.id, knowledgeId: k.id, level: "proficient" as const },
      ]),
    });
    const actions = buildWeeklyActions({
      tpl,
      staff: { ...tpl.staffComposition, independentBankRec: true, dualControlPayments: true },
      dualRelease: defaultDualReleasePolicy(tpl),
      mapAssessed: true,
    });
    const docs = actions.filter((action) => action.id.startsWith("docs-")).map((a) => a.id);
    expect(docs.sort()).toEqual(["docs-kb-appeal", "docs-kb-submit"]);
  });
});

describe("buildWeeklyActions cross-training", () => {
  it("asks to finish training a learner on a critical entry one person runs alone", () => {
    const payroll = {
      ...dental.knowledge[0],
      id: "k-payroll",
      name: "Payroll",
      criticality: "critical" as const,
      documented: true,
      procedureLocation: "Drive/SOPs",
    };
    const [expert, learner] = dental.people;
    const tpl = resolveTemplate({
      industry: "dental",
      customKnowledge: [payroll],
      customRelations: [
        { personId: expert.id, knowledgeId: payroll.id, level: "expert" },
        { personId: learner.id, knowledgeId: payroll.id, level: "basic" },
      ],
    });
    const actions = buildWeeklyActions({
      tpl,
      staff: { ...tpl.staffComposition, independentBankRec: true, dualControlPayments: true },
      dualRelease: defaultDualReleasePolicy(tpl),
      mapAssessed: true,
    });
    expect(actions).toContainEqual(
      expect.objectContaining({
        id: "spof-k-payroll",
        title: `Finish training ${firstName(learner.name)} on Payroll`,
        priority: 76,
      }),
    );
  });
});
