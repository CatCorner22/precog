import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import type { EngagementRecord } from "@/lib/precog/firm/engagement-row";
import type { ReviewLogRow } from "@/lib/precog/firm/engagement-store";
import { industrySample } from "@/lib/precog/templates/registry";
import {
  buildReportModelForProfile,
  REPORT_LAYOUT_VERSION,
  serializeReportModel,
} from "@/lib/precog/report/stored-model";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const getEngagement = vi.fn();
const listReports = vi.fn();
const getReport = vi.fn();
vi.mock("@/lib/precog/firm/engagement-server", () => ({ getEngagement }));
vi.mock("@/lib/precog/firm/server", () => ({ getReport, listReports }));

const {
  ARCHIVE_NO_REVIEWS,
  ARCHIVE_NO_VERSIONS,
  ARCHIVE_REVIEW_HEADERS,
  ARCHIVE_SECTION_ENGAGEMENT,
  ARCHIVE_SECTION_REVIEWS,
  ARCHIVE_SECTION_VERSIONS,
  archiveFileName,
  archiveProgressText,
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

function version(no: number, reviewed: boolean): ReportVersionRow {
  return {
    id: `v${no}`,
    businessId: "biz_1",
    versionNo: no,
    revision: null,
    scopeNote: "",
    preparedBy: "pre",
    preparedByName: "Ada Park",
    preparedAt: `2026-0${no}-02T12:00:00.000Z`,
    reviewedBy: reviewed ? "rev" : null,
    reviewedByName: reviewed ? "Ben Ortiz" : null,
    reviewedAt: reviewed ? `2026-0${no}-03T12:00:00.000Z` : null,
    reviewNote: "",
    sentAt: null,
    hasFigures: true,
    firm: { name: "North Advisors", letterhead: "12 Elm St", logoDataUrl: null },
    engagement: { scope: "Duty map", periodStart: "2026-01-01", periodEnd: "2026-12-31" },
  };
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

/** Builds the archive with the server calls answered from these fixtures. */
async function build(versions: ReportVersionRow[]) {
  getEngagement.mockResolvedValue({
    firmClient: true,
    engagement,
    retentionYears: 7,
    reviews,
  });
  // Newest first, as the server lists them.
  listReports.mockResolvedValue({ versions: [...versions].reverse() });
  const model = serializeReportModel(buildReportModelForProfile(profile, "2026-09-26"));
  getReport.mockImplementation(async ({ data }: { data: { id: string } }) => {
    const v = versions.find((x) => x.id === data.id)!;
    return {
      version: v,
      frozen: { scoringVersion: "x", layoutVersion: REPORT_LAYOUT_VERSION, model },
      firm: v.firm,
      coverPage: true,
      profile,
    };
  });
  const progress: string[] = [];
  const saved: { name: string; html: string }[] = [];
  const fileName = await buildEngagementArchive({
    businessId: "biz_1",
    businessName: "Ortiz Dental",
    memberNames: { pre: "Ada Park", rev: "Ben Ortiz" },
    onProgress: (i, n) => progress.push(archiveProgressText(i, n)),
    render: renderToStaticMarkup,
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
  };
}

describe("the engagement archive", () => {
  it("pins its section titles, table headers, empty lines, progress text and file name", () => {
    expect([
      ARCHIVE_SECTION_ENGAGEMENT,
      ARCHIVE_SECTION_REVIEWS,
      ARCHIVE_SECTION_VERSIONS,
      ARCHIVE_NO_REVIEWS,
      ARCHIVE_NO_VERSIONS,
    ]).toEqual([
      "Engagement",
      "Monthly review log",
      "Locked report versions",
      "No monthly review results are recorded.",
      "No report version is locked yet.",
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
    // who left the firm as not set, the status with its day.
    expect(html).toContain("<td>Duty map &amp; monthly review</td>");
    expect(html).toContain("<td>Jan 1, 2026 to Dec 31, 2026</td>");
    expect(html).toContain('<th scope="row">Preparer</th><td>Ada Park</td>');
    expect(html).toContain('<th scope="row">Reviewer</th><td>Not set</td>');
    expect(html).toContain('<th scope="row">Status</th><td>Ended on Oct 4, 2026</td>');

    // The review log row, the check by its title and the note escaped.
    for (const cell of [
      "September 2026",
      "Read the cleared-check images",
      "Exception",
      "Check 1043 payable to cash &lt;/script&gt;",
      "Ada Park",
      "Oct 2, 2026",
    ]) {
      expect(html).toContain(`<td>${cell}</td>`);
    }

    // One rendered version per locked version, each after its provenance line.
    expect(html.match(/<article class="archive-version"/g)).toHaveLength(2);
    expect(html).toContain(
      '<p class="archive-provenance">Version 1 · Prepared by Ada Park on Jan 2, 2026 · Reviewed for issuance by Ben Ortiz on Jan 3, 2026</p>',
    );
    expect(html).toContain(
      '<p class="archive-provenance">Version 2 · Prepared by Ada Park on Feb 2, 2026 · Not yet reviewed</p>',
    );
    expect(html.match(/North Advisors/g)?.length).toBeGreaterThanOrEqual(2);
    // Printed as a share link prints it: no toolbar back into Precog.
    expect(html).not.toContain("Back to Precog");
  });

  it("holds the figures in a JSON block, with no live profile and no private notes", async () => {
    const { saved } = await build([version(1, true)]);
    const html = saved[0].html;
    const data = archiveJson(html);
    expect(Object.keys(data)).toEqual(["engagement", "reviews", "versions"]);
    expect(data.engagement).toEqual(engagement);
    expect(data.reviews).toEqual(reviews);
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
    // No live profile travels: the JSON holds the stored model only, and the
    // printed versions render from the share projection, which drops the
    // business's own notes (the stored model keeps what the lock stored).
    expect(html).not.toContain('"profile"');
    expect(html).not.toContain("customKnowledge");
    const printed = html.replace(/<script[\s\S]*<\/script>/, "");
    expect(printed).toContain("Insurance denial appeals");
    expect(printed).not.toContain(PRIVATE);
  });

  it("says when nothing is recorded or locked yet", () => {
    const html = engagementArchiveDocument({
      businessName: "Ortiz Dental",
      engagement: null,
      reviews: [],
      versions: [],
      memberNames: {},
      styles: "",
    });
    expect(html).toContain("<p>No monthly review results are recorded.</p>");
    expect(html).toContain("<p>No report version is locked yet.</p>");
    expect(html).toContain('<th scope="row">Scope</th><td>Not set</td>');
    expect(html).toContain('<th scope="row">Period</th><td>Not set</td>');
    expect(html).toContain('<th scope="row">Status</th><td>Active</td>');
    expect(archiveJson(html).versions).toEqual([]);
  });

  it("saves nothing when a version fails to load", async () => {
    getEngagement.mockResolvedValue({ firmClient: true, engagement, retentionYears: 7, reviews });
    listReports.mockResolvedValue({ versions: [version(1, true)] });
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
