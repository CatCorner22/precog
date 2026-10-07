import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { INDUSTRIES } from "@/lib/precog/industry";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { libraryRows, procedureFromLibrary } from "@/lib/precog/procedures/library";
import { procedureForConflict } from "@/lib/precog/procedures/rule-procedures";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import { buildStartHereModel } from "@/lib/precog/start-here/model";
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

describe("the duty-conflict list under the open count", () => {
  // A team with open pairs, the owner's own pairs (p6) and pairs dual release
  // covers at every amount (p4; dual release is off, so no threshold applies).
  const profile: PracticeProfile = { ...defaultProfile("general"), procedures: [] };
  const tpl = resolveTemplate(profile);
  const detected = detectSodConflicts(
    tpl,
    profile.staff,
    sodDetectionOptions(tpl, profile.dualRelease),
  );
  const report = {
    ...detected,
    conflicts: detected.conflicts.map((c) =>
      c.personId === "p6"
        ? { ...c, ownerHeld: true }
        : c.personId === "p4"
          ? { ...c, dualReleaseMitigated: true }
          : c,
    ),
  };
  const ownerHeld = report.conflicts.filter((c) => c.ownerHeld).length;
  const covered = report.conflicts.filter((c) => c.dualReleaseMitigated).length;
  const page = renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <SodPanel initialView="conflicts" onNavigate={() => {}} report={report} />
    </ReadOnlyPracticeProvider>,
  );
  /** The conflicts each person's heading counts, added up, in one stretch of the page. */
  const cardsIn = (html: string) =>
    [...html.matchAll(/ · (\d+) conflicts?<\/span><\/h3>/g)].reduce((n, m) => n + Number(m[1]), 0);
  const [before, rest = ""] = page.split('data-list="not-open"');
  const openList = before.split('data-list="open"')[1] ?? "";

  it("lists exactly the open findings the sub-tab counts", () => {
    expect(ownerHeld).toBeGreaterThan(0);
    expect(covered).toBeGreaterThan(0);
    const counted = Number(/Duty conflicts \((\d+)\)/.exec(page)![1]);
    expect(counted).toBe(report.conflicts.length - ownerHeld - covered);
    expect(cardsIn(openList)).toBe(counted);
  });

  it("puts the owner's own pairs and the fully covered pairs in a folded group below", () => {
    expect(rest).toContain(
      `Not counted as open (${ownerHeld + covered}): your own pairs and pairs dual release covers at every amount`,
    );
    expect(cardsIn(rest)).toBe(ownerHeld + covered);
    // Folded: the group is closed until the owner opens it.
    expect(rest.slice(0, rest.indexOf(">"))).not.toMatch(/\bopen\b/);
  });
});

describe("duty-conflict controls on a touch screen", () => {
  it("makes the severity chips and the written-procedure links 44px tall", () => {
    const page = render({ ...defaultProfile("general"), procedures: [] });
    const group = page
      .split('aria-label="Show duty conflicts of one severity"')[1]
      .split("</div>")[0];
    const chips = [...group.matchAll(/<button[^>]*class="([^"]*)"/g)];
    expect(chips).toHaveLength(5);
    for (const chip of chips) expect(chip[1].split(" ")).toContain("pointer-coarse:min-h-11");
    const links = [
      ...page.matchAll(/<button[^>]*class="([^"]*)"[^>]*>(?:(?!<\/button>).)*Written procedure: /g),
    ];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link[1].split(" ")).toContain("pointer-coarse:min-h-11");
  });
});

describe("the What to do first box", () => {
  /** The box's items, as text. */
  const boxItems = (page: string) => {
    const box = page.split('data-box="what-to-do-first"')[1]?.split("</ul>")[0] ?? "";
    return [...box.matchAll(/<li[^>]*>((?:(?!<\/li>).)*)<\/li>/g)].map((m) =>
      m[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/^· /, ""),
    );
  };

  it.each(INDUSTRIES.map((i) => i.id))(
    "%s sample: leads with the first step Start here lists",
    (industry) => {
      const profile: PracticeProfile = { ...defaultProfile(industry), procedures: [] };
      const template = resolveTemplate(profile);
      const first = buildStartHereModel({ profile, template, today: new Date(2026, 8, 26) })
        .firstSteps.steps[0];
      expect(first).toBeDefined();
      const items = boxItems(render(profile));
      expect(items[0]).toBe(`First, as on Start here: ${first.control.label}`);
      // No later line names a different first move.
      expect(items.slice(1).join(" ")).not.toMatch(/\bStart by\b|\bfirst\b/i);
    },
  );
});
