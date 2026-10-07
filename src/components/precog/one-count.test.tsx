import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { doNextSteps } from "@/lib/precog/actions/do-next";
import { fallbackBrief, localBrief } from "@/lib/precog/coach/local-brief";
import { pioneerProfileFrom } from "@/lib/precog/coach/pioneer-profile";
import { openConflictHeadline } from "@/lib/precog/headline/open-conflicts";
import { INDUSTRIES, type IndustryId } from "@/lib/precog/industry";
import { buildOwnTeam, ownBusinessProfile } from "@/lib/precog/onboarding/own-team";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { buildControlReportModel } from "@/lib/precog/report/build-control-report";
import { concentrationMove } from "@/lib/precog/report/report-summary";
import { buildStartHereModel } from "@/lib/precog/start-here/model";
import { partialDualReleaseCoverage } from "@/lib/precog/sod/open-findings";
import { count } from "@/lib/precog/text";
import { SodPanel } from "./sod-panel";
import { StartHereExposureSection } from "./start-here-exposure-section";
import { StartHereFiguresSection } from "./start-here-figures-section";
import { StartHereFirstStepsSection } from "./start-here-first-steps-section";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const TODAY = "2026-10-07";

/** Each sample as loaded, and with dual release on, so covered and narrowed pairs are counted too. */
function samples(): { name: string; profile: PracticeProfile }[] {
  return INDUSTRIES.flatMap(({ id }) => {
    const base = defaultProfile(id);
    return [
      { name: id, profile: base },
      {
        name: `${id} with dual release`,
        profile: { ...base, dualRelease: { ...base.dualRelease, enabled: true } },
      },
    ];
  });
}

/** The report's open count: the one number every screen gives. */
function reportOf(profile: PracticeProfile) {
  const tpl = resolveTemplate(profile);
  const model = buildControlReportModel({
    tpl,
    profile,
    mapCustomized: false,
    today: TODAY,
    trackFreshness: false,
    mapReady: false,
    businessName: "Sample",
  });
  const headline = openConflictHeadline(
    model.sod,
    partialDualReleaseCoverage(profile.dualRelease, model.sod.conflicts),
  );
  return { tpl, model, headline };
}

/** The value printed under a tile's label: the first number after it. */
function tileValue(html: string, label: string): number {
  const at = html.indexOf(`>${label}<`);
  expect(at, `no "${label}" tile`).toBeGreaterThan(-1);
  const value = /<p[^>]*>(\d+)<\/p>/.exec(html.slice(at));
  return Number(value?.[1]);
}

describe("one open-conflict count on every screen", () => {
  it.each(samples().map((s) => [s.name, s.profile] as const))(
    "%s: Start here, the conflict tab, the report and the coach agree",
    (_, profile) => {
      const { tpl, model, headline } = reportOf(profile);
      const { open } = headline;
      const start = buildStartHereModel({ profile, template: tpl, today: new Date(2026, 9, 7) });

      // Start here's tile, and its hint, which adds up to the tile.
      const figures = renderToStaticMarkup(
        <StartHereFiguresSection model={start.figures} onOpenDetail={() => {}} />,
      );
      expect(tileValue(figures, "Open duty conflicts")).toBe(open);
      expect(figures).toContain(`${headline.critical} critical · ${headline.high} high`);
      if (headline.other > 0) expect(figures).toContain(`· ${headline.other} other`);

      // Start here's exposure sentence and its concentration line.
      const exposure = renderToStaticMarkup(
        <StartHereExposureSection model={start.exposure} onOpenDetail={() => {}} />,
      );
      if (open > 0) expect(exposure).toContain(count(open, "open duty conflict"));
      expect(exposure).not.toContain("open gaps");
      const move = concentrationMove(headline.findings);
      if (move) {
        expect(exposure).toContain(`holds ${move.held} of the ${open} open duty conflicts`);
      }

      // Start here's first step names the person and the same total.
      const first = doNextSteps(start.firstSteps.items)[0];
      if (move && first?.control.id === "split-one-duty-out") {
        expect(first.control.label).toContain(move.personName);
        expect(first.control.label).toContain(`of the ${open} open duty conflicts`);
      }
      // Its pair count names duty pairs, never "open gaps", so it never reads
      // as a second count of the open duty conflicts.
      const steps = renderToStaticMarkup(
        <StartHereFirstStepsSection model={start.firstSteps} part="actions" />,
      );
      expect(steps).not.toContain("open gap");
      for (const step of doNextSteps(start.firstSteps.items).slice(0, 3)) {
        if (step.answers > 1) {
          expect(steps).toContain(
            `covers ${step.answers} of the duty pairs behind your open conflicts`,
          );
        }
      }

      // The conflict tab: the tile and the sub-tab's count.
      const tab = renderToStaticMarkup(
        <ReadOnlyPracticeProvider profile={profile}>
          <SodPanel initialView="conflicts" />
        </ReadOnlyPracticeProvider>,
      );
      expect(tileValue(tab, "Open duty conflicts")).toBe(open);
      expect(tab).toContain(`Duty conflicts (${open})`);

      // The report's summary.
      if (open > 0) expect(model.summary[0]).toMatch(new RegExp(`^${open} open duty conflict`));

      // The coach, the brief built from the team's conflicts alone.
      const coach = fallbackBrief({ ...profile, practiceName: "Sample" }, "What do I fix first?");
      if (open > 0) expect(coach.markdown).toContain(count(open, "open duty conflict"));
    },
  );

  it.each(INDUSTRIES.map((i) => i.id))(
    "%s sample: the full coach brief states the same total",
    (industry: IndustryId) => {
      const profile = pioneerProfileFrom({
        ...defaultProfile(industry),
        practiceName: "Sample",
      } as never);
      const { headline } = reportOf(profile);
      const question = "What should I fix this week to reduce embezzlement risk?";
      const { brief } = localBrief(question, { profile, question }, profile);
      expect(brief.markdown).toContain(count(headline.open, "open duty conflict"));
    },
  );

  it("counts open findings in the location filter, leaving the owner's own pairs out", () => {
    const people = buildOwnTeam(
      [
        {
          name: "Pat Owner",
          role: "Owner",
          owner: true,
          duties: ["create_vendor", "release_payment", "bank_reconcile"],
          department: "Main St",
        },
        {
          name: "Lee Clerk",
          role: "Clerk",
          duties: ["collect_cash", "post_payments"],
          department: "Elm St",
        },
        {
          name: "Ana Clerk",
          role: "Clerk",
          duties: ["collect_cash", "prepare_deposit"],
          department: "Main St",
        },
      ],
      "general",
    );
    const profile = ownBusinessProfile(defaultProfile("general"), {
      practiceName: "Two stores",
      people,
    });
    const { headline, model } = reportOf(profile);
    expect(headline.ownerHeld).toBeGreaterThan(0);
    expect(model.sod.conflicts.length).toBeGreaterThan(headline.open);
    const tab = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={profile}>
        <SodPanel initialView="conflicts" />
      </ReadOnlyPracticeProvider>,
    );
    expect(tab).toContain(`All locations (${headline.open})`);
    expect(tab).toContain(`Duty conflicts (${headline.open})`);
  });
});
