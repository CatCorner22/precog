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
  hasFigures: false,
  firm: null,
  engagement: null,
  reviewRequestedAt: null,
  reviewRequestedFrom: null,
  reviewRequestedFromName: null,
  returnedAt: null,
  returnedBy: null,
  returnedByName: null,
  returnNote: "",
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

/** A locked version printing the figures stored for `profile` under `layoutVersion`. */
const renderStored = (profile: PracticeProfile, layoutVersion: number) =>
  renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <ControlReport
        locked={locked}
        frozen={{
          layoutVersion,
          model: serializeReportModel(buildReportModelForProfile(profile, "2026-09-26")),
        }}
      />
    </ReadOnlyPracticeProvider>,
  );

/** The report's text with its tags as single bars. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");

describe("printed control report", () => {
  it("prints no Coverage check KPI beside the duty separation figure", () => {
    const html = render(defaultProfile("dental"));
    expect(textOf(html)).toContain("|Duty separation|");
    expect(html).not.toContain("Duty separation index");
    expect(html).not.toContain("Coverage check");
    // Layouts 1 and 2 keep the name they printed.
    expect(renderStored(defaultProfile("dental"), 2)).toContain("Duty separation index");
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
  it("prints the layout 1 and 2 decision labels, not the screen's plain ones", () => {
    const kinds = ["accept_residual", "remediate", "monitor", "insure"] as const;
    const html = renderStored(
      {
        ...defaultProfile("dental"),
        decisions: kinds.map((kind, i) => ({
          id: `d${i}`,
          createdAt: "2026-09-20T12:00:00.000Z",
          subject: `Decision ${i}`,
          kind,
          note: "",
        })),
      },
      2,
    );
    for (const label of ["Accept residual", "Remediate", "Monitor", "Transfer / insure"]) {
      expect(html).toContain(`<span class="font-medium">${label}</span>`);
    }
    for (const label of ["Accept the risk", "Fix it", "Watch it", "Insure it"]) {
      expect(html).not.toContain(label);
    }
  });
});

describe("report header, basis block and footer", () => {
  const basis =
    "This report is not an audit, review or attestation engagement under AICPA standards.";
  const ortiz: PracticeProfile = {
    ...defaultProfile("dental"),
    practiceName: "Ortiz Dental Studio",
    customPeople: team,
  };

  it("prints the basis block on page one of a live report and of layouts 1 and 2", () => {
    const live = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={ortiz}>
        <ControlReport />
      </ReadOnlyPracticeProvider>,
    );
    expect(live).toContain('aria-label="Basis and limitations"');
    expect(live).toContain(basis);
    for (const layout of [1, 2]) {
      const html = renderStored(defaultProfile("dental"), layout);
      expect(html).toContain('aria-label="Basis and limitations"');
      expect(html).toContain(basis);
    }
    // The block is printed around the stored figures: layout 2 keeps its labels.
    expect(renderStored(defaultProfile("dental"), 2)).toContain("Duty separation index");
  });

  const north = { name: "North Advisors", letterhead: "", logoDataUrl: null };

  it("names the firm under the title for a firm client, and nothing without one", () => {
    const withFirm = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={ortiz}>
        <ControlReport locked={locked} firm={north} />
      </ReadOnlyPracticeProvider>,
    );
    expect(textOf(withFirm)).toContain("|Prepared for Ortiz Dental Studio by North Advisors|");
    expect(render(ortiz)).not.toContain("Prepared for");
    const live = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={ortiz}>
        <ControlReport firm={null} />
      </ReadOnlyPracticeProvider>,
    );
    expect(live).not.toContain("Prepared for");
    expect(live).not.toContain("report-letterhead");
  });

  it("prints the firm's letterhead and logo above the eyebrow", () => {
    const logo = "data:image/png;base64,iVBORw0KGgo=";
    const html = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={ortiz}>
        <ControlReport
          locked={locked}
          firm={{ name: "North Advisors", letterhead: "12 Elm St\n555-0100", logoDataUrl: logo }}
        />
      </ReadOnlyPracticeProvider>,
    );
    const head = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(head).toContain('class="report-letterhead');
    expect(head).toContain('alt="North Advisors logo"');
    expect(head).toContain(`src="${logo}"`);
    expect(textOf(head)).toContain(
      "|North Advisors|12 Elm St\n555-0100|Internal control priorities|",
    );
    // Without a logo no image prints; the name still leads.
    const plain = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={ortiz}>
        <ControlReport locked={locked} firm={north} />
      </ReadOnlyPracticeProvider>,
    );
    expect(plain).not.toContain("<img");
    expect(plain).toContain('class="report-letterhead');
  });

  it("opens with a cover page only when the firm asks for one", () => {
    const covered = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={ortiz}>
        <ControlReport locked={locked} firm={north} coverPage />
      </ReadOnlyPracticeProvider>,
    );
    expect(covered).toContain('aria-label="Cover page"');
    const cover = covered.slice(
      covered.indexOf('aria-label="Cover page"'),
      covered.indexOf("<header"),
    );
    expect(cover).toContain("break-after-page");
    expect(textOf(cover)).toContain("|Prepared for Ortiz Dental Studio by North Advisors|");
    expect(textOf(cover)).toContain(
      "Version 1 · Prepared by Ada Park on Sep 26, 2026 · Not yet reviewed",
    );
    const live = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={ortiz}>
        <ControlReport firm={north} coverPage />
      </ReadOnlyPracticeProvider>,
    );
    expect(textOf(live.slice(0, live.indexOf("<header")))).toMatch(/\|generated [A-Z][a-z]{2} \d/);
    expect(
      renderToStaticMarkup(
        <ReadOnlyPracticeProvider profile={ortiz}>
          <ControlReport locked={locked} firm={north} />
        </ReadOnlyPracticeProvider>,
      ),
    ).not.toContain("Cover page");
    expect(
      renderToStaticMarkup(
        <ReadOnlyPracticeProvider profile={ortiz}>
          <ControlReport locked={locked} firm={null} coverPage />
        </ReadOnlyPracticeProvider>,
      ),
    ).not.toContain("Cover page");
  });

  it("prints the engagement frozen into a locked version, on the cover and in the header", () => {
    const engaged: ReportVersionRow = {
      ...locked,
      scopeNote: "Money duties",
      engagement: { scope: "Duty map", periodStart: "2026-01-01", periodEnd: "2026-12-31" },
    };
    const line = "Engagement: Duty map · Jan 1, 2026 to Dec 31, 2026";
    const html = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={ortiz}>
        <ControlReport locked={engaged} firm={north} coverPage />
      </ReadOnlyPracticeProvider>,
    );
    const cover = html.slice(html.indexOf('aria-label="Cover page"'), html.indexOf("<header"));
    expect(textOf(cover)).toContain(`|Scope: Money duties|${line}|`);
    const head = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(textOf(head)).toContain(
      `Version 1 · Prepared by Ada Park on Sep 26, 2026 · Not yet reviewed · Scope: Money duties · ${line}|`,
    );
    // A version without a frozen engagement, and a live report, print no such line.
    for (const page of [
      <ControlReport key="locked" locked={locked} firm={north} coverPage />,
      <ControlReport key="live" firm={north} coverPage />,
    ]) {
      expect(
        renderToStaticMarkup(
          <ReadOnlyPracticeProvider profile={ortiz}>{page}</ReadOnlyPracticeProvider>,
        ),
      ).not.toContain("Engagement:");
    }
  });

  it("repeats the basis in the footer and says the report was prepared with Precog", () => {
    const html = render(ortiz);
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    expect(footer).toContain(basis);
    expect(footer).toContain("Prepared with Precog.");
    expect(html).not.toContain("Precog Pioneer");
    expect(html).not.toContain("Generated by");
  });
});

describe("a shared report", () => {
  const ortiz: PracticeProfile = {
    ...defaultProfile("dental"),
    practiceName: "Ortiz Dental Studio",
    customPeople: team,
  };
  const north = { name: "North Advisors", letterhead: "", logoDataUrl: null };

  it("prints without its toolbar: no way back into Precog, no sent stamp, no Print, no versions panel", () => {
    const shared = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={ortiz}>
        <ControlReport locked={locked} firm={north} shared />
      </ReadOnlyPracticeProvider>,
    );
    expect(shared).not.toContain("Back to Precog");
    expect(shared).not.toContain("Back to the current report");
    expect(shared).not.toContain("Mark report sent");
    expect(shared).not.toContain("Report versions");
    // The share page's bar carries the one Print control (share-report.test.tsx).
    expect(shared).not.toContain("Print / Save as PDF");
    expect(textOf(shared)).toContain("|Prepared for Ortiz Dental Studio by North Advisors|");
    expect(shared).toContain("Prepared with Precog.");
    // The signed-in locked page keeps its way back.
    const signedIn = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={ortiz}>
        <ControlReport locked={locked} firm={north} />
      </ReadOnlyPracticeProvider>,
    );
    expect(signedIn).toContain("Back to Precog");
    expect(signedIn).toContain("Back to the current report");
    // The live report without `shared` still offers the sent stamp.
    const live = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={ortiz}>
        <ControlReport />
      </ReadOnlyPracticeProvider>,
    );
    expect(live).toContain("Mark report sent");
  });

  it("offers the owner of a business shared with a firm no sent stamp on the live report", () => {
    const owner = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={ortiz}>
        <ControlReport sharedOwner />
      </ReadOnlyPracticeProvider>,
    );
    expect(owner).not.toContain("Mark report sent");
    expect(owner).not.toContain("Report marked sent");
    // The way back and Print stay.
    expect(owner).toContain("Back to Precog");
    expect(owner).toContain("Print / Save as PDF");
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
      const residual = between("Residual risks by band", "Duty separation");
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
    // A model locked on main before Phase 4: no `mitigate` or `watch` counts,
    // a map health score that still counts heat, no stored top-priority count
    // (an averaged priority index instead) and no partial coverage.
    const { mitigate: _m, watch: _w, ...oldPortfolio } = stored.portfolio;
    const { fixFirst: _f, ...oldThreat } = stored.threat;
    const { partialCoverage: _p, ...oldModel } = stored;
    const layoutOne = {
      ...oldModel,
      portfolio: oldPortfolio,
      threat: { ...oldThreat, overallThreatIndex: 89, classificationLabel: "Top priority" },
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
    // The top-priority count comes from the stored ten-row list.
    const top = stored.threat.targetDeck.filter((t) => t.priority >= 88).length;
    expect(top).toBeGreaterThan(0);
    expect(html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|")).toContain(
      `|Top-priority items|${top}|Priority 88 or more|`,
    );
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

describe("report layout 3", () => {
  const profile = defaultProfile("dental");
  const at = (ruleId: string) =>
    buildReportModelForProfile(profile, "2026-09-26").sod.conflicts.find(
      (c) => c.ruleId === ruleId,
    )!;
  // Maya's medium admin-pay finding, her high card-review finding and her
  // critical vendor finding (see finding-responses.test.ts).
  const answered: PracticeProfile = {
    ...profile,
    decisions: [
      {
        id: "d-admin",
        createdAt: "2026-09-20T12:00:00.000Z",
        subject: "Split vendor set-up from payment",
        kind: "remediate",
        note: "",
        reviewBy: "2026-10-15",
        linkedTab: "sod",
        linkedId: "rule-admin-pay",
        linkedIndustry: "dental",
      },
      {
        id: "d-cards",
        createdAt: "2026-09-21T12:00:00.000Z",
        subject: "Card review",
        kind: "monitor",
        note: "",
        linkedTab: "sod",
        linkedId: "rule-card-review",
        linkedIndustry: "dental",
        disposition: {
          verdict: "not_valid",
          reason: "controlled_elsewhere",
          by: { userId: "u1", name: "Ada Park" },
          at: "2026-09-21",
        },
      },
      {
        id: "d-vendor",
        createdAt: "2026-09-22T12:00:00.000Z",
        subject: "Vendor set-up and payment",
        kind: "monitor",
        note: "",
        linkedTab: "sod",
        linkedId: "rule-vendor-create-pay",
        linkedIndustry: "dental",
        disposition: { verdict: "not_valid", reason: "rule_does_not_fit", at: "2026-09-22" },
      },
    ],
  };

  it("is the layout a live report prints", () => {
    expect(REPORT_LAYOUT_VERSION).toBe(3);
    expect(PRINTED_LAYOUT_VERSIONS).toEqual([1, 2, 3]);
    const html = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={answered}>
        <ControlReport />
      </ReadOnlyPracticeProvider>,
    );
    expect(html).toContain("Judged not valid");
    expect(html).not.toContain("Assumed loss");
    expect(textOf(html)).toContain("|Duty separation|");
  });

  it("prints no assumed loss column or note, and no idea counts on the process map", () => {
    const html = render(profile);
    expect(html).not.toContain("Assumed loss");
    expect(html).not.toMatch(/\d+ ideas/);
    // Layout 2 printed both.
    const two = renderStored(profile, 2);
    expect(two).toContain("Assumed loss");
    expect(two).toMatch(/\d+ ideas/);
  });

  it("prints the plain decision labels", () => {
    const html = render({
      ...profile,
      decisions: (["accept_residual", "remediate", "monitor", "insure"] as const).map(
        (kind, i) => ({
          id: `d${i}`,
          createdAt: "2026-09-20T12:00:00.000Z",
          subject: `Decision ${i}`,
          kind,
          note: "",
        }),
      ),
    });
    for (const label of ["Accept the risk", "Fix it", "Watch it", "Insure it"]) {
      expect(html).toContain(`<span class="font-medium">${label}</span>`);
    }
    for (const label of ["Accept residual", "Remediate", "Transfer / insure"]) {
      expect(html).not.toContain(label);
    }
  });

  it("prints the response and review date of each finding, and the findings judged not valid", () => {
    const text = textOf(render(answered));
    expect(text).toContain("|Response|Review by|");
    const sod = text.slice(text.indexOf("Segregation of duties"));
    expect(sod).toContain("|Fix it|Oct 15, 2026|");
    expect(sod).toContain("|Judged not valid|—|");
    expect(sod).toContain("|Awaiting a second person|—|");
    expect(sod).toContain("|No decision yet|—|");

    const list = sod.slice(sod.indexOf("|Judged not valid|", sod.indexOf("|Review by|") + 1));
    const cards = at("rule-card-review");
    const vendor = at("rule-vendor-create-pay");
    expect(list).toContain(
      `${cards.personName}: ${cards.labelA} + ${cards.labelB.charAt(0).toLowerCase()}`,
    );
    expect(list).toContain("Someone outside this map checks it");
    expect(list).toContain("· by Ada Park on Sep 21, 2026");
    expect(list).toContain(`${vendor.personName}: ${vendor.labelA}`);
    expect(list).toContain("The rule does not fit this business");
    expect(list).toContain("· by someone not signed in on Sep 22, 2026");
    expect(list).toContain("Awaiting a second person");
    // The log names the judgement, not the "Watch it" the entry is stored as.
    const log = text.slice(text.indexOf("Decisions log"));
    expect(log).toContain("|Judged not valid: Someone outside this map checks it|");
    expect(log).not.toContain("Watch it");
    // The critical finding's entry waits for a second person, as its row does.
    expect(log).toContain(
      "|Judged not valid: The rule does not fit this business| · Awaiting a second person| · Vendor set-up and payment|",
    );
    expect(log).not.toContain("Someone outside this map checks it| · Awaiting");
  });

  it("prints no responses or not-valid list under layout 2", () => {
    const html = renderStored(answered, 2);
    expect(html).not.toContain("Review by");
    expect(html).not.toContain("Judged not valid");
    expect(html).not.toContain("Awaiting a second person");
  });
});
