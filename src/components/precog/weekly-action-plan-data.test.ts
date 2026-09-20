import { describe, expect, it } from "vitest";
import { defaultDualReleasePolicy } from "@/lib/precog/controls/dual-release";
import { getBaseTemplate, resolveTemplate } from "@/lib/precog/active-template";
import { buildWeeklyActions } from "./weekly-action-plan-data";

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
});
