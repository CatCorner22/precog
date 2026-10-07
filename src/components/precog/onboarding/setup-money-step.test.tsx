import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UNANSWERED } from "@/lib/precog/onboarding/setup-answers";
import { SetupMoneyStep } from "./setup-money-step";

function render(answers = UNANSWERED, industry: "general" | "nonprofit" = "general") {
  return renderToStaticMarkup(
    <SetupMoneyStep
      answers={answers}
      onChange={vi.fn()}
      industry={industry}
      onNext={vi.fn()}
      onBack={vi.fn()}
    />,
  );
}

describe("setup money step", () => {
  it("starts every answer on Not sure with named radio groups", () => {
    const html = render();
    expect(html).toContain("How money moves");
    expect(html).toContain("What already runs");
    expect(html.match(/role="radiogroup"/g)).toHaveLength(11);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(11);
    expect(html.match(/aria-checked="false"/g)?.length).toBeGreaterThan(0);
  });

  it("makes each answer at least 44px tall on a touch screen", () => {
    const radios = render().match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(radios.length).toBeGreaterThan(0);
    for (const tag of radios) expect(tag).toContain("pointer-coarse:min-h-11");
  });

  it("hides the camera question when cash and paper checks are not taken", () => {
    const html = render({ ...UNANSWERED, cashOrChecks: "no" });
    expect(html).not.toContain("Are security cameras in place?");
    expect(html.match(/role="radiogroup"/g)).toHaveLength(10);
  });
});
