import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { IntelligencePanel } from "./intelligence-panel";
import { MonthlyArea } from "./monthly-area";
import { ScoresArea } from "./scores-area";

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={defaultProfile()}>{node}</ReadOnlyPracticeProvider>,
  );
}

describe("Patterns view", () => {
  it("offers the signals, order of fixes and what Precog can see, and no Johari or CSV screen", () => {
    const html = render(<IntelligencePanel />);
    expect(html).toContain("Signals + guidance");
    expect(html).toContain("Order of fixes");
    expect(html).toContain("What Precog can see");
    expect(html).not.toMatch(/Johari/i);
    expect(html).not.toContain("Number patterns");
    expect(html).not.toContain("Forensic screen");
  });
});

describe("Monthly review", () => {
  it("leads with this month's checks and keeps the record closed", () => {
    const html = render(<MonthlyArea item={null} openTab={() => {}} />);
    expect(html).toContain('<h1 class="text-lg font-semibold">Monthly review</h1>');
    expect(html).toContain('id="checks"');
    expect(html).toContain('id="evidence"');
    expect(html).toContain('id="decisions"');
    expect(html).not.toContain('id="number-patterns"');
    expect(html).not.toMatch(/<details[^>]*id="evidence"[^>]* open/);
  });

  it("puts number patterns under How Precog scores", () => {
    const html = render(<ScoresArea view="csv" openTab={() => {}} onNavigate={() => {}} />);
    expect(html).toContain('id="number-patterns"');
    expect(html).toMatch(/<h2 id="number-patterns-heading"[^>]*>Number patterns in a CSV<\/h2>/);
  });
});
