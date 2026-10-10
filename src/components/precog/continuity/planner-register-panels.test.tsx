import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CheckInCard,
  SelectedKnowledgeCard,
} from "@/components/precog/continuity/planner-register-panels";
import type { CheckIn } from "@/components/precog/continuity/use-continuity-planner";
import { coverageReport } from "@/lib/precog/continuity/coverage";
import { UNHELD_VIEW } from "@/lib/precog/continuity/planner-copy";
import { checkInPlan } from "@/lib/precog/continuity/staleness";
import type { IndustryTemplate } from "@/lib/precog/templates";
import { continuityTemplate, knowledgeItem } from "@/test/fixtures";

const practice = vi.hoisted(() => ({ template: undefined as unknown }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: import("react").ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/lib/precog/practice-context", () => ({
  usePractice: () => ({ profile: { industry: "general", procedures: [] } }),
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
  it("does not surface unmarked entries as stale", () => {
    const tpl = continuityTemplate({
      people: [{ id: "active", name: "Ana Ruiz", role: "Owner", active: true }],
      knowledge: [knowledgeItem("unmarked"), knowledgeItem("marked")],
      relations: [{ personId: "active", knowledgeId: "marked", level: "expert" }],
    });
    const html = renderUnheld(tpl);

    expect(html).not.toContain("Not marked yet");
    expect(html).not.toContain("unmarked");
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

describe("SelectedKnowledgeCard coverage badge", () => {
  it("shows former-only holders as uncovered and untouched items as not marked yet", () => {
    const tpl = continuityTemplate({
      people: [
        { id: "active", name: "Ana Ruiz", role: "Owner", active: true },
        { id: "former", name: "Avery", role: "Former", active: false },
      ],
      knowledge: [knowledgeItem("appeals"), knowledgeItem("untouched")],
      relations: [{ personId: "former", knowledgeId: "appeals", level: "proficient" }],
    });
    practice.template = tpl;
    const report = coverageReport(tpl);
    const renderSelected = (id: string) => {
      const selected = report.items.find((row) => row.item.id === id)!;
      return renderToStaticMarkup(
        <SelectedKnowledgeCard
          register={{
            selected,
            updateItem: vi.fn(),
            confirmItems: vi.fn(),
          }}
          trackFreshness={false}
        />,
      );
    };

    const formerHeld = renderSelected("appeals");
    expect(formerHeld).toContain('id="selected-knowledge"');
    expect(formerHeld).toContain('tabindex="-1"');
    expect(formerHeld).toContain('aria-label="Details for appeals"');
    expect(formerHeld).toContain("Nobody can do this alone");
    expect(formerHeld).not.toContain("Not marked yet");

    const untouched = renderSelected("untouched");
    expect(untouched).toContain("Not marked yet");
    expect(untouched).not.toContain("Nobody can do this alone");
  });
});
