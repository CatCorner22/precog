import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CONTROL_CONFIRM_TAB } from "@/lib/precog/active-template";
import { ONBOARDING_FACTS_VERSION } from "@/lib/precog/onboarding/decision-model";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { shareReportProfile } from "@/lib/precog/share/report-share-profile";
import type { Person } from "@/lib/precog/types";
import {
  buildReportModelForProfile,
  printsLayoutSeven,
  serializeReportModel,
} from "@/lib/precog/report/stored-model";
import { ControlReport } from "./control-report";
import { archiveProfileFor } from "./firm/engagement-archive";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const locked = {
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
} as ReportVersionRow;

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
const own: PracticeProfile = {
  ...defaultProfile("dental"),
  practiceName: "Ortiz Dental Studio",
  customPeople: team,
};
const starter = getIndustryTemplate("dental").processes;
/** An own map whose first process has an owner; the other seven are as Precog's example had them. */
const partial: PracticeProfile = {
  ...own,
  customProcesses: starter.map((p, i) => (i === 0 ? { ...p, ownerPersonIds: ["b"] } : p)),
};
const empty: PracticeProfile = { ...own, customProcesses: [] };

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, "|")
    .replace(/\|+/g, "|")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");

const live = (profile: PracticeProfile) =>
  textOf(
    renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={profile}>
        <ControlReport locked={locked} />
      </ReadOnlyPracticeProvider>,
    ),
  );

const storedUnder = (
  profile: PracticeProfile,
  layoutVersion: number,
  printedFrom: PracticeProfile = profile,
) =>
  textOf(
    renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={printedFrom}>
        <ControlReport
          locked={locked}
          frozen={{
            layoutVersion,
            model: serializeReportModel(buildReportModelForProfile(profile, "2026-09-26")),
          }}
        />
      </ReadOnlyPracticeProvider>,
    ),
  );

const between = (text: string, from: string, to: string) => {
  const start = text.indexOf(from);
  expect(start, from).toBeGreaterThanOrEqual(0);
  return text.slice(start, text.indexOf(to, start));
};

const EXAMPLE_CONTROL = "Precog's example, not confirmed by the owner";

describe("report layout 7", () => {
  it("is printed from layout 7 on, not by versions locked under layouts 1 to 6", () => {
    expect([1, 2, 3, 4, 5, 6].map(printsLayoutSeven)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(printsLayoutSeven(7)).toBe(true);
  });

  it("says no process is mapped where the map is empty, as the map tile does", () => {
    const text = live(empty);
    expect(text).toContain(
      "|Dental office · 2 people mapped · no processes mapped yet · generated",
    );
    expect(text).not.toContain("custom process map");
    expect(text).toContain("|Map completeness|—|Not assessed yet|");
    expect(text).toContain("Your map has no processes yet.");
  });

  it("counts the processes still Precog's examples on an own map and marks each", () => {
    const text = live(partial);
    expect(text).toContain(
      "|Dental office · 2 people mapped · custom process map (7 of 8 still Precog's examples) · generated",
    );
    const map = between(text, "|Process map|", "|Decisions log|");
    expect(map.match(/ · Precog's example, not yet edited/g)).toHaveLength(7);
    expect(map).toContain(`|${starter[0]!.name}| · `);
    expect(map).not.toContain(`|${starter[0]!.name}| · Precog's example`);
  });

  it("marks each control the owner never confirmed in the priority stack", () => {
    const stack = between(live(own), "|Priority stack|", "|Segregation of duties|");
    expect(stack).toContain(`|Payroll approval|${EXAMPLE_CONTROL}|Control|`);
    expect(stack).toContain(`|Split duties: claims adjustments|${EXAMPLE_CONTROL}|Control|`);
    const confirmed: PracticeProfile = {
      ...own,
      decisions: [
        {
          id: "confirm-payroll",
          createdAt: "2026-09-20T12:00:00.000Z",
          subject: "Payroll approval",
          kind: "monitor",
          note: "This runs here",
          linkedTab: CONTROL_CONFIRM_TAB,
          linkedId: "c-payroll",
          linkedIndustry: "dental",
        },
      ],
    };
    const after = between(live(confirmed), "|Priority stack|", "|Segregation of duties|");
    expect(after).toContain("|Payroll approval|Control|");
    expect(after).toContain(`|Split duties: claims adjustments|${EXAMPLE_CONTROL}|Control|`);
  });

  it("marks nothing on the sample business", () => {
    const text = live(defaultProfile("dental"));
    expect(text).not.toContain(EXAMPLE_CONTROL);
    expect(text).not.toContain("Precog's example, not yet edited");
  });

  it("prints versions locked under layout 6 exactly as before", () => {
    expect(storedUnder(empty, 6)).toContain(
      "|Dental office · 2-person practice · custom process map · generated",
    );
    const six = storedUnder(partial, 6);
    expect(six).toContain("|Dental office · 2-person practice · custom process map · generated");
    expect(six).not.toContain("Precog's example, not yet edited");
    expect(storedUnder(own, 6)).not.toContain(EXAMPLE_CONTROL);
    expect(storedUnder(own, 7)).toContain(EXAMPLE_CONTROL);
  });

  it("marks the same examples on a shared copy, which carries no journal or process text", () => {
    for (const profile of [partial, own]) {
      const whole = storedUnder(profile, 7);
      expect(storedUnder(profile, 7, shareReportProfile(profile))).toBe(whole);
    }
    expect(storedUnder(partial, 7)).toContain("Precog's example, not yet edited");
    expect(storedUnder(own, 7)).toContain(EXAMPLE_CONTROL);
  });
});

describe("layout 7's setup headcount in the header", () => {
  // Ortiz Dental Studio answered "7–30 people" at setup and mapped two.
  const sized: PracticeProfile = {
    ...own,
    onboardingFacts: {
      schemaVersion: ONBOARDING_FACTS_VERSION,
      actor: "business_leader",
      workforceBand: "7-30",
      locationBand: "2-5",
      mappingScope: "one_location",
    },
  };
  const HEADER = "|Dental office · 2 people mapped (setup: 7–30 people) · ";
  const modelOf = (profile: PracticeProfile) =>
    serializeReportModel(buildReportModelForProfile(profile, "2026-09-26"));

  it("prints the same header on the owner's copy, the share link and the firm's archive", () => {
    for (const layout of [7, 8]) {
      const whole = storedUnder(sized, layout);
      expect(whole).toContain(HEADER);
      expect(storedUnder(sized, layout, shareReportProfile(sized))).toBe(whole);
      const frozen = { layoutVersion: layout, model: modelOf(sized) };
      expect(storedUnder(sized, layout, archiveProfileFor(frozen, sized))).toBe(whole);
    }
  });

  it("stores the headcount with the model, so a locked version keeps the one it was locked with", () => {
    expect(buildReportModelForProfile(sized, "2026-09-26").setupHeadcount).toEqual({
      workforceBand: "7-30",
    });
    expect(buildReportModelForProfile(own, "2026-09-26").setupHeadcount).toBeNull();
    const grown: PracticeProfile = {
      ...sized,
      onboardingFacts: { ...sized.onboardingFacts!, workforceBand: "31-60", workforceCount: 40 },
    };
    expect(live(grown)).toContain("|Dental office · 2 people mapped (setup: 40 people) · ");
    // Locked while the answer was 7–30: the version prints that, whatever the profile says now.
    expect(storedUnder(sized, 7, grown)).toContain(HEADER);
    expect(storedUnder(sized, 7, shareReportProfile(grown))).toContain(HEADER);
  });

  it("reads the profile's headcount for a version locked before Precog stored it, as it did then", () => {
    const { setupHeadcount: _unstored, ...before } = modelOf(sized);
    expect(_unstored).toEqual({ workforceBand: "7-30" });
    const page = (printedFrom: PracticeProfile) =>
      textOf(
        renderToStaticMarkup(
          <ReadOnlyPracticeProvider profile={printedFrom}>
            <ControlReport locked={locked} frozen={{ layoutVersion: 7, model: before }} />
          </ReadOnlyPracticeProvider>,
        ),
      );
    expect(page(sized)).toContain(HEADER);
    expect(page(shareReportProfile(sized))).toBe(page(sized));
    expect(page(own)).toContain("|Dental office · 2 people mapped · ");
  });

  it("prints no setup part for a business that gave no headcount, on any copy", () => {
    expect(storedUnder(own, 7)).not.toContain("(setup:");
    expect(storedUnder(own, 7, shareReportProfile(own))).toBe(storedUnder(own, 7));
  });
});
