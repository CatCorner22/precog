import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { pioneerProfileFrom } from "../coach/pioneer-profile";
import { runLocalAgentLoop } from "./agent-loop";

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
