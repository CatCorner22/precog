import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { firstName } from "../continuity/coverage";
import { executeTool, planTools } from "./tools";
import { resolveTemplate } from "../active-template";
import { defaultProfile } from "../practice-profile";
import { pioneerProfileFrom } from "../coach/pioneer-profile";
import { buildOwnTeam, ownBusinessProfile } from "../onboarding/own-team";
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
      unplanned: boolean;
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
    debriefs: {
      absenceId: string;
      person: { id: string };
      unplanned: boolean;
      lengthDays: number;
      daysSince: number;
      items: {
        knowledgeId: string;
        standIn: { id: string } | null;
        standInLevel: string | null;
        canPromote: boolean;
        handoffOpen: boolean;
        trainingLogged: boolean;
        question: string;
      }[];
      summary: string;
    }[];
    leavers: {
      person: { id: string };
      lastDay: string;
      daysLeft: number;
      status: string;
      handoverBy: string;
      handover: {
        knowledgeId: string;
        successor: { id: string } | null;
        successorLevel: string | null;
        documented: boolean;
        procedureLocation: string | null;
        trainingLogged: { reviewBy: string | null } | null;
      }[];
      orphanedProcesses: string[];
      remaining: { id: string }[];
      unlogged: number;
      summary: string;
    }[];
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
    expect(first).toMatchObject({
      unplanned: false,
      daysUntil: 12,
      status: "upcoming",
      handoffBy: "2025-04-12",
    });
    expect(first.overlaps[0].person.name).toBe(backup.name);
    expect(first.stops).toEqual([
      expect.objectContaining({ knowledgeId: item.id, handoffCommitted: null }),
    ]);
    expect([holder.id, backup.id]).not.toContain(first.stops[0].standIn?.id);
    expect(first.remaining.map((p) => p.id)).not.toContain(holder.id);
    expect(first.remaining.map((p) => p.id)).not.toContain(backup.id);
    expect(first.summary).toContain("in 12 days");
    expect(result.summary).toContain(`${firstName(holder.name)} is out 13–20 Apr`);
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
    expect(result.summary).toBe("Nobody on the register is out or has leave booked");
    expect((result.data as Leave).windows).toEqual([]);
    expect((result.data as Leave).debriefs).toEqual([]);
  });

  it("flags an absence recorded on the day as unplanned and words it as unexpected", () => {
    const result = executeTool(
      "get_planned_absences",
      {},
      {
        profile: profileWith({
          plannedAbsences: [
            {
              id: "sick",
              personId: holder.id,
              industry: "dental",
              from: "2025-04-01",
              to: "2025-04-01",
              unplanned: true,
            },
          ],
        }),
        today: "2025-04-01",
      },
    );
    const [w] = (result.data as Leave).windows;
    expect(w).toMatchObject({ unplanned: true, status: "current", daysUntil: 0 });
    expect(result.summary).toContain(
      `${firstName(holder.name)} is out unexpectedly 1 Apr, out now`,
    );
  });

  it("lists leave that just ended as a debrief with the stand-in to promote", () => {
    const result = executeTool(
      "get_planned_absences",
      {},
      { profile: profileWith({}), today: "2025-04-22" },
    );
    const data = result.data as Leave;
    expect(data.debriefs.map((d) => d.absenceId)).toEqual(["abs-1"]);
    const [d] = data.debriefs;
    expect(d).toMatchObject({ person: { id: holder.id }, lengthDays: 8, daysSince: 2 });
    expect(d.items).toEqual([
      expect.objectContaining({
        knowledgeId: item.id,
        standIn: { id: backup.id, name: backup.name },
        standInLevel: "basic",
        canPromote: true,
        handoffOpen: false,
        trainingLogged: false,
      }),
    ]);
    expect(d.items[0].question).toContain("can they run it alone now?");
    expect(result.summary).toContain(`Debrief due: ${firstName(holder.name)}'s back`);
  });

  it("drops a debrief the owner has already answered", () => {
    const profile = profileWith({});
    const result = executeTool(
      "get_planned_absences",
      {},
      {
        profile: {
          ...profile,
          plannedAbsences: (profile.plannedAbsences ?? []).map((a) =>
            a.id === "abs-1" ? { ...a, debriefedAt: "2025-04-21" } : a,
          ),
        },
        today: "2025-04-22",
      },
    );
    expect((result.data as Leave).debriefs).toEqual([]);
    expect(result.summary).not.toContain("Debrief due");
  });

  it("exposes who has given notice with the hand-over they owe before their last day", () => {
    const result = executeTool(
      "get_planned_absences",
      {},
      {
        profile: profileWith({
          plannedAbsences: [],
          customPeople: dental.people.map((p) =>
            p.id === holder.id ? { ...p, lastDay: "2025-04-30" } : p,
          ),
          decisions: [
            {
              id: "t-1",
              createdAt: "2025-04-01T09:00:00.000Z",
              subject: item.name,
              kind: "remediate",
              note: "",
              reviewBy: "2025-04-25",
              linkedTab: "knowledge",
              linkedId: item.id,
              linkedIndustry: "dental",
              linkedStep: "cover",
              linkedPersonId: backup.id,
              status: "open",
            },
          ],
        }),
        today: "2025-04-01",
      },
    );
    const data = result.data as Leave;
    expect(data.windows).toEqual([]);
    expect(data.leavers).toHaveLength(1);
    const [l] = data.leavers;
    expect(l).toMatchObject({
      person: { id: holder.id },
      lastDay: "2025-04-30",
      daysLeft: 29,
      status: "notice",
      handoverBy: "2025-04-30",
      unlogged: 0,
    });
    expect(l.handover).toEqual([
      expect.objectContaining({
        knowledgeId: item.id,
        successor: { id: backup.id, name: backup.name },
        successorLevel: "basic",
        documented: Boolean(item.documented),
        trainingLogged: { subject: item.name, reviewBy: "2025-04-25" },
      }),
    ]);
    expect(l.remaining.map((p) => p.id)).not.toContain(holder.id);
    expect(result.summary).toContain(`Leaving: ${firstName(holder.name)} leaves in 29 days`);
  });

  it("flags someone past their last day who still counts as cover, and drops them once marked left", () => {
    const gone = executeTool(
      "get_planned_absences",
      {},
      {
        profile: profileWith({
          plannedAbsences: [],
          customPeople: dental.people.map((p) =>
            p.id === holder.id ? { ...p, lastDay: "2025-04-10" } : p,
          ),
        }),
        today: "2025-04-14",
      },
    );
    const [l] = (gone.data as Leave).leavers;
    expect(l).toMatchObject({ status: "gone", daysLeft: -4, handoverBy: "2025-04-14" });
    expect(l.summary).toContain(`mark ${firstName(holder.name)} as left`);

    const left = executeTool(
      "get_planned_absences",
      {},
      {
        profile: profileWith({
          plannedAbsences: [],
          customPeople: dental.people.map((p) =>
            p.id === holder.id ? { ...p, lastDay: "2025-04-10", active: false } : p,
          ),
        }),
        today: "2025-04-14",
      },
    );
    expect((left.data as Leave).leavers).toEqual([]);
    expect(left.summary).not.toContain("Leaving:");
  });
});

describe("get_process_records", () => {
  it("ranks undocumented processes first and reports the documented index", () => {
    const profile = defaultProfile();
    const base = resolveTemplate(profile).processes;
    profile.customProcesses = base.map((p, i) =>
      i === 0
        ? { ...p, cadence: "daily", documented: true, procedureLocation: "Drive > SOPs" }
        : i === 1
          ? { ...p, cadence: "annual", documented: true }
          : { ...p, cadence: "daily" },
    );
    const r = executeTool("get_process_records", {}, { profile });
    expect(r.ok).toBe(true);
    const data = r.data as {
      documentedIndex: number;
      counts: { none: number; unlocated: number; located: number };
      gaps: { name: string; state: string; stopsWithinDays: number }[];
    };
    expect(data.counts.located).toBe(1);
    expect(data.counts.unlocated).toBe(1);
    expect(data.counts.none).toBe(base.length - 2);
    expect(data.documentedIndex).toBe(Math.round((1 / base.length) * 100));
    // Nothing-written daily processes come before the written-but-unlocated annual one.
    expect(data.gaps.at(-1)!.state).toBe("unlocated");
    expect(data.gaps[0].state).toBe("none");
    expect(data.gaps[0].stopsWithinDays).toBe(1);
    expect(r.summary).toMatch(/written, findable procedure/);
  });

  it("is planned for questions about what is written down or what stops", () => {
    expect(planTools("what should we write down first?")).toContain("get_process_records");
    expect(planTools("which processes stop if Maya is out sick")).toContain("get_process_records");
    expect(planTools("insurance premium")).not.toContain("get_process_records");
  });
});

describe("get_process_records on a map that is not assessed", () => {
  it("carries assessed: false and tells the coach not to quote map figures for a starter map", () => {
    const profile = ownBusinessProfile(defaultProfile(), {
      practiceName: "Ruiz Dental",
      people: buildOwnTeam([
        { name: "Ana Ruiz", role: "Owner", duties: ["bank_reconcile"] },
        { name: "Ben Ochoa", role: "Office Manager", duties: ["post_payments"] },
      ]),
    });
    const r = executeTool("get_process_records", {}, { profile });
    expect(r.ok).toBe(true);
    const data = r.data as { assessed: boolean; processes: { name: string; owners: string[] }[] };
    expect(data.assessed).toBe(false);
    expect(data.processes).toHaveLength(7);
    expect(data.processes.every((p) => p.owners.length === 0)).toBe(true);
    expect(r.summary).toBe(
      "The process map is not assessed: it holds 7 starter processes from the dental / medical office example with no owner assigned. Do not quote map figures; advise the owner to assign an owner to each process on How work flows, or to build their own map.",
    );
    expect(JSON.stringify(r.data)).not.toContain("documentedIndex");
  });

  it("says the map is empty for an own map with no processes", () => {
    const profile = ownBusinessProfile(defaultProfile(), {
      practiceName: "Ruiz Dental",
      people: buildOwnTeam([{ name: "Ana Ruiz", role: "Owner", duties: ["bank_reconcile"] }]),
    });
    const r = executeTool(
      "get_process_records",
      {},
      { profile: { ...profile, customProcesses: [] } },
    );
    expect(r.summary).toMatch(/^The process map is not assessed: it is empty/);
  });

  it("reports the sample business's records as before", () => {
    const r = executeTool("get_process_records", {}, { profile: defaultProfile() });
    expect((r.data as { assessed?: boolean }).assessed).toBeUndefined();
    expect(r.summary).toMatch(/written, findable procedure/);
  });
});
