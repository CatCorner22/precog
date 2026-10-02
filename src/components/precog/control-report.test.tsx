import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { withStaff } from "@/lib/precog/profile-actions";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import type { Person } from "@/lib/precog/types";
import {
  buildReportModelForProfile,
  PRINTED_LAYOUT_VERSIONS,
  REPORT_LAYOUT_VERSION,
  serializeReportModel,
} from "@/lib/precog/report/stored-model";
import { SCORING_VERSION } from "@/lib/precog/scoring/weights";
import { ControlReport } from "./control-report";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

/** A locked version, so the page renders without the live versions panel. */
const locked: ReportVersionRow = {
  id: "v1",
  businessId: "b1",
  versionNo: 1,
  revision: null,
  scopeNote: "",
  preparedBy: null,
  preparedByName: "Ada Park",
  preparedAt: "2026-09-26T12:00:00.000Z",
  reviewedBy: null,
  reviewedByName: null,
  reviewedAt: null,
  reviewNote: "",
  sentAt: null,
};

const team: Person[] = [
  {
    id: "a",
    name: "Ada Park",
    role: "Owner",
    active: true,
    owner: true,
    entitlements: ["approve_payroll", "sign_checks"],
  },
  {
    id: "b",
    name: "Ben Ortiz",
    role: "Bookkeeper",
    active: true,
    entitlements: ["enter_invoices", "release_payment", "bank_reconcile"],
  },
];

const render = (profile: PracticeProfile) =>
  renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <ControlReport locked={locked} />
    </ReadOnlyPracticeProvider>,
  );

describe("printed control report", () => {
  it("prints no Coverage check KPI beside the duty separation index", () => {
    const html = render(defaultProfile("dental"));
    expect(html).toContain("Duty separation index");
    expect(html).not.toContain("Coverage check");
  });

  it("discloses a segregation score set by hand on a sample, and only then", () => {
    const own: PracticeProfile = {
      ...defaultProfile("dental"),
      practiceName: "Ortiz Dental Studio",
      customPeople: team,
    };
    const sample = defaultProfile("dental");
    const manual = withStaff(sample, { ...sample.staff, segregationScore: 95 });
    expect(render(manual)).toContain("Segregation score set by hand: 95.");
    // An own team's score comes from its duties: a value passed in is not saved.
    expect(render(withStaff(own, { ...own.staff, segregationScore: 95 }))).not.toContain(
      "set by hand",
    );
    expect(render(own)).not.toContain("set by hand");
    expect(render(sample)).not.toContain("set by hand");
  });

  it("counts the duty separation hint as the band word does, and says why a narrowed pair is open", () => {
    // Dual release covers write-offs only above $150, so Ana's pair stays open below it.
    const profile: PracticeProfile = {
      ...defaultProfile("dental"),
      practiceName: "Reyes Dental",
      customPeople: [
        {
          id: "o",
          name: "Olga Reyes",
          role: "Owner",
          active: true,
          owner: true,
          entitlements: ["release_payment"],
        },
        {
          id: "a",
          name: "Ana Diaz",
          role: "Bookkeeper",
          active: true,
          entitlements: ["approve_writeoffs", "post_adjustments"],
        },
      ],
    };
    const covered = { ...profile, dualRelease: { ...profile.dualRelease, enabled: true } };
    const html = render(covered);
    expect(html).toContain("Weak · 1 open critical duty conflict");
    // The reduced pair is counted once: among the open conflicts, not again as covered.
    expect(html).toContain("0 covered by dual release at every amount.");
    expect(html).toContain("1 more reduced by dual release but not closed, counted open above.");
    expect(html).not.toContain("0 critical duty conflicts");
    expect(html).toContain(
      "Dual release covers 1 critical duty conflict only above a threshold. Below the threshold one person still acts alone, so it counts as open.",
    );
    // With dual release off the pair is plainly open, so there is nothing to explain.
    const plain = render({ ...profile, dualRelease: { ...profile.dualRelease, enabled: false } });
    expect(plain).toContain("1 open critical duty conflict");
    expect(plain).not.toContain("only above a threshold");
  });

  it("states the scope of the duty-conflict findings when the books show people the map lacks", () => {
    const scope =
      "At the reading on Sep 26, 2026, your books showed 3 people the duty map does not list; their duties are not assessed.";
    const profile = defaultProfile("dental");
    expect(render(profile)).not.toContain("the duty map does not list");
    const drifted: PracticeProfile = {
      ...profile,
      integrationDriftSummary: {
        updatedAt: "2026-09-26T12:00:00.000Z",
        source: "quickbooks",
        headline: "3 employee(s) in the books but not on your map",
        qboEmployeesNotOnMap: 3,
        qboPeopleNotInBooks: 0,
        qboVendorsAdded: 0,
        accessPending: 0,
      },
    };
    const html = render(drifted);
    const section = html.slice(html.indexOf("Segregation of duties"));
    expect(section).toContain(scope);
  });
});

describe("report cover headlines", () => {
  it("names the scale of each count, so the top-priority count and the residual count never share words", () => {
    for (const industry of ["dental", "restaurant"] as const) {
      const text = render(defaultProfile(industry)).replace(/<[^>]+>/g, "|");
      const between = (from: string, to: string) => {
        const start = text.indexOf(from);
        expect(start, from).toBeGreaterThanOrEqual(0);
        return text.slice(start, text.indexOf(to, start));
      };
      // The priority list's headline: items at priority 88 or more.
      const top = between("Top-priority items", "Residual risks by band");
      expect(top).toContain("Priority 88 or more");
      expect(top).not.toMatch(/fix first|80 or more|residual/i);
      // The residual "Fix first" band: risks at 80 or more on the residual index.
      const residual = between("Residual risks by band", "Duty separation index");
      expect(residual).toMatch(/\|\d+ fix first\|/);
      expect(residual).toContain("Fix first at 80 or more");
      expect(residual).not.toMatch(/top|priority|88/i);
      // "Fix first" names the residual band only: nowhere else on the cover.
      expect(text.replace(residual, "")).not.toMatch(/fix first/i);
    }
  });
});

describe("locked version figures", () => {
  const profile = defaultProfile("dental");
  const atLock = buildReportModelForProfile(profile, "2026-09-26");

  // A stored model whose summary today's scoring would never produce.
  const stored = serializeReportModel({ ...atLock, summary: ["Figures as locked."] });
  const renderFrozen = (layoutVersion: number, model: typeof stored | null) =>
    renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={profile}>
        <ControlReport locked={locked} frozen={{ layoutVersion, model }} />
      </ReadOnlyPracticeProvider>,
    );

  it("prints the stored figures, not today's, and no recalculation note", () => {
    const html = renderFrozen(REPORT_LAYOUT_VERSION, stored);
    expect(html).toContain("Figures as locked.");
    expect(html).not.toContain(atLock.summary[0]);
    expect(html).not.toContain("Figures recalculated");
  });

  it("says a version locked before figures were stored is recalculated", () => {
    const html = render(profile);
    expect(html).toContain(`Figures recalculated with scoring ${SCORING_VERSION} on `);
    expect(html).toContain("This version was locked before Precog stored its figures.");
    expect(html).toContain(atLock.summary[0]);
  });

  it("says a version whose figures were not stored at lock is recalculated", () => {
    const html = renderFrozen(REPORT_LAYOUT_VERSION, null);
    expect(html).toContain(`Figures recalculated with scoring ${SCORING_VERSION} on `);
    expect(html).toContain("Precog did not store this version&#x27;s figures when it was locked.");
    expect(html).not.toContain("locked before Precog stored");
    expect(html).toContain(atLock.summary[0]);
  });

  it("prints a model stored before partial coverage was stored with its locked counts", () => {
    // Dual release covers Ana's write-off pair only above $150. A model locked
    // before the report stored partial coverage counted that pair closed.
    const reyes: PracticeProfile = {
      ...defaultProfile("dental"),
      practiceName: "Reyes Dental",
      customPeople: [
        {
          id: "o",
          name: "Olga Reyes",
          role: "Owner",
          active: true,
          owner: true,
          entitlements: ["release_payment"],
        },
        {
          id: "a",
          name: "Ana Diaz",
          role: "Bookkeeper",
          active: true,
          entitlements: ["approve_writeoffs", "post_adjustments"],
        },
      ],
    };
    reyes.dualRelease = { ...reyes.dualRelease, enabled: true };
    const today = serializeReportModel(buildReportModelForProfile(reyes, "2026-09-26"));
    expect(today.partialCoverage?.length).toBeGreaterThan(0);
    const { partialCoverage: _dropped, ...rest } = today;
    const old: typeof stored = {
      ...rest,
      sod: { ...rest.sod, summary: { ...rest.sod.summary, critical: 0 } },
    };
    const html = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={reyes}>
        <ControlReport locked={locked} frozen={{ layoutVersion: 1, model: old }} />
      </ReadOnlyPracticeProvider>,
    );
    // Models locked before step 4.4 carry layout 1, which still prints from stored figures.
    expect(PRINTED_LAYOUT_VERSIONS).toContain(1);
    expect(html).not.toContain("Figures recalculated");
    expect(html).toContain("0 critical, 0 high, 0 medium");
    expect(html).toContain("Covered by dual release");
    expect(html).not.toContain("Reduced, not closed");
  });

  it("prints figures stored under layout 1 with that layout's labels", () => {
    // A model locked before map completeness and band counts: no `mitigate`
    // or `watch` counts, and a map health score that still counts heat.
    const { mitigate: _m, watch: _w, ...oldPortfolio } = stored.portfolio;
    const layoutOne = {
      ...stored,
      portfolio: oldPortfolio,
      mapHealth: {
        ...stored.mapHealth,
        bandLabel: "Fair",
        dimensions: [
          ...stored.mapHealth.dimensions,
          { id: "calm", label: "Heat", score: 40, weight: 0.3, hint: "Average heat 60" },
        ],
      },
    } as unknown as typeof stored;
    const html = renderFrozen(1, layoutOne);
    expect(html).toContain("Figures as locked.");
    expect(html).not.toContain("Figures recalculated");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("Map completeness");
    expect(html).toContain("Map health score");
    expect(html).toContain("Average residual risk score");
    expect(html).toContain(`${stored.portfolio.criticalPath} to fix first`);
  });

  it("recalculates stored figures from another report layout", () => {
    const html = renderFrozen(REPORT_LAYOUT_VERSION + 1, stored);
    expect(html).not.toContain("Figures as locked.");
    expect(html).toContain(
      "Precog stored this version&#x27;s figures for an earlier report layout.",
    );
    expect(html).toContain(atLock.summary[0]);
  });
});
