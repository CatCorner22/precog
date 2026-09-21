import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { executeTool } from "./tools";
import { pioneerProfileFrom } from "../coach/pioneer-profile";
import type { PracticeProfile } from "../practice-profile";

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

describe("get_knowledge_spofs journal commitments", () => {
  const item = dental.knowledge[0];
  const [holder, trainee] = dental.people;
  const profileWith = (decisions: PracticeProfile["decisions"]) =>
    pioneerProfileFrom({
      industry: "dental",
      customKnowledge: [{ ...item, criticality: "critical" }],
      customRelations: [{ personId: holder.id, knowledgeId: item.id, level: "expert" }],
      decisions,
    });
  const commitment = {
    id: "c-1",
    createdAt: "2025-03-01T09:00:00.000Z",
    subject: `Train ${trainee.name} on ${item.name}`,
    kind: "remediate" as const,
    note: "",
    reviewBy: "2025-05-01",
    linkedTab: "knowledge",
    linkedId: item.id,
    linkedIndustry: "dental" as const,
    linkedStep: "cover" as const,
    linkedPersonId: trainee.id,
    status: "open" as const,
  };
  type Row = {
    knowledgeId: string;
    committed: {
      trainee: { name: string } | null;
      reviewBy: string | null;
      overdue: boolean;
    } | null;
    documentationCommitted: { step: string } | null;
  };

  it("carries an open cross-training decision on the row it belongs to", () => {
    const result = executeTool(
      "get_knowledge_spofs",
      {},
      { profile: profileWith([commitment]), today: "2025-04-01" },
    );
    const row = (result.data as Row[]).find((r) => r.knowledgeId === item.id);
    expect(row?.committed).toEqual({
      subject: commitment.subject,
      trainee: { id: trainee.id, name: trainee.name },
      loggedOn: "2025-03-01",
      reviewBy: "2025-05-01",
      overdue: false,
    });
    expect(row?.documentationCommitted).toBeNull();
    expect(result.summary).toContain("1 already being cross-trained per the Journal");
    expect(result.summary).not.toContain("past review date");
  });

  it("flags the commitment as past its review date on the owner's day", () => {
    const result = executeTool(
      "get_knowledge_spofs",
      {},
      { profile: profileWith([commitment]), today: "2025-05-02" },
    );
    const row = (result.data as Row[]).find((r) => r.knowledgeId === item.id);
    expect(row?.committed?.overdue).toBe(true);
    expect(result.summary).toContain("(1 past review date)");
  });

  it("reports nothing committed for closed decisions or other steps", () => {
    const result = executeTool(
      "get_knowledge_spofs",
      {},
      {
        profile: profileWith([
          { ...commitment, status: "closed" },
          { ...commitment, id: "doc", linkedStep: "document" },
        ]),
        today: "2025-04-01",
      },
    );
    const row = (result.data as Row[]).find((r) => r.knowledgeId === item.id);
    expect(row?.committed).toBeNull();
    expect(row?.documentationCommitted).toMatchObject({ step: "document" });
    expect(result.summary).not.toContain("per the Journal");
  });
});

describe("get_planned_absences", () => {
  const item = dental.knowledge[0];
  const [holder, backup] = dental.people;
  type Leave = {
    windows: {
      person: { id: string };
      daysUntil: number;
      status: string;
      handoffBy: string;
      overlaps: { person: { name: string } }[];
      stops: { knowledgeId: string; standIn: { id: string } | null; handoffCommitted: unknown }[];
      remaining: { id: string }[];
      summary: string;
    }[];
    later: number;
    unmatched: number;
  };
  const profileWith = (extra: Partial<Parameters<typeof pioneerProfileFrom>[0]>) =>
    pioneerProfileFrom({
      industry: "dental",
      customKnowledge: [{ ...item, criticality: "critical" }],
      customRelations: [
        { personId: holder.id, knowledgeId: item.id, level: "expert" },
        { personId: backup.id, knowledgeId: item.id, level: "basic" },
      ],
      plannedAbsences: [
        {
          id: "abs-1",
          personId: holder.id,
          industry: "dental",
          from: "2025-04-13",
          to: "2025-04-20",
        },
        {
          id: "abs-2",
          personId: backup.id,
          industry: "dental",
          from: "2025-04-19",
          to: "2025-04-21",
        },
        {
          id: "abs-far",
          personId: holder.id,
          industry: "dental",
          from: "2025-07-01",
          to: "2025-07-05",
        },
        {
          id: "abs-old",
          personId: "nobody",
          industry: "dental",
          from: "2025-04-13",
          to: "2025-04-14",
        },
      ],
      ...extra,
    });

  it("returns leave within 30 days with stops, stand-ins, overlaps and who is left", () => {
    const result = executeTool(
      "get_planned_absences",
      {},
      { profile: profileWith({}), today: "2025-04-01" },
    );
    const data = result.data as Leave;
    expect(data.windows.map((w) => w.person.id)).toEqual([holder.id, backup.id]);
    expect(data.later).toBe(1);
    expect(data.unmatched).toBe(1);
    const [first] = data.windows;
    expect(first).toMatchObject({ daysUntil: 12, status: "upcoming", handoffBy: "2025-04-12" });
    expect(first.overlaps[0].person.name).toBe(backup.name);
    expect(first.stops).toEqual([
      expect.objectContaining({ knowledgeId: item.id, handoffCommitted: null }),
    ]);
    expect([holder.id, backup.id]).not.toContain(first.stops[0].standIn?.id);
    expect(first.remaining.map((p) => p.id)).not.toContain(holder.id);
    expect(first.remaining.map((p) => p.id)).not.toContain(backup.id);
    expect(first.summary).toContain("in 12 days");
    expect(result.summary).toContain(`${holder.name.split(" ")[0]} is out 13–20 Apr`);
  });

  it("marks a hand-off already logged in the Journal", () => {
    const result = executeTool(
      "get_planned_absences",
      {},
      {
        profile: profileWith({
          decisions: [
            {
              id: "h-1",
              createdAt: "2025-04-01T09:00:00.000Z",
              subject: item.name,
              kind: "remediate",
              note: "",
              reviewBy: "2025-04-12",
              linkedTab: "knowledge",
              linkedId: item.id,
              linkedIndustry: "dental",
              linkedStep: "handoff",
              status: "open",
            },
          ],
        }),
        today: "2025-04-01",
      },
    );
    const data = result.data as Leave;
    expect(data.windows[0].stops[0].handoffCommitted).toMatchObject({
      reviewBy: "2025-04-12",
      overdue: false,
    });
  });

  it("reports no leave when the register has none", () => {
    const result = executeTool(
      "get_planned_absences",
      {},
      { profile: profileWith({ plannedAbsences: [] }), today: "2025-04-01" },
    );
    expect(result.summary).toBe("No planned leave on the register");
    expect((result.data as Leave).windows).toEqual([]);
  });
});
