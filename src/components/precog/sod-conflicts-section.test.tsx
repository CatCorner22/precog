import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { libraryRows, procedureFromLibrary } from "@/lib/precog/procedures/library";
import { procedureForConflict } from "@/lib/precog/procedures/rule-procedures";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import { SodPanel } from "./sod-panel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const render = (profile: PracticeProfile) =>
  renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <SodPanel initialView="conflicts" onNavigate={() => {}} />
    </ReadOnlyPracticeProvider>,
  );

describe("a duty-conflict card's written procedure", () => {
  const profile: PracticeProfile = { ...defaultProfile("general"), procedures: [] };
  const tpl = resolveTemplate(profile);
  const conflicts = detectSodConflicts(
    tpl,
    profile.staff,
    sodDetectionOptions(tpl, profile.dualRelease),
  ).conflicts;

  it("names the procedure for the pair on each card", () => {
    expect(conflicts.length).toBeGreaterThan(0);
    const page = render(profile);
    const first = procedureForConflict(conflicts[0].ruleId)!;
    expect(page).toContain(`Written procedure: ${first.title}`);
    expect(page.match(/Written procedure: /g)?.length).toBeGreaterThan(0);
  });

  it("names the business's own procedure once it is started", () => {
    const first = procedureForConflict(conflicts[0].ruleId)!;
    const row = libraryRows(tpl, [], profile.industry).find(
      (r) => r.recommendation.id === first.id,
    )!;
    const started = { ...procedureFromLibrary(row, profile.industry, "2026-10-01"), title: "Ours" };
    expect(render({ ...profile, procedures: [started] })).toContain("Written procedure: Ours");
  });
});
