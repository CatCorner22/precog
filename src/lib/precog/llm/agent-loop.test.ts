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
