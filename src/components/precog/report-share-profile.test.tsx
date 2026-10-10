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
import { UNANSWERED } from "@/lib/precog/onboarding/setup-answers";

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
  reviewOverrideNote: null,
  sentAt: null,
  hasFigures: true,
  firm: { name: "North Advisors", letterhead: "12 Elm St", logoDataUrl: null },
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
  // Cash and payroll are not done here, so the "nobody holds" line leaves
  // their duties out (dutiesOffTeam); the shared page must too.
  setupAnswers: { ...UNANSWERED, cashOrChecks: "no", payroll: "none" },
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
    expect(PRINTED_LAYOUT_VERSIONS).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
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

  it("prints the same report from a map whose processes carry notes, without the notes or past months", () => {
    // The owner's own map: the starter processes, owned by the team, each
    // with a description, risk and idea notes, evidence and systems.
    const processes = industrySample("dental").processes.map((p, i) => ({
      ...p,
      ownerPersonIds: [i % 2 ? "b" : "a"],
      description: `Process note ${i}: bank login kept in the front drawer.`,
      risks: (p.risks ?? []).map((r) => ({ ...r, note: `Risk note ${i}: Maria skips the count.` })),
      ideas: [
        {
          id: `idea${i}`,
          title: `Idea title ${i}`,
          category: "control" as const,
          effort: "low" as const,
          impact: "high" as const,
          note: "Buy a safe.",
          status: "backlog" as const,
        },
      ],
      systems: ["Quokka banking portal"],
      procedureLocation: "Payroll binder, shelf 2",
    }));
    const mapped: PracticeProfile = {
      ...full,
      customProcesses: processes,
      monthlyReviews: [
        // This month's result, an earlier draft of it and a past month: the
        // report prints the first alone (latestReview).
        ...(full.monthlyReviews ?? []),
        { ...full.monthlyReviews![0], notes: "An earlier draft of this month's note." },
        {
          ...full.monthlyReviews![0],
          period: "2026-07",
          notes: "Cash short $400, spoke to Maria.",
        },
      ],
    };
    const projected = shareReportProfile(mapped, locked.preparedAt);
    for (const layout of PRINTED_LAYOUT_VERSIONS) {
      const whole = render(mapped, layout);
      expect(whole).toContain("Two deposits in transit.");
      expect(whole).toMatch(/\d+ risks/);
      expect(render(projected, layout)).toBe(whole);
    }
    const text = JSON.stringify(projected);
    for (const secret of [
      "Process note",
      "bank login",
      "Maria skips",
      "Idea title",
      "Buy a safe",
      "Quokka",
      "Payroll binder",
      "earlier draft",
      "Cash short",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(projected.monthlyReviews).toEqual(full.monthlyReviews);
  });

  it("sends a version without stored figures the month it prints on its UTC lock day alone", () => {
    // Such a version recalculates under the current layout, whose month is
    // the lock's UTC day's (control-report.tsx), whatever the reader's clock:
    // a lock near midnight on the 1st no longer sends the month either side.
    const record = full.monthlyReviews![0];
    const reviews = ["2026-08", "2026-09", "2026-10", "2026-11"].map((period) => ({
      ...record,
      period,
    }));
    const at = (iso: string) =>
      shareReportProfile({ ...full, monthlyReviews: reviews }, iso).monthlyReviews?.map(
        (r) => r.period,
      );
    expect(at("2026-09-26T12:00:00.000Z")).toEqual(["2026-09"]);
    expect(at("2026-10-01T03:00:00.000Z")).toEqual(["2026-09"]);
    expect(at("2026-09-30T22:00:00.000Z")).toEqual(["2026-09"]);
    expect(at("2026-10-11T00:30:00.000Z")).toEqual(["2026-10"]);
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
    expect(projected.monthlyReviews).toEqual(full.monthlyReviews);
    expect(projected.integrationDriftSummary).toBe(full.integrationDriftSummary);
    expect(projected.engagement).toEqual({ reportSentAt: "2026-09-28T12:00:00.000Z" });
    expect(projected.staff).toBe(full.staff);
    expect(projected.setupAnswers).toEqual(full.setupAnswers);
  });

  it('prints the same "nobody holds" line as the firm\'s view, from the setup answers', () => {
    // Nobody on the team reconciles the bank: the answers say an outside
    // bookkeeper does, so the line leaves that duty out.
    const outside: PracticeProfile = {
      ...full,
      customPeople: team.map((p) =>
        p.id === "b" ? { ...p, entitlements: ["enter_invoices", "release_payment"] } : p,
      ),
      setupAnswers: { ...UNANSWERED, bankRec: "outside" },
    };
    const frozen = {
      layoutVersion: 3,
      model: serializeReportModel(buildReportModelForProfile(outside, "2026-09-26")),
    };
    const page = (profile: PracticeProfile) =>
      renderToStaticMarkup(
        <ReadOnlyPracticeProvider profile={profile}>
          <ControlReport locked={locked} frozen={frozen} firm={locked.firm} shared />
        </ReadOnlyPracticeProvider>,
      );
    const line = (html: string) =>
      html.match(/The register marks nobody still working here for: ([^.]*)\./)?.[1] ?? "";
    const firmView = page(outside);
    expect(line(page({ ...outside, setupAnswers: undefined }))).toMatch(/reconcile/i);
    expect(line(firmView)).not.toMatch(/reconcile/i);
    expect(line(firmView)).not.toBe("");
    expect(page(shareReportProfile(outside, locked.preparedAt))).toBe(firmView);
  });

  it("carries each setup answer as its fixed choice, and nothing typed beside them", () => {
    const typed = {
      ...full,
      setupAnswers: {
        ...full.setupAnswers,
        bankRec: "Ada at home on Sundays",
        note: "Ben's surgery; keep it between us.",
      },
    } as unknown as PracticeProfile;
    const projected = shareReportProfile(typed);
    expect(Object.keys(projected.setupAnswers ?? {}).sort()).toEqual(
      Object.keys(UNANSWERED).sort(),
    );
    expect(projected.setupAnswers?.bankRec).toBe("unsure");
    expect(projected.setupAnswers?.payroll).toBe("none");
    const text = JSON.stringify(projected);
    expect(text).not.toContain("Ada at home");
    expect(text).not.toContain("keep it between us");
  });
});
