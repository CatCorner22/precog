import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { executeTool } from "./tools";
import { pioneerProfileFrom } from "../coach/pioneer-profile";

const dental = getBaseTemplate("dental");

describe("get_knowledge_spofs freshness", () => {
  it("does not flag freshness before a custom register exists", () => {
    const result = executeTool(
      "get_knowledge_spofs",
      {},
      {
        profile: pioneerProfileFrom({ industry: "dental" }),
      },
    );
    const rows = result.data as { stale: boolean }[];

    expect(rows.every((row) => row.stale === false)).toBe(true);
    expect(result.summary).not.toContain("not confirmed");
  });

  it("flags unconfirmed entries in a custom register", () => {
    const result = executeTool(
      "get_knowledge_spofs",
      {},
      {
        profile: pioneerProfileFrom({
          industry: "dental",
          customKnowledge: dental.knowledge.map(({ confirmedAt: _confirmedAt, ...item }) => item),
          customRelations: dental.relations,
        }),
      },
    );
    const rows = result.data as { stale: boolean }[];

    expect(rows.some((row) => row.stale)).toBe(true);
    expect(result.summary).toContain("not confirmed in 90 days");
  });
});
