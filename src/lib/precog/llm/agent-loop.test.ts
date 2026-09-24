import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { pioneerProfileFrom } from "../coach/pioneer-profile";
import { runLocalAgentLoop } from "./agent-loop";
import { runSpecialistAgents } from "./multi-agent";
import { resolveTemplate } from "../active-template";
import { buildOwnTeam, ownBusinessProfile } from "../onboarding/own-team";
import { defaultProfile } from "../practice-profile";

const dental = getBaseTemplate("dental");

describe("local brief register freshness advice", () => {
  const [held, orphan] = dental.knowledge;
  const holder = dental.people.find((p) => p.active)!;

  it("advises both the person check-in and the unheld entries when a register has both", () => {
    const { brief } = runLocalAgentLoop("continuity", {
      profile: pioneerProfileFrom({
        industry: "dental",
        customKnowledge: [
          { ...held, confirmedAt: undefined },
          { ...orphan, confirmedAt: undefined },
        ],
        customRelations: [{ personId: holder.id, knowledgeId: held.id, level: "expert" }],
      }),
      today: "2026-01-01",
    });
    const actions = brief.decisions.map((d) => d.action);

    expect(actions).toContain(`Check in with ${holder.name}: 1 register entry to re-confirm`);
    expect(actions).toContain(`Re-confirm the register entry for ${orphan.name}`);
  });

  it("gives no freshness advice while the demo register is in use", () => {
    const { brief } = runLocalAgentLoop("continuity", {
      profile: pioneerProfileFrom({ industry: "dental" }),
    });
    expect(brief.decisions.some((d) => /re-confirm/i.test(d.action))).toBe(false);
  });
});

describe("local brief journal awareness", () => {
  const item = dental.knowledge[0];
  const [holder, trainee] = dental.people;
  const profileWith = (decisions: Parameters<typeof pioneerProfileFrom>[0]["decisions"]) =>
    pioneerProfileFrom({
      industry: "dental",
      customKnowledge: [{ ...item, criticality: "critical", confirmedAt: "2025-03-20" }],
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

  it("recommends cross-training when nothing is logged", () => {
    const { brief } = runLocalAgentLoop("continuity", {
      profile: profileWith([]),
      today: "2025-04-01",
    });
    const actions = brief.decisions.map((d) => d.action);
    expect(actions.some((a) => a.startsWith(`Cross-train `) && a.includes(item.name))).toBe(true);
    expect(actions.some((a) => a.startsWith("In progress"))).toBe(false);
  });

  it("reports the logged step as in progress instead of recommending it again", () => {
    const { brief } = runLocalAgentLoop("continuity", {
      profile: profileWith([commitment]),
      today: "2025-04-01",
    });
    const actions = brief.decisions.map((d) => d.action);
    expect(actions).toContain(`In progress: ${trainee.name} on ${item.name} — review 2025-05-01`);
    expect(actions.some((a) => a.startsWith("Cross-train"))).toBe(false);
    const d = brief.decisions.find((x) => x.action.startsWith("In progress"));
    expect(d?.rationale).toContain(`You already logged "${commitment.subject}"`);
    expect(d?.horizonDays).toBe(7);
  });

  it("asks whether it happened once the review date has passed", () => {
    const { brief } = runLocalAgentLoop("continuity", {
      profile: profileWith([commitment]),
      today: "2025-05-02",
    });
    const actions = brief.decisions.map((d) => d.action);
    expect(actions).toContain(`Review overdue: can ${trainee.name} run ${item.name} alone yet?`);
    expect(actions.some((a) => a.startsWith("Cross-train"))).toBe(false);
  });

  it("recommends the step again once the decision is closed", () => {
    const { brief } = runLocalAgentLoop("continuity", {
      profile: profileWith([{ ...commitment, status: "closed" }]),
      today: "2025-04-01",
    });
    const actions = brief.decisions.map((d) => d.action);
    expect(actions.some((a) => a.startsWith("Cross-train") && a.includes(item.name))).toBe(true);
    expect(actions.some((a) => /In progress|Review overdue/.test(a))).toBe(false);
  });
});

describe("local brief leavers", () => {
  const item = dental.knowledge[0];
  const [holder, successor] = dental.people;
  const profileWith = (
    lastDay: string,
    extra: Partial<Parameters<typeof pioneerProfileFrom>[0]> = {},
  ) =>
    pioneerProfileFrom({
      industry: "dental",
      customPeople: dental.people.map((p) => (p.id === holder.id ? { ...p, lastDay } : p)),
      customKnowledge: [
        { ...item, criticality: "critical", documented: false, confirmedAt: "2025-03-20" },
      ],
      customRelations: [
        { personId: holder.id, knowledgeId: item.id, level: "expert" },
        { personId: successor.id, knowledgeId: item.id, level: "basic" },
      ],
      ...extra,
    });

  it("makes the hand-over the decision, due by the last day, and warns about it", () => {
    const { brief } = runLocalAgentLoop("continuity", {
      profile: profileWith("2025-04-20"),
      today: "2025-04-01",
    });
    const d = brief.decisions.find((x) => x.action.startsWith("Train "));
    expect(d?.action).toBe(
      `Train ${successor.name} on ${item.name} before ${holder.name} leaves (by 2025-04-20)`,
    );
    expect(d?.rationale).toContain(`Have ${holder.name} write down ${item.name}`);
    expect(d?.horizonDays).toBeLessThanOrEqual(19);
    expect(brief.decisions.some((x) => x.action.startsWith("Cross-train"))).toBe(false);
    expect(brief.chickenLittleWarnings.some((w) => w.includes("leaves in 19 days"))).toBe(true);
  });

  it("asks to mark them as left once the last day has passed", () => {
    const { brief } = runLocalAgentLoop("continuity", {
      profile: profileWith("2025-04-20"),
      today: "2025-04-25",
    });
    const d = brief.decisions.find((x) => x.action.startsWith("Mark "));
    expect(d?.action).toBe(`Mark ${holder.name} as left on the register`);
    expect(d?.rationale).toContain("keeps the record in the history");
    expect(d?.horizonDays).toBe(1);
  });

  it("says nothing about a leaver already marked as left", () => {
    const { brief } = runLocalAgentLoop("continuity", {
      profile: profileWith("2025-04-20", {
        customPeople: dental.people.map((p) =>
          p.id === holder.id ? { ...p, lastDay: "2025-04-20", active: false } : p,
        ),
      }),
      today: "2025-04-25",
    });
    expect(brief.decisions.some((x) => /leaves|as left/.test(x.action))).toBe(false);
    expect(brief.chickenLittleWarnings.some((w) => /left \d+ days ago/.test(w))).toBe(false);
  });
});

describe("local brief before the register is assessed", () => {
  const industries = [
    "dental",
    "restaurant",
    "retail",
    "professional_services",
    "general",
  ] as const;

  it.each(industries)(
    "answers for a new %s business whose starter register has nobody marked",
    (industry) => {
      const people = buildOwnTeam([
        { name: "Pat Owner", role: "Owner", duties: ["sign_checks", "bank_reconcile"] },
        { name: "Lee Front", role: "Front desk", duties: ["collect_cash", "post_payments"] },
      ]);
      const profile = ownBusinessProfile(defaultProfile(industry), {
        practiceName: "Test business",
        people,
      });
      const { brief } = runLocalAgentLoop("Who could we not run without for a week?", {
        profile,
        today: "2026-01-01",
      });
      const actions = brief.decisions.map((d) => d.action);
      const knowledge = resolveTemplate(profile).knowledge.length;

      expect(actions).toContain(
        knowledge === 0
          ? "List the duties, tasks and know-how the business runs on"
          : `Mark who can do each of the ${knowledge} things the business runs on`,
      );
      expect(actions.some((a) => /cross-train/i.test(a))).toBe(false);
      expect(actions.some((a) => /re-confirm/i.test(a))).toBe(false);
    },
  );

  it("still recommends cross-training once someone is marked on the register", () => {
    const item = dental.knowledge[0];
    const holder = dental.people.find((p) => p.active)!;
    const { brief } = runLocalAgentLoop("continuity", {
      profile: pioneerProfileFrom({
        industry: "dental",
        customKnowledge: [item],
        customRelations: [{ personId: holder.id, knowledgeId: item.id, level: "expert" }],
      }),
      today: "2026-01-01",
    });
    const actions = brief.decisions.map((d) => d.action);
    expect(actions.some((a) => /cross-train/i.test(a))).toBe(true);
    expect(actions.some((a) => /^Mark who can do/.test(a))).toBe(false);
  });
});

describe("specialist notes before the register is assessed", () => {
  it("says continuity is not assessed instead of 'No critical SPOFs flagged'", () => {
    const notes = runSpecialistAgents([
      {
        tool: "get_knowledge_spofs",
        ok: true,
        summary: "",
        data: { assessed: false, items: [{ knowledgeId: "k1", name: "Payroll" }] },
      },
    ]);
    const bullets = notes.flatMap((n) => n.bullets).join("\n");
    expect(bullets).toMatch(/not assessed yet/);
    expect(bullets).not.toMatch(/No critical SPOFs flagged/);
  });
});
