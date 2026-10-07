import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UNANSWERED, type SetupQuestion } from "@/lib/precog/onboarding/setup-answers";
import { SetupMoneyStep } from "./setup-money-step";

function render(
  answers = UNANSWERED,
  industry: "general" | "nonprofit" = "general",
  answered: SetupQuestion[] = [],
) {
  return renderToStaticMarkup(
    <SetupMoneyStep
      answers={answers}
      answered={answered}
      onChange={vi.fn()}
      industry={industry}
      onNext={vi.fn()}
      onBack={vi.fn()}
    />,
  );
}

describe("setup money step", () => {
  it("starts every question with no answer chosen, counts the answers, and lets Next work", () => {
    const html = render();
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(html).toContain("How money moves");
    expect(html).toContain("What already runs");
    expect(html.match(/role="radiogroup"/g)).toHaveLength(11);
    expect(html).not.toContain('aria-checked="true"');
    expect(text).toContain("0 of 11 answered. A question you leave counts as Not sure.");
    // Each unanswered group still takes the keyboard on its first choice.
    expect(html.match(/role="radio"[^>]*tabindex="0"|tabindex="0"[^>]*role="radio"/g)).toHaveLength(
      11,
    );
    const next = html.match(/<button[^>]*>Next: your team/)?.[0];
    expect(next).toBeDefined();
    expect(next).not.toContain('disabled=""');
  });

  it("shows a chosen Not sure as chosen and counts it", () => {
    const html = render(UNANSWERED, "general", ["payroll", "cameras"]);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(2);
    expect(html).toContain("2 of 11 answered.");
  });

  it("makes each answer at least 44px tall on a touch screen", () => {
    const radios = render().match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(radios.length).toBeGreaterThan(0);
    for (const tag of radios) expect(tag).toContain("pointer-coarse:min-h-11");
  });

  it("hides the camera question when cash and paper checks are not taken", () => {
    const html = render({ ...UNANSWERED, cashOrChecks: "no" }, "general", ["cashOrChecks"]);
    expect(html).not.toContain("Are security cameras in place?");
    expect(html.match(/role="radiogroup"/g)).toHaveLength(10);
    expect(html).toContain("1 of 10 answered.");
  });
});
