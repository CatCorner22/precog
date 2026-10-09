import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CheckInCard } from "@/components/precog/continuity/planner-register-panels";
import type { CheckIn } from "@/components/precog/continuity/use-continuity-planner";
import { UNHELD_VIEW } from "@/lib/precog/continuity/planner-copy";
import { checkInPlan } from "@/lib/precog/continuity/staleness";
import type { IndustryTemplate } from "@/lib/precog/templates";
import { continuityTemplate, knowledgeItem } from "@/test/fixtures";

const practice = vi.hoisted(() => ({ template: undefined as unknown }));

vi.mock("@/lib/precog/practice-context", () => ({
  usePractice: vi.fn(),
  useTemplate: () => practice.template,
}));

function renderUnheld(tpl: IndustryTemplate) {
  practice.template = tpl;
  const plan = checkInPlan(tpl, "2026-10-08");
  const checkIn = {
    staleCount: plan.unheld.length,
    staleIds: new Set(plan.unheld.map((entry) => entry.item.id)),
    plan,
    view: UNHELD_VIEW,
    active: undefined,
    setChoice: vi.fn(),
    drops: [],
    setLevel: vi.fn(),
    confirmItems: vi.fn(),
    clearBaseline: vi.fn(),
  } satisfies CheckIn;

  return renderToStaticMarkup(<CheckInCard checkIn={checkIn} trackFreshness />);
}

describe("CheckInCard unheld items", () => {
  it("marks unrecorded rows neutrally and explains that nobody is marked yet", () => {
    const tpl = continuityTemplate({
      people: [{ id: "active", name: "Ana Ruiz", role: "Owner", active: true }],
      knowledge: [knowledgeItem("unmarked"), knowledgeItem("marked")],
      relations: [{ personId: "active", knowledgeId: "marked", level: "expert" }],
    });
    const html = renderUnheld(tpl);

    expect(html).toContain("Not marked yet");
    expect(html).toContain(
      "Nobody on the active team is marked on these yet. Confirm they still matter, or mark who can run them in the grid.",
    );
  });

  it("keeps the uncovered status for an item marked only on a former person", () => {
    const tpl = continuityTemplate({
      people: [
        { id: "active", name: "Ana Ruiz", role: "Owner", active: true },
        { id: "former", name: "Casey Front", role: "Former", active: false },
      ],
      knowledge: [knowledgeItem("former-held")],
      relations: [{ personId: "former", knowledgeId: "former-held", level: "expert" }],
    });
    const html = renderUnheld(tpl);

    expect(html).toContain("Nobody can do this alone");
    expect(html).toContain("bg-danger/10");
    expect(html).toContain(
      "Nobody on the active team holds these, so there is no one to ask. Confirm they still matter, or assign someone in the grid.",
    );
  });
});
