import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import type { KnowledgeItem, Person } from "@/lib/precog/types";
import { industrySample } from "@/lib/precog/templates/registry";
import {
  buildReportModelForProfile,
  PRINTED_LAYOUT_VERSIONS,
  serializeReportModel,
} from "@/lib/precog/report/stored-model";
import { ControlReport } from "@/components/precog/control-report";
import { shareReportProfile } from "@/lib/precog/share/report-share-profile";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const locked: ReportVersionRow = {
  id: "v1",
  businessId: "b1",
  versionNo: 2,
  revision: 4,
  scopeNote: "Money duties as mapped in September.",
  preparedBy: "ada",
  preparedByName: "Ada Park",
  preparedAt: "2026-09-26T12:00:00.000Z",
  reviewedBy: "ben",
  reviewedByName: "Ben Ortiz",
  reviewedAt: "2026-09-27T12:00:00.000Z",
  reviewNote: "",
  sentAt: null,
  hasFigures: true,
  firm: { name: "North Advisors", letterhead: "12 Elm St", logoDataUrl: null },
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
    // The roster's own columns and a notice period: the leaving section
    // prints the last day from the stored model, not from the profile.
    employeeId: "EMP-0042",
    department: "Front office",
    tenureYears: 6,
    lastDay: "2026-10-30",
  },
];

/**
 * The industry's starter register with one location written on it: the
 * only edit, so whether the report tracks freshness turns on that field
 * alone (register-state.ts, itemContent).
 */
const register: KnowledgeItem[] = industrySample("dental").knowledge.map((item, i) =>
  i === 0
    ? {
        ...item,
        description: "Ada keeps the bank token in the top drawer.",
        procedureLocation: "Shared drive > Finance > Bank binder",
      }
    : item,
);

/**
 * A business with everything a firm's client writes for itself: its own
 * team, a register with a location, a journal with notes, planned leave, a
 * leaver check, a written procedure, a place, review results and a
 * books-versus-map reading.
 */
const full: PracticeProfile = {
  ...defaultProfile("dental"),
  practiceName: "Ortiz Dental Studio",
  businessId: "b1",
  customPeople: team,
  customKnowledge: register,
  mapLayout: { p1: { x: 10, y: 20 } },
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
      note: "Ben's surgery; keep it between us.",
    },
  ],
  leaverAccessChecks: [
    {
      id: "lv1",
      name: "Cora Lee",
      role: "Hygienist",
      industry: "dental",
      notedOn: "2026-09-01",
      source: "marked",
    },
  ],
  places: [{ id: "pl1", name: "QuickBooks Online", kind: "software" }],
  procedures: [
    {
      id: "proc1",
      industry: "dental",
      title: "Reconcile the operating account",
      prerequisites: ["Bank login (Ada holds it)"],
      steps: [{ id: "s1", text: "Open Banking and choose the operating account." }],
      knowledgeIds: [],
      processIds: [],
      backupPersonIds: ["a"],
      reviewEveryDays: 90,
      version: 1,
      changelog: [],
      proofs: [],
      createdAt: "2026-09-01",
      updatedAt: "2026-09-01",
    },
  ],
  monthlyReviews: [
    {
      key: "bank_statement",
      period: "2026-09",
      result: "done",
      ownerName: "Ada Park",
      notes: "Two deposits in transit.",
      recordedAt: "2026-09-26T12:00:00.000Z",
    },
  ],
  integrationDriftSummary: {
    updatedAt: "2026-09-26T12:00:00.000Z",
    source: "quickbooks",
    headline: "1 employee(s) in the books but not on your map",
    qboEmployeesNotOnMap: 1,
    qboPeopleNotInBooks: 0,
    qboVendorsAdded: 0,
    accessPending: 0,
  },
  engagement: { reportSentAt: "2026-09-28T12:00:00.000Z" },
};

const frozenFor = (layoutVersion: number) => ({
  layoutVersion,
  model: serializeReportModel(buildReportModelForProfile(full, "2026-09-26")),
});

const render = (profile: PracticeProfile, layoutVersion: number) =>
  renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <ControlReport locked={locked} frozen={frozenFor(layoutVersion)} firm={locked.firm} shared />
    </ReadOnlyPracticeProvider>,
  );

describe("shareReportProfile", () => {
  it("prints the same report as the full profile under every printed layout", () => {
    expect(PRINTED_LAYOUT_VERSIONS).toEqual([1, 2, 3]);
    const projected = shareReportProfile(full);
    for (const layout of PRINTED_LAYOUT_VERSIONS) {
      const whole = render(full, layout);
      expect(whole).toContain("Ortiz Dental Studio");
      // The branches the projection has to keep alive: the leaving section
      // (from the stored model) and the freshness line (from the register).
      expect(whole).toContain("last day");
      expect(whole).toContain("of work has a confirmation from the last");
      expect(render(projected, layout)).toBe(whole);
    }
  });

  it("drops what the report never prints: the journal, leave, leaver checks, places, procedures and roster columns", () => {
    const projected = shareReportProfile(full);
    expect(projected).not.toHaveProperty("notes");
    expect(projected.decisions).toEqual([]);
    expect(projected.plannedAbsences).toEqual([]);
    expect(projected).not.toHaveProperty("leaverAccessChecks");
    expect(projected).not.toHaveProperty("places");
    expect(projected).not.toHaveProperty("procedures");
    expect(projected).not.toHaveProperty("accessReconciliation");
    const text = JSON.stringify(projected);
    for (const secret of [
      "keep it between us",
      "Cora Lee",
      "Reconcile the operating account",
      "Bank login",
      "QuickBooks Online",
      "new hire starts in November",
      // The roster's columns and the notice period on a person.
      "EMP-0042",
      "Front office",
      "tenureYears",
      "2026-10-30",
      // A register item's description.
      "top drawer",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("keeps a register item's location, which decides whether freshness is tracked", () => {
    const projected = shareReportProfile(full);
    expect(projected.customKnowledge?.[0]).toEqual({
      ...industrySample("dental").knowledge[0],
      description: "",
      procedureLocation: "Shared drive > Finance > Bank binder",
    });
    // Without the location the list would read as the untouched starter list.
    const withoutLocation = shareReportProfile({
      ...full,
      customKnowledge: register.map((item) => {
        const { procedureLocation: _dropped, ...rest } = item;
        return rest;
      }),
    });
    expect(render(withoutLocation, 3)).not.toContain("of work has a confirmation from the last");
  });

  it("keeps what the report reads: the name, team, map, reviews, reading and stamps", () => {
    const projected = shareReportProfile(full);
    expect(projected.practiceName).toBe("Ortiz Dental Studio");
    expect(projected.businessId).toBe("b1");
    expect(projected.industry).toBe("dental");
    expect(projected.customPeople).toEqual([
      team[0],
      {
        id: "b",
        name: "Ben Ortiz",
        role: "Bookkeeper",
        active: true,
        entitlements: ["enter_invoices", "release_payment", "bank_reconcile"],
      },
    ]);
    expect(projected.mapLayout).toEqual({ p1: { x: 10, y: 20 } });
    expect(projected.monthlyReviews).toBe(full.monthlyReviews);
    expect(projected.integrationDriftSummary).toBe(full.integrationDriftSummary);
    expect(projected.engagement).toEqual({ reportSentAt: "2026-09-28T12:00:00.000Z" });
    expect(projected.staff).toBe(full.staff);
  });
});
