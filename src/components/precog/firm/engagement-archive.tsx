import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { RouterContextProvider, type AnyRouter } from "@tanstack/react-router";
import { ControlReport } from "@/components/precog/control-report";
import { downloadText } from "@/lib/download";
import { formatDay, formatMonth, localDateKey } from "@/lib/precog/dates";
import type { EngagementRecord } from "@/lib/precog/firm/engagement-row";
import type { ReviewLogRow } from "@/lib/precog/firm/engagement-store";
import { getEngagement } from "@/lib/precog/firm/engagement-server";
import { REVIEW_ITEMS, RESULT_LABEL, isReviewResult } from "@/lib/precog/firm/reviews";
import { versionProvenance, type ReportVersionRow } from "@/lib/precog/firm/reports";
import { getReport, listReports } from "@/lib/precog/firm/server";
import type { FirmSnapshot } from "@/lib/precog/firm/store";
import type { PracticeProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { lockedFigures, type FrozenReport } from "@/lib/precog/report/stored-model";
import { shareReportProfile } from "@/lib/precog/share/report-share-profile";
import { slug } from "@/lib/precog/text";

/**
 * The end-of-engagement archive, built in the browser on demand (no stored
 * copy): one self-contained HTML file holding the engagement, the monthly
 * review log and every locked version as it prints, with the figures and
 * firm snapshot of each version in a JSON block for a machine to read. Each
 * version renders through the same `ControlReport` the version's own page
 * uses, with the firm as frozen at lock and no toolbar, so it prints the
 * figures Precog prints for that version (see `archiveReportElement`).
 * Lazy-loaded from the Engagement block, so the report code reaches the
 * firm page only on click.
 */

export const ARCHIVE_SECTION_ENGAGEMENT = "Engagement";
export const ARCHIVE_SECTION_REVIEWS = "Monthly review log";
export const ARCHIVE_SECTION_VERSIONS = "Locked report versions";
export const ARCHIVE_NO_REVIEWS = "No monthly review results are recorded.";
export const ARCHIVE_NO_VERSIONS = "No report version is locked yet.";
/** A preparer or reviewer the engagement names who is no longer among the firm's members. */
export const ARCHIVE_FORMER_MEMBER = "A former member of the firm";
/** "Recorded by" for a result whose recording account is unknown (before 0015, or deleted). */
export const ARCHIVE_RECORDER_UNKNOWN = "Not recorded";

/**
 * The most versions `listReports` returns, newest first (`listReportVersions`
 * in reports.ts, `limit 50`). An archive that receives this many cannot tell
 * whether older ones exist, so it says it may leave them out.
 */
export const REPORT_LIST_LIMIT = 50;

/** "This archive holds the newest 50 locked versions. Any older locked version is not in it." */
export function archiveVersionLimitNote(limit: number = REPORT_LIST_LIMIT): string {
  return `This archive holds the newest ${limit} locked versions. Any older locked version is not in it.`;
}
export const ARCHIVE_REVIEW_HEADERS = [
  "Period",
  "Check",
  "Result",
  "Notes",
  "Recorded by",
  "Recorded on",
] as const;

/** "Building the archive: version 2 of 5…" */
export function archiveProgressText(index: number, total: number): string {
  return `Building the archive: version ${index} of ${total}…`;
}

export function archiveFileName(businessName: string): string {
  return `${slug(businessName) || "business"}-engagement-archive.html`;
}

/** One locked version as the archive holds it. */
export interface ArchiveVersion {
  version: ReportVersionRow;
  frozen: Pick<FrozenReport, "layoutVersion" | "model"> | null;
  firm: FirmSnapshot | null;
  /** The version's printed markup. */
  markup: string;
}

export interface ArchiveInput {
  businessName: string;
  engagement: EngagementRecord | null;
  reviews: readonly ReviewLogRow[];
  versions: readonly ArchiveVersion[];
  /**
   * True when the version list came back full (`REPORT_LIST_LIMIT`), so
   * older versions may be missing; the archive then says so, in print and
   * in the JSON block.
   */
  versionLimitReached?: boolean;
  /** Names of the firm's current members by user id, for the preparer and reviewer. */
  memberNames: Readonly<Record<string, string>>;
  /** The page's stylesheet text, inlined so the file prints as the report does. */
  styles: string;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** JSON that cannot close the script element it sits in. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

const CHECK_TITLE = new Map<string, string>(REVIEW_ITEMS.map((i) => [i.key, i.title]));

function engagementRows(
  e: EngagementRecord | null,
  names: Readonly<Record<string, string>>,
): [string, string][] {
  const record = e ?? {
    scope: "",
    periodStart: null,
    periodEnd: null,
    status: "active" as const,
    endedAt: null,
    preparerUserId: null,
    reviewerUserId: null,
  };
  // An id with no current member is someone who left the firm; a deleted
  // account's id is already null (the column is `on delete set null`).
  const person = (id: string | null) => (id ? (names[id] ?? ARCHIVE_FORMER_MEMBER) : "Not set");
  const from = record.periodStart ? formatDay(record.periodStart) : null;
  const to = record.periodEnd ? formatDay(record.periodEnd) : null;
  const period =
    from && to ? `${from} to ${to}` : from ? `from ${from}` : to ? `to ${to}` : "Not set";
  return [
    ["Scope", record.scope.trim() || "Not set"],
    ["Period", period],
    ["Preparer", person(record.preparerUserId)],
    ["Reviewer", person(record.reviewerUserId)],
    [
      "Status",
      record.status === "ended"
        ? record.endedAt
          ? `Ended on ${formatDay(record.endedAt)}`
          : "Ended"
        : "Active",
    ],
  ];
}

/**
 * The result and who did the check, as Precog's own review line names them
 * ("Exception — Dana"); the note has its own column.
 */
function resultCell(r: Pick<ReviewLogRow, "result" | "ownerName">): string {
  const label = isReviewResult(r.result) ? RESULT_LABEL[r.result] : r.result;
  const owner = r.ownerName.trim();
  return owner ? `${label} — ${owner}` : label;
}

/** The archive as one HTML document. Pure, so it is tested without a browser. */
export function engagementArchiveDocument(input: ArchiveInput): string {
  const business = input.businessName.trim() || "Business";
  const engagement = engagementRows(input.engagement, input.memberNames)
    .map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join("");
  const reviews = input.reviews.length
    ? `<table class="archive-table"><thead><tr>${ARCHIVE_REVIEW_HEADERS.map(
        (h) => `<th scope="col">${esc(h)}</th>`,
      ).join("")}</tr></thead><tbody>${input.reviews
        .map((r) =>
          [
            formatMonth(r.period),
            CHECK_TITLE.get(r.itemKey) ?? r.itemKey,
            resultCell(r),
            r.notes,
            // The account that recorded it, never the person who did the check.
            r.recordedByName ?? ARCHIVE_RECORDER_UNKNOWN,
            formatDay(r.recordedAt),
          ]
            .map((cell) => `<td>${esc(cell)}</td>`)
            .join(""),
        )
        .map((cells) => `<tr>${cells}</tr>`)
        .join("")}</tbody></table>`
    : `<p>${esc(ARCHIVE_NO_REVIEWS)}</p>`;
  const versions = input.versions.length
    ? input.versions
        .map(
          (v) =>
            `<article class="archive-version" data-version="${v.version.versionNo}"><p class="archive-provenance">${esc(
              versionProvenance(v.version),
            )}</p>${v.markup}</article>`,
        )
        .join("")
    : `<p>${esc(ARCHIVE_NO_VERSIONS)}</p>`;
  const limitReached = input.versionLimitReached ?? false;
  const data = {
    engagement: input.engagement,
    reviews: input.reviews,
    versions: input.versions.map((v) => ({
      id: v.version.id,
      versionNo: v.version.versionNo,
      provenance: versionProvenance(v.version),
      firm: v.firm,
      model: v.frozen?.model ?? null,
    })),
    // True when the list stopped at the newest REPORT_LIST_LIMIT versions,
    // so any older locked version is not in `versions`.
    versionLimitReached: limitReached,
  };
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Engagement archive · ${esc(business)} · Precog</title>`,
    `<style>${input.styles.replace(/<\/style/gi, "<\\/style")}</style>`,
    // After the page's sheets, so a dark theme or Preflight's reset headings never reach the archive.
    "<style>:root,html,body{color-scheme:light;background:#fff;color:#171717;margin:0}",
    ".archive-head h1{font-size:1.5rem;font-weight:700;margin:0 0 1rem}",
    ".archive-head h2{font-size:1.125rem;font-weight:600;margin:1.5rem 0 .5rem}",
    ".archive-head p{margin:.5rem 0;font-size:.875rem}",
    ".archive-head{max-width:56rem;margin:2rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif;color:#171717}",
    ".archive-head table{border-collapse:collapse;width:100%;font-size:.875rem}",
    ".archive-head th,.archive-head td{border:1px solid #d4d4d4;padding:.35rem .5rem;text-align:left;vertical-align:top}",
    ".archive-version{break-before:page;border-top:2px solid #d4d4d4;margin-top:2rem}",
    ".archive-provenance{max-width:56rem;margin:1rem auto;padding:0 1.5rem;font:600 .875rem system-ui,sans-serif}</style>",
    "</head><body>",
    '<div class="archive-head">',
    `<h1>Engagement archive: ${esc(business)}</h1>`,
    `<h2>${esc(ARCHIVE_SECTION_ENGAGEMENT)}</h2><table><tbody>${engagement}</tbody></table>`,
    `<h2>${esc(ARCHIVE_SECTION_REVIEWS)}</h2>${reviews}`,
    `<h2>${esc(ARCHIVE_SECTION_VERSIONS)}</h2>`,
    limitReached ? `<p class="archive-limit">${esc(archiveVersionLimitNote())}</p>` : "",
    "</div>",
    versions,
    `<script type="application/json" id="precog-archive">${scriptJson(data)}</script>`,
    "</body></html>",
  ].join("\n");
}

/** Renders a report into a detached node and returns its markup. */
export function renderDetached(element: ReactElement): string {
  const node = document.createElement("div");
  let failure: unknown = null;
  const root = createRoot(node, {
    onUncaughtError: (err) => {
      failure = err;
    },
  });
  try {
    flushSync(() => root.render(element));
    if (failure) throw failure;
    return node.innerHTML;
  } finally {
    root.unmount();
  }
}

/** The text of every same-origin stylesheet on the page; a cross-origin one is skipped. */
function pageStyles(): string {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) out.push(rule.cssText);
    } catch {
      // A cross-origin sheet (a web font) cannot be read; the archive keeps the rest.
    }
  }
  return out.join("\n");
}

/**
 * The profile a version renders under in the archive. A version with usable
 * stored figures prints its stored model, and the share projection prints
 * the same page (pinned in report-share-profile.test.tsx) while keeping the
 * business's own notes out of the render. A version without them (locked
 * before Precog stored figures, locked without them, or stored for another
 * layout) recalculates from the profile, and the projection has dropped what
 * that reads (decisions, risk settings, dual release, planned leave), so it
 * renders under the version's own profile, as its page in Precog does.
 */
export function archiveProfileFor(
  frozen: ArchiveVersion["frozen"],
  profile: PracticeProfile,
): PracticeProfile {
  return "model" in lockedFigures(frozen) ? shareReportProfile(profile) : profile;
}

/**
 * One locked version as it prints, under a read-only provider over
 * `archiveProfileFor`. The detached root sits outside the page's router, so
 * the page's router is handed in for the report's links (a sample business
 * prints one).
 */
export function archiveReportElement(
  v: Pick<ArchiveVersion, "version" | "frozen" | "firm">,
  profile: PracticeProfile,
  router: AnyRouter | null = null,
): ReactElement {
  const report = (
    <ReadOnlyPracticeProvider profile={archiveProfileFor(v.frozen, profile)}>
      <ControlReport locked={v.version} frozen={v.frozen} firm={v.firm} coverPage={false} shared />
    </ReadOnlyPracticeProvider>
  );
  return router ? <RouterContextProvider router={router}>{report}</RouterContextProvider> : report;
}

export interface BuildArchiveOptions {
  businessId: string;
  businessName: string;
  memberNames: Readonly<Record<string, string>>;
  /** The page's router, for the links inside a rendered report. */
  router?: AnyRouter | null;
  /** Called before each version renders, with its 1-based place. */
  onProgress?: (index: number, total: number) => void;
  /** Overrides for the test: render, styles and the download. */
  render?: (element: ReactElement) => string;
  styles?: () => string;
  save?: (fileName: string, html: string) => void;
}

/**
 * Loads the engagement, the review log and every locked version `listReports`
 * returns (one at a time, oldest first; at most the newest
 * `REPORT_LIST_LIMIT`, and the archive says so when the list is full),
 * renders each and downloads the archive. Throws when a load or a render
 * fails; nothing is saved then.
 */
export async function buildEngagementArchive(opts: BuildArchiveOptions): Promise<string> {
  const render = opts.render ?? renderDetached;
  const [engagementRes, listRes] = await Promise.all([
    getEngagement({ data: { businessId: opts.businessId, withReviews: true } }),
    listReports({ data: { businessId: opts.businessId } }),
  ]);
  // A full list may stop short of the oldest versions; the archive says so.
  const versionLimitReached = listRes.versions.length >= REPORT_LIST_LIMIT;
  const rows = [...listRes.versions].sort((a, b) => a.versionNo - b.versionNo);
  const today = localDateKey(new Date());
  const versions: ArchiveVersion[] = [];
  for (const [i, row] of rows.entries()) {
    opts.onProgress?.(i + 1, rows.length);
    const res = await getReport({ data: { id: row.id, today } });
    const loaded = { version: res.version, frozen: res.frozen, firm: res.firm };
    versions.push({
      ...loaded,
      markup: render(archiveReportElement(loaded, res.profile, opts.router ?? null)),
    });
  }
  const html = engagementArchiveDocument({
    businessName: opts.businessName,
    engagement: engagementRes.engagement,
    reviews: engagementRes.reviews ?? [],
    versions,
    versionLimitReached,
    memberNames: opts.memberNames,
    styles: (opts.styles ?? pageStyles)(),
  });
  const fileName = archiveFileName(opts.businessName);
  (opts.save ?? ((name, text) => downloadText(name, text, "text/html;charset=utf-8")))(
    fileName,
    html,
  );
  return fileName;
}
