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

  it("judges freshness against the owner's calendar day, not the server clock", () => {
    const ownerToday = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const profile = pioneerProfileFrom({
      industry: "dental",
      customKnowledge: dental.knowledge.map((item) => ({ ...item, confirmedAt: ownerToday })),
      customRelations: dental.relations,
    });

    const serverDay = executeTool("get_knowledge_spofs", {}, { profile });
    const ownerDay = executeTool("get_knowledge_spofs", {}, { profile, today: ownerToday });

    expect((serverDay.data as { stale: boolean }[]).some((row) => row.stale)).toBe(true);
    expect((ownerDay.data as { stale: boolean }[]).every((row) => !row.stale)).toBe(true);
    expect(ownerDay.summary).not.toContain("not confirmed");
  });
});

describe("get_register_checkins", () => {
  it("is inert until the owner enters their own register", () => {
    const result = executeTool(
      "get_register_checkins",
      {},
      { profile: pioneerProfileFrom({ industry: "dental" }) },
    );
    expect(result.data).toEqual({ checkIns: [], unheld: [], tracked: false });
  });

  it("groups stale entries by the person to sit down with, and lists unheld ones", () => {
    const [held, orphan] = dental.knowledge;
    const holder = dental.people.find((p) => p.active)!;
    const result = executeTool(
      "get_register_checkins",
      {},
      {
        profile: pioneerProfileFrom({
          industry: "dental",
          customKnowledge: [
            { ...held, confirmedAt: undefined },
            { ...orphan, confirmedAt: undefined },
          ],
          customRelations: [{ personId: holder.id, knowledgeId: held.id, level: "expert" }],
        }),
        today: "2026-01-01",
      },
    );
    const data = result.data as {
      tracked: boolean;
      checkIns: { person: { name: string }; soleCount: number; items: { name: string }[] }[];
      unheld: { name: string }[];
    };
    expect(data.tracked).toBe(true);
    expect(data.checkIns).toHaveLength(1);
    expect(data.checkIns[0].person.name).toBe(holder.name);
    expect(data.checkIns[0].items.map((i) => i.name)).toEqual([held.name]);
    expect(data.checkIns[0].soleCount).toBe(1);
    expect(data.unheld.map((i) => i.name)).toEqual([orphan.name]);
    expect(result.summary).toContain(`check in with ${holder.name} (1, 1 sole)`);
    expect(result.summary).toContain("1 stale entry nobody active holds");
  });
});
