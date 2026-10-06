import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ControlReport } from "@/components/precog/control-report";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { REPORT_LIST_LIMIT, type ReportVersionRow } from "@/lib/precog/firm/reports";
import type { EngagementRecord } from "@/lib/precog/firm/engagement-row";
import type { ReviewLogRow } from "@/lib/precog/firm/engagement-store";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { shareReportProfile } from "@/lib/precog/share/report-share-profile";
import { industrySample } from "@/lib/precog/templates/registry";
import type { Person } from "@/lib/precog/types";
import {
  buildReportModelForProfile,
  REPORT_LAYOUT_VERSION,
  serializeReportModel,
  type FrozenReport,
} from "@/lib/precog/report/stored-model";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

// Hoisted with the mocks: the report imported above loads the server modules first.
const { getEngagement, listReports, getReport } = vi.hoisted(() => ({
  getEngagement: vi.fn(),
  listReports: vi.fn(),
  getReport: vi.fn(),
}));
vi.mock("@/lib/precog/firm/engagement-server", () => ({ getEngagement }));
vi.mock("@/lib/precog/firm/server", () => ({ getReport, listReports }));

const {
  ARCHIVE_FORMER_MEMBER,
  ARCHIVE_NO_REVIEWS,
  ARCHIVE_NO_VERSIONS,
  ARCHIVE_RECORDER_UNKNOWN,
  ARCHIVE_REVIEW_HEADERS,
  ARCHIVE_SECTION_ENGAGEMENT,
  ARCHIVE_SECTION_REVIEWS,
  ARCHIVE_SECTION_VERSIONS,
  archiveFileName,
  archiveProgressText,
  archiveVersionLimitNote,
  buildEngagementArchive,
  engagementArchiveDocument,
} = await import("./engagement-archive");

/** A register line only the business sees: the share projection drops it. */
const PRIVATE = "Ada keeps the bank token in the top drawer.";

const profile: PracticeProfile = {
  ...defaultProfile("dental"),
  practiceName: "Ortiz Dental",
  businessId: "biz_1",
  customKnowledge: industrySample("dental").knowledge.map((item, i) =>
    i === 0 ? { ...item, description: PRIVATE } : item,
  ),
};

/**
 * The review-workflow stamps slice W adds to `ReportVersionRow` (decision
 * 28), unset. `version` spreads them into an untyped row and returns that,
 * so the fixture compiles both before and after the fields reach the type.
 */
const NOT_REQUESTED = {
  reviewRequestedAt: null,
  reviewRequestedFrom: null,
  reviewRequestedFromName: null,
  returnedAt: null,
  returnedBy: null,
  returnedByName: null,
  returnNote: "",
};

function version(no: number, reviewed: boolean): ReportVersionRow {
  const month = String(((no - 1) % 12) + 1).padStart(2, "0");
  const row = {
    id: `v${no}`,
    businessId: "biz_1",
    versionNo: no,
    revision: null,
    scopeNote: "",
    preparedBy: "pre",
    preparedByName: "Ada Park",
    preparedAt: `2026-${month}-02T12:00:00.000Z`,
    reviewedBy: reviewed ? "rev" : null,
    reviewedByName: reviewed ? "Ben Ortiz" : null,
    reviewedAt: reviewed ? `2026-${month}-03T12:00:00.000Z` : null,
    reviewNote: "",
    reviewOverrideNote: null,
    sentAt: null,
    hasFigures: true,
    firm: { name: "North Advisors", letterhead: "12 Elm St", logoDataUrl: null },
    engagement: { scope: "Duty map", periodStart: "2026-01-01", periodEnd: "2026-12-31" },
    ...NOT_REQUESTED,
  };
  return row;
}

const engagement: EngagementRecord = {
  scope: "Duty map & monthly review",
  periodStart: "2026-01-01",
  periodEnd: "2026-12-31",
  status: "ended",
  endedAt: "2026-10-04T15:00:00.000Z",
  preparerUserId: "pre",
  reviewerUserId: "gone",
};

const reviews: ReviewLogRow[] = [
  {
    period: "2026-09",
    itemKey: "cleared_checks",
    result: "exception",
    notes: "Check 1043 payable to cash </script>",
    ownerName: "Dana",
    dueOn: "2026-10-10",
    recordedAt: "2026-10-02T12:00:00.000Z",
    recordedByName: "Ada Park",
  },
];

const storedModel = () => serializeReportModel(buildReportModelForProfile(profile, "2026-09-26"));

/** Builds the archive with the server calls answered from these fixtures. */
async function build(
  versions: ReportVersionRow[],
  {
    frozen = () => ({
      scoringVersion: "x",
      layoutVersion: REPORT_LAYOUT_VERSION,
      model: storedModel(),
    }),
    reportProfile = profile,
    render = renderToStaticMarkup,
  }: {
    frozen?: () => FrozenReport | null;
    reportProfile?: PracticeProfile;
    render?: (element: React.ReactElement) => string;
  } = {},
) {
  getEngagement.mockResolvedValue({
    firmClient: true,
    engagement,
    retentionYears: 7,
    reviews,
  });
  // Newest first, as the server lists them.
  listReports.mockResolvedValue({ versions: [...versions].reverse() });
  const stored = frozen();
  getReport.mockReset();
  getReport.mockImplementation(async ({ data }: { data: { id: string } }) => {
    const v = versions.find((x) => x.id === data.id)!;
    return {
      version: v,
      frozen: stored,
      firm: v.firm,
      coverPage: true,
      profile: reportProfile,
    };
  });
  const progress: string[] = [];
  const saved: { name: string; html: string }[] = [];
  const fileName = await buildEngagementArchive({
    businessId: "biz_1",
    businessName: "Ortiz Dental",
    memberNames: { pre: "Ada Park", rev: "Ben Ortiz" },
    onProgress: (i, n) => progress.push(archiveProgressText(i, n)),
    render,
    styles: () => ".report{color:#111}",
    save: (name, html) => saved.push({ name, html }),
  });
  return { fileName, progress, saved };
}

function archiveJson(html: string) {
  const match = /<script type="application\/json" id="precog-archive">([\s\S]*?)<\/script>/.exec(
    html,
  );
  expect(match).not.toBeNull();
  return JSON.parse(match![1]) as {
    engagement: EngagementRecord;
    reviews: ReviewLogRow[];
    versions: Record<string, unknown>[];
    versionLimitReached: boolean;
  };
}

/** The pure document with only the parts a case varies. */
function archiveDoc(input: Partial<Parameters<typeof engagementArchiveDocument>[0]>): string {
  return engagementArchiveDocument({
    businessName: "Ortiz Dental",
    engagement: null,
    reviews: [],
    versions: [],
    memberNames: {},
    styles: "",
    ...input,
  });
}

describe("the engagement archive", () => {
  it("pins its section titles, table headers, empty lines, progress text and file name", () => {
    expect([
      ARCHIVE_SECTION_ENGAGEMENT,
      ARCHIVE_SECTION_REVIEWS,
      ARCHIVE_SECTION_VERSIONS,
      ARCHIVE_NO_REVIEWS,
      ARCHIVE_NO_VERSIONS,
      ARCHIVE_FORMER_MEMBER,
      ARCHIVE_RECORDER_UNKNOWN,
    ]).toEqual([
      "Engagement",
      "Monthly review log",
      "Locked report versions",
      "No monthly review results are recorded.",
      "No report version is locked yet.",
      "A former member of the firm",
      "Not recorded",
    ]);
    expect([...ARCHIVE_REVIEW_HEADERS]).toEqual([
      "Period",
      "Check",
      "Result",
      "Notes",
      "Recorded by",
      "Recorded on",
    ]);
    expect(archiveProgressText(2, 5)).toBe("Building the archive: version 2 of 5…");
    expect(archiveVersionLimitNote()).toBe(
      "This archive holds the newest 50 locked versions. Any older locked version is not in it.",
    );
    expect(archiveFileName("Ortiz Dental & Co.")).toBe("ortiz-dental-co-engagement-archive.html");
    expect(archiveFileName("!!!")).toBe("business-engagement-archive.html");
  });

  it("builds one document with the heading, the three sections and every locked version", async () => {
    const { fileName, progress, saved } = await build([version(1, true), version(2, false)]);
    expect(fileName).toBe("ortiz-dental-engagement-archive.html");
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe(fileName);
    const html = saved[0].html;
    expect(progress).toEqual([
      "Building the archive: version 1 of 2…",
      "Building the archive: version 2 of 2…",
    ]);
    // Oldest first, one at a time.
    expect(getReport.mock.calls.map((c) => c[0].data.id)).toEqual(["v1", "v2"]);
    expect(getEngagement).toHaveBeenCalledWith({
      data: { businessId: "biz_1", withReviews: true },
    });

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Engagement archive · Ortiz Dental · Precog</title>");
    expect(html).toContain("<h1>Engagement archive: Ortiz Dental</h1>");
    expect(html).toContain("<h2>Engagement</h2>");
    expect(html).toContain("<h2>Monthly review log</h2>");
    expect(html).toContain("<h2>Locked report versions</h2>");
    expect(html).toContain("<style>.report{color:#111}</style>");

    // The engagement: scope escaped, period, the preparer by name, a reviewer
    // who left the firm named as a former member, the status with its day.
    expect(html).toContain("<td>Duty map &amp; monthly review</td>");
    expect(html).toContain("<td>Jan 1, 2026 to Dec 31, 2026</td>");
    expect(html).toContain('<th scope="row">Preparer</th><td>Ada Park</td>');
    expect(html).toContain('<th scope="row">Reviewer</th><td>A former member of the firm</td>');
    expect(html).toContain('<th scope="row">Status</th><td>Ended on Oct 4, 2026</td>');

    // The review log row: the check by its title, the result with who did the
    // check, the note escaped, and the account that recorded it.
    expect(html).toContain(
      [
        "September 2026",
        "Read the cleared-check images",
        "Exception — Dana",
        "Check 1043 payable to cash &lt;/script&gt;",
        "Ada Park",
        "Oct 2, 2026",
      ]
        .map((cell) => `<td>${cell}</td>`)
        .join(""),
    );

    // One rendered version per locked version. Each prints its provenance
    // line once, in the report's own header, as the version's page prints it.
    expect(html.match(/<article class="archive-version"/g)).toHaveLength(2);
    const printed = html.replace(/<script type="application\/json"[\s\S]*?<\/script>/, "");
    for (const line of [
      "Version 1 · Prepared by Ada Park on Jan 2, 2026 · Reviewed for issuance by Ben Ortiz on Jan 3, 2026",
      "Version 2 · Prepared by Ada Park on Feb 2, 2026 · Not yet reviewed",
    ]) {
      expect(printed.split(line).length - 1).toBe(1);
    }
    expect(html.match(/North Advisors/g)?.length).toBeGreaterThanOrEqual(2);
    // Printed as a share link prints it: no toolbar back into Precog.
    expect(html).not.toContain("Back to Precog");
    // Two versions are a short list: nothing is left out.
    expect(html).not.toContain(archiveVersionLimitNote());
  });

  it("holds the figures in a JSON block, with no live profile and no private notes", async () => {
    const { saved } = await build([version(1, true)]);
    const html = saved[0].html;
    const data = archiveJson(html);
    expect(Object.keys(data)).toEqual(["engagement", "reviews", "versions", "versionLimitReached"]);
    expect(data.engagement).toEqual(engagement);
    expect(data.reviews).toEqual(reviews);
    expect(data.versionLimitReached).toBe(false);
    expect(data.versions).toHaveLength(1);
    expect(Object.keys(data.versions[0])).toEqual([
      "id",
      "versionNo",
      "provenance",
      "firm",
      "model",
    ]);
    expect(data.versions[0].firm).toEqual(version(1, true).firm);
    expect(data.versions[0].model).not.toBeNull();
    // The JSON's own </script> in a note cannot end the block.
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    // No live profile travels: the JSON holds the stored model only, and a
    // version with stored figures renders from the share projection, which
    // drops the business's own notes (the stored model keeps what the lock
    // stored).
    expect(html).not.toContain('"profile"');
    expect(html).not.toContain("customKnowledge");
    const printed = html.replace(/<script[\s\S]*<\/script>/, "");
    expect(printed).toContain("Insurance denial appeals");
    expect(printed).not.toContain(PRIVATE);
  });

  it("prints a version without stored figures as its own page does, from the version's profile", async () => {
    // What a recalculation reads and the share projection drops: a confirmed
    // decision, planned leave and the team the duty conflicts are found in.
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
    const whole: PracticeProfile = {
      ...profile,
      customPeople: team,
      decisions: [
        {
          id: "d1",
          createdAt: "2026-09-20T12:00:00.000Z",
          subject: "Split vendor set-up from payment",
          kind: "remediate",
          note: "Ben keeps paying until the new hire starts in November.",
          reviewBy: "2026-11-15",
          linkedTab: "sod",
          linkedId: "rule-vendor-create-pay",
          linkedIndustry: "dental",
        },
      ],
      plannedAbsences: [
        {
          id: "abs1",
          personId: "b",
          industry: "dental",
          from: "2026-10-10",
          to: "2026-10-17",
          note: "",
        },
      ],
      dualRelease: { ...profile.dualRelease, enabled: !profile.dualRelease.enabled },
    };
    const v = { ...version(1, true), hasFigures: false };
    const page = (p: PracticeProfile) =>
      renderToStaticMarkup(
        <ReadOnlyPracticeProvider profile={p}>
          <ControlReport locked={v} frozen={null} firm={v.firm} coverPage={false} shared />
        </ReadOnlyPracticeProvider>,
      );
    const own = page(whole);
    // The case is real: the projection would print other figures and sections.
    expect(page(shareReportProfile(whole))).not.toBe(own);
    expect(own).toContain("This version was locked before Precog stored its figures.");
    expect(own).toContain("Split vendor set-up from payment");

    const { saved } = await build([v], { frozen: () => null, reportProfile: whole });
    const html = saved[0].html;
    expect(html).toContain(`data-version="1">${own}</article>`);
    expect(archiveJson(html).versions[0].model).toBeNull();
  });

  it("says it may leave out older versions when the list comes back full", async () => {
    // The cap the list the archive reads stops at (reports.ts,
    // listReportVersions, pinned in reports.test.ts).
    expect(REPORT_LIST_LIMIT).toBe(50);

    const quick = { render: () => "<p>printed</p>" };
    const many = (n: number) => Array.from({ length: n }, (_, i) => version(i + 1, false));
    const full = (await build(many(REPORT_LIST_LIMIT), quick)).saved[0].html;
    expect(full).toContain(
      '<h2>Locked report versions</h2>\n<p class="archive-limit">This archive holds the newest 50 locked versions. Any older locked version is not in it.</p>',
    );
    expect(archiveJson(full).versionLimitReached).toBe(true);
    expect(full.match(/<article class="archive-version"/g)).toHaveLength(50);

    const short = (await build(many(REPORT_LIST_LIMIT - 1), quick)).saved[0].html;
    expect(short).not.toContain(archiveVersionLimitNote());
    expect(archiveJson(short).versionLimitReached).toBe(false);
  });

  it("says when nothing is recorded or locked yet", () => {
    const html = archiveDoc({});
    expect(html).toContain("<p>No monthly review results are recorded.</p>");
    expect(html).toContain("<p>No report version is locked yet.</p>");
    expect(html).toContain('<th scope="row">Scope</th><td>Not set</td>');
    expect(html).toContain('<th scope="row">Period</th><td>Not set</td>');
    expect(html).toContain('<th scope="row">Preparer</th><td>Not set</td>');
    expect(html).toContain('<th scope="row">Status</th><td>Active</td>');
    expect(archiveJson(html).versions).toEqual([]);
    expect(archiveJson(html).versionLimitReached).toBe(false);
  });

  it("prints an end with no day, a period open at one end and a blank business name", () => {
    const base: EngagementRecord = {
      scope: "",
      periodStart: null,
      periodEnd: null,
      status: "ended",
      endedAt: null,
      preparerUserId: null,
      reviewerUserId: null,
    };
    const ended = archiveDoc({ businessName: "  ", engagement: base });
    expect(ended).toContain('<th scope="row">Status</th><td>Ended</td>');
    expect(ended).toContain("<title>Engagement archive · Business · Precog</title>");
    expect(ended).toContain("<h1>Engagement archive: Business</h1>");
    expect(archiveDoc({ engagement: { ...base, periodStart: "2026-01-01" } })).toContain(
      "<td>from Jan 1, 2026</td>",
    );
    expect(archiveDoc({ engagement: { ...base, periodEnd: "2026-12-31" } })).toContain(
      "<td>to Dec 31, 2026</td>",
    );
  });

  it("names the recording account only, and who did the check beside the result", () => {
    const html = archiveDoc({
      reviews: [
        // Recorded before Precog kept the recording account, or by one since deleted.
        { ...reviews[0], result: "done", notes: "", ownerName: "Dana", recordedByName: null },
        // Nobody named for the check.
        { ...reviews[0], result: "skipped", notes: "", ownerName: " ", recordedByName: "Ada Park" },
      ],
    });
    expect(html).toContain("<td>Done — Dana</td><td></td><td>Not recorded</td>");
    expect(html).toContain("<td>Skipped</td><td></td><td>Ada Park</td>");
  });

  it("saves nothing when a version fails to load", async () => {
    getEngagement.mockResolvedValue({ firmClient: true, engagement, retentionYears: 7, reviews });
    listReports.mockResolvedValue({ versions: [version(1, true)] });
    getReport.mockReset();
    getReport.mockRejectedValue(new Error("network"));
    const save = vi.fn();
    await expect(
      buildEngagementArchive({
        businessId: "biz_1",
        businessName: "Ortiz Dental",
        memberNames: {},
        render: renderToStaticMarkup,
        styles: () => "",
        save,
      }),
    ).rejects.toThrow("network");
    expect(save).not.toHaveBeenCalled();
  });
});
