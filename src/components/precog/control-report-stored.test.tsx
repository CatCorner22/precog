import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ControlReport } from "./control-report";
import { largeBusinessProfile } from "@/test/large-business";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import { INDUSTRIES } from "@/lib/precog/industry";
import {
  defaultProfile,
  normalizeProfile,
  type PracticeProfile,
} from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import type { ControlReportModel } from "@/lib/precog/report/build-control-report";
import {
  buildReportModelForProfile,
  freezeReport,
  REPORT_LAYOUT_VERSION,
  type StoredReportModel,
} from "@/lib/precog/report/stored-model";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const DAY = "2026-09-26";

const locked: ReportVersionRow = {
  id: "v1",
  businessId: "b1",
  versionNo: 1,
  revision: null,
  scopeNote: "",
  preparedBy: null,
  preparedByName: "Ada Park",
  preparedAt: `${DAY}T12:00:00.000Z`,
  reviewedBy: null,
  reviewedByName: null,
  reviewedAt: null,
  reviewNote: "",
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

/** A locked version printing `model` as stored figures. */
const renderLocked = (profile: PracticeProfile, model: StoredReportModel) =>
  renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <ControlReport locked={locked} frozen={{ layoutVersion: REPORT_LAYOUT_VERSION, model }} />
    </ReadOnlyPracticeProvider>,
  );

/**
 * The model as a lock stored it before Precog slimmed it: every person with
 * all their fields and every suggested stand-in, each object in full.
 */
function storedInFull(raw: unknown): StoredReportModel {
  let built: ControlReportModel | undefined;
  freezeReport(raw, DAY, (profile, today) => (built = buildReportModelForProfile(profile, today)));
  const model = built!;
  return JSON.parse(
    JSON.stringify({
      ...model,
      committed: [...model.committed.entries()],
      partialCoverage: [...model.partialCoverage.entries()],
    }),
  ) as StoredReportModel;
}

/** The model a lock stores today, as it reads back from the database. */
function storedNow(raw: unknown): StoredReportModel {
  return JSON.parse(JSON.stringify(freezeReport(raw, DAY).model)) as StoredReportModel;
}

describe("a locked version prints the same report from either stored shape", () => {
  it.each(INDUSTRIES.map((industry) => industry.id))("%s sample", (industry) => {
    const profile = defaultProfile(industry);
    const full = renderLocked(profile, storedInFull(profile));
    expect(full).not.toContain("Figures recalculated");
    expect(renderLocked(profile, storedNow(profile))).toBe(full);
  });

  it("an own team of 20 people with 120 register items and 100 procedures", () => {
    const raw = largeBusinessProfile({ people: 20, register: 120, procedures: 100 });
    const profile = normalizeProfile(raw as Partial<PracticeProfile>);
    const full = renderLocked(profile, storedInFull(raw));
    expect(full).toContain("Train next:");
    expect(renderLocked(profile, storedNow(raw))).toBe(full);
  });

  // RW1-3: teams this size could not lock at all; the stored model now packs
  // the duty-conflict rows, and the page printed from it must not change.
  it.each([
    { people: 250, register: 120, procedures: 100 },
    { people: 400, register: 10, procedures: 10 },
    { people: 1000, register: 120, procedures: 100 },
  ])(
    "an own team of $people people with $register register items",
    (size) => {
      const raw = largeBusinessProfile(size);
      const profile = normalizeProfile(raw as Partial<PracticeProfile>);
      const full = renderLocked(profile, storedInFull(raw));
      expect(full).toContain("Duties held together");
      expect(full).toContain("Contingency cards");
      expect(renderLocked(profile, storedNow(raw))).toBe(full);
    },
    60_000,
  );
});
