import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import type { ReviewRecord } from "@/lib/precog/firm/reviews";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { freezeReport } from "@/lib/precog/report/stored-model";
import { shareReportProfile } from "@/lib/precog/share/report-share-profile";
import { ControlReport } from "./control-report";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

/**
 * Contract tests added before changing projection or rendering. Run the
 * failing cases as ordinary tests, never test.fails or skipped tests.
 * The real renderer, frozen model and public projection remain unmocked.
 */
function inTimezone<T>(zone: string, read: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return read();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

function precedingMonth(month: string): string {
  const day = new Date(`${month}-01T12:00:00Z`);
  day.setUTCMonth(day.getUTCMonth() - 1);
  return day.toISOString().slice(0, 7);
}

function fixture(preparedAt: string, preparerDay: string) {
  const current = preparerDay.slice(0, 7);
  const previous = precedingMonth(current);
  const record = (period: string, result: ReviewRecord["result"], notes: string): ReviewRecord => ({
    key: "bank_statement",
    period,
    result,
    ownerName: `${period} reviewer`,
    notes,
    recordedAt: preparedAt,
  });
  const profile: PracticeProfile = {
    ...defaultProfile("dental"),
    practiceName: "Report scope fixture",
    businessId: "b1",
    monthlyReviews: [
      record(current, "exception", `LATEST_${current}`),
      record(current, "done", `OLDER_${current}`),
      record(previous, "done", `LATEST_${previous}`),
      record(previous, "exception", `OLDER_${previous}`),
      record(precedingMonth(previous), "done", "PRIVATE_OUT_OF_SCOPE_NOTES"),
    ],
  };
  const locked: ReportVersionRow = {
    id: "scope-v1",
    businessId: "b1",
    versionNo: 1,
    revision: 4,
    scopeNote: "",
    preparedBy: "preparer",
    preparedByName: "Preparer",
    preparedAt,
    reviewedBy: "reviewer",
    reviewedByName: "Reviewer",
    reviewedAt: preparedAt,
    reviewNote: "",
    reviewOverrideNote: null,
    sentAt: null,
    hasFigures: true,
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
  // The preparer's explicit calendar day is passed to the real lock-time
  // freezer once. A viewer cannot choose a new reporting month afterwards.
  const frozen = freezeReport(profile, preparerDay);
  expect(frozen.model, "fixture must contain stored figures").not.toBeNull();
  expect(frozen.layoutVersion).toBe(5);
  return { profile, locked, frozen, current, previous };
}

type Fixture = ReturnType<typeof fixture>;
const render = (entry: Fixture, profile = entry.profile) =>
  renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <ControlReport locked={entry.locked} frozen={entry.frozen} shared />
    </ReadOnlyPracticeProvider>,
  );

/** Compare the actual monthly section, not unrelated date labels or UI controls. */
function monthlySection(html: string): string {
  const heading = /<h2\b[^>]*>Monthly review[^<]*<\/h2>/.exec(html);
  expect(heading, "report must contain its monthly section").not.toBeNull();
  const start = heading!.index;
  const end = html.indexOf("</section>", start);
  expect(end).toBeGreaterThan(start);
  return html
    .slice(start, end)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("locked-report timezone and public-profile parity", () => {
  it("runs against genuinely different viewer timezone offsets and restores TZ", () => {
    const original = process.env.TZ;
    const at = new Date("2026-10-11T02:00:00Z");
    expect(inTimezone("America/New_York", () => at.getTimezoneOffset())).toBe(240);
    expect(inTimezone("UTC", () => at.getTimezoneOffset())).toBe(0);
    expect(inTimezone("Pacific/Kiritimati", () => at.getTimezoneOffset())).toBe(-840);
    expect(inTimezone("Pacific/Honolulu", () => at.getTimezoneOffset())).toBe(600);
    expect(process.env.TZ).toBe(original);
  });

  it.each(["UTC", "Europe/London", "Pacific/Kiritimati", "Pacific/Honolulu"])(
    "keeps the preparer's frozen monthly scope for a viewer in %s",
    (zone) => {
      // October 10 in New York, but October 11 in UTC and UTC+14.
      const entry = fixture("2026-10-11T02:00:00Z", "2026-10-10");
      const prepared = inTimezone("America/New_York", () => monthlySection(render(entry)));
      expect(prepared).toContain("LATEST_2026-09");
      expect(prepared).not.toContain("LATEST_2026-10");
      expect(inTimezone(zone, () => monthlySection(render(entry)))).toBe(prepared);
    },
  );

  it.each([
    { day: "2026-10-01", selected: "2026-09" },
    { day: "2026-10-06", selected: "2026-09" },
    { day: "2026-10-10", selected: "2026-09" },
    { day: "2026-10-11", selected: "2026-10" },
    { day: "2027-01-06", selected: "2026-12" },
  ])(
    "prints the same selected-period results internally and publicly for $day",
    ({ day, selected }) =>
      inTimezone("UTC", () => {
        const entry = fixture(`${day}T12:00:00Z`, day);
        // Pass preparedAt as the actual public-link path does. An archive
        // projection without it would conceal the regression.
        const projected = shareReportProfile(entry.profile, entry.locked.preparedAt);
        const internal = monthlySection(render(entry));
        const publicly = monthlySection(render(entry, projected));
        expect(internal).toContain(`LATEST_${selected}`);
        expect(internal).not.toContain("OLDER_");
        expect(publicly).toBe(internal);
      }),
  );

  it("keeps a public report timezone-stable as well as equal to the preparer's report", () => {
    const entry = fixture("2026-10-11T02:00:00Z", "2026-10-10");
    const projected = shareReportProfile(entry.profile, entry.locked.preparedAt);
    const prepared = inTimezone("America/New_York", () => monthlySection(render(entry)));
    expect(prepared).toContain("LATEST_2026-09");
    for (const zone of ["America/New_York", "UTC", "Pacific/Kiritimati", "Pacific/Honolulu"]) {
      expect(
        inTimezone(zone, () => monthlySection(render(entry, projected))),
        zone,
      ).toBe(prepared);
    }
  });

  it("keeps only the latest in-scope public result, not old drafts or unrelated months", () => {
    const entry = fixture("2026-10-20T12:00:00Z", "2026-10-20");
    const projected = shareReportProfile(entry.profile, entry.locked.preparedAt);
    expect(projected.monthlyReviews).toEqual([entry.profile.monthlyReviews![0]]);
    const data = JSON.stringify(projected);
    expect(data).not.toContain("OLDER_");
    expect(data).not.toContain("PRIVATE_OUT_OF_SCOPE_NOTES");
  });

  it("preserves layout 4's original calendar-month behavior", () =>
    inTimezone("UTC", () => {
      const entry = fixture("2026-10-06T12:00:00Z", "2026-10-06");
      const historical = { ...entry, frozen: { ...entry.frozen, layoutVersion: 4 } };
      const projected = shareReportProfile(entry.profile, entry.locked.preparedAt);
      const internal = monthlySection(render(historical));
      expect(internal).toContain("LATEST_2026-10");
      expect(internal).not.toContain("LATEST_2026-09");
      expect(monthlySection(render(historical, projected))).toBe(internal);
    }));

  it("preserves dated acceptance status publicly without exposing the private decision", () =>
    inTimezone("UTC", () => {
      const entry = fixture("2026-10-20T12:00:00Z", "2026-10-20");
      const profile: PracticeProfile = {
        ...entry.profile,
        decisions: [
          {
            id: "accept-vendor-pair",
            createdAt: "2026-09-20T12:00:00Z",
            subject: "Accept vendor setup and payment",
            kind: "accept_residual",
            note: "PRIVATE_DECISION_NOTE",
            linkedTab: "sod",
            linkedId: "rule-vendor-create-pay",
            linkedIndustry: "dental",
          },
        ],
      };
      const accepted = { ...entry, profile, frozen: freezeReport(profile, "2026-10-20") };
      const projected = shareReportProfile(profile, entry.locked.preparedAt);
      expect(projected.decisions).toEqual([]);
      expect(JSON.stringify(projected)).not.toContain("PRIVATE_DECISION_NOTE");
      const internal = render(accepted);
      const publicly = render(accepted, projected);
      expect(internal).toContain("Open, risk accepted on Sep 20, 2026");
      const statuses = (html: string) => html.match(/Open, risk accepted on Sep 20, 2026/g) ?? [];
      expect(statuses(publicly)).toEqual(statuses(internal));
    }));
});
