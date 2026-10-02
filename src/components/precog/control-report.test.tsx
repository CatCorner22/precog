import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { withStaff } from "@/lib/precog/profile-actions";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import type { Person } from "@/lib/precog/types";
import {
  buildReportModelForProfile,
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

  it("discloses a segregation score set by hand, and only then", () => {
    const own: PracticeProfile = {
      ...defaultProfile("dental"),
      practiceName: "Ortiz Dental Studio",
      customPeople: team,
    };
    const manual = withStaff(own, { ...own.staff, segregationScore: 95 });
    expect(render(manual)).toContain("Segregation score set by hand: 95.");
    expect(render(own)).not.toContain("set by hand");
    expect(render(defaultProfile("dental"))).not.toContain("set by hand");
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
    expect(html).not.toContain("0 critical duty conflicts");
    expect(html).toContain(
      "Dual release covers 1 critical duty conflict only above a threshold. Below the threshold one person still acts alone, so it counts as open.",
    );
    // With dual release off the pair is plainly open, so there is nothing to explain.
    const plain = render({ ...profile, dualRelease: { ...profile.dualRelease, enabled: false } });
    expect(plain).toContain("1 open critical duty conflict");
    expect(plain).not.toContain("only above a threshold");
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

  it("recalculates stored figures from another report layout", () => {
    const html = renderFrozen(REPORT_LAYOUT_VERSION + 1, stored);
    expect(html).not.toContain("Figures as locked.");
    expect(html).toContain(
      "Precog stored this version&#x27;s figures for an earlier report layout.",
    );
    expect(html).toContain(atLock.summary[0]);
  });
});
