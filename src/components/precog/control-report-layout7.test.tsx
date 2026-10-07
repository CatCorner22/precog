import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CONTROL_CONFIRM_TAB } from "@/lib/precog/active-template";
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
