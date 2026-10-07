import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ControlReport } from "./control-report";
import { resolveTemplate } from "@/lib/precog/active-template";
import { ownSetupProfile } from "@/lib/precog/business-lifecycle";
import { cardDecision } from "@/lib/precog/decisions/not-valid";
import { normalizeProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { buildReportModelForProfile } from "@/lib/precog/report/stored-model";
import type { Person } from "@/lib/precog/types";
import { UNANSWERED, type SetupAnswers } from "@/lib/precog/onboarding/setup-answers";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const STATEMENT = "The owner opens and reads the bank statement each month (answered at setup).";
const OUTSIDE =
  "An outside bookkeeper or CPA reconciles the bank account each month (answered at setup).";

/** Bayside Dental as Dana set it up: Lisa pays the bills and reconciles the bank. */
const PEOPLE: Person[] = [
  {
    id: "own-dana",
    name: "Dana Reyes",
    role: "Owner",
    active: true,
    owner: true,
    entitlements: ["approve_payroll", "sign_checks"],
  },
  {
    id: "own-lisa",
    name: "Lisa Park",
    role: "Office Manager",
    active: true,
    entitlements: ["release_payment", "bank_reconcile", "enter_invoices", "create_vendor"],
  },
  {
    id: "own-carmen",
    name: "Carmen Ruiz",
    role: "Front desk",
    active: true,
    entitlements: ["collect_cash", "post_payments", "prepare_deposit"],
  },
];

const ANSWERS: SetupAnswers = { ...UNANSWERED, ownerReadsStatement: "yes" };

function bayside(answers: SetupAnswers = ANSWERS): PracticeProfile {
  return ownSetupProfile({
    industry: "dental",
    practiceName: "Bayside Dental",
    people: PEOPLE,
    answers,
  });
}

const textOf = (html: string) => html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");

describe("an own business built through setup", () => {
  it("starts with no decisions, whatever the money answers say", () => {
    expect(bayside().decisions).toEqual([]);
    expect(bayside({ ...ANSWERS, bankRec: "outside" }).decisions).toEqual([]);
  });

  it("still credits the controls the owner said are in place", () => {
    const tpl = resolveTemplate(bayside({ ...ANSWERS, bankRec: "outside" }));
    const cash = tpl.controls.find((c) => c.id === "c-sod-cash");
    const ap = tpl.controls.find((c) => c.id === "c-sod-ap");
    expect(cash?.compensatingControls).toEqual(expect.arrayContaining([OUTSIDE, STATEMENT]));
    expect(ap?.compensatingControls).toEqual(expect.arrayContaining([STATEMENT]));
  });

  it("shows no decision on any conflict card and prints No decision yet for each", () => {
    const profile = bayside();
    const model = buildReportModelForProfile(profile, "2026-10-07");
    expect(model.sod.conflicts.length).toBeGreaterThan(0);
    for (const c of model.sod.conflicts) {
      expect(cardDecision(c, profile.decisions, profile.industry).decision).toBeNull();
    }
    expect(model.responses.byConflict).toEqual({});
    const text = textOf(
      renderToStaticMarkup(
        <ReadOnlyPracticeProvider profile={profile}>
          <ControlReport />
        </ReadOnlyPracticeProvider>,
      ),
    );
    expect(text).not.toContain("Watch it");
    const rows = text.split("|No decision yet|").length - 1;
    expect(rows).toBeGreaterThanOrEqual(model.sod.conflicts.length);
  });
});

describe("a stored own business that holds the entries setup used to log", () => {
  /** The two entries setup logged for "the owner reads the statement", as stored. */
  function seeded(note = STATEMENT, extra: Partial<PracticeProfile["decisions"][number]> = {}) {
    return (["c-sod-cash", "c-sod-ap"] as const).map((linkedId, i) => ({
      id: `dec-${i}`,
      createdAt: "2026-10-07T15:00:00.000Z",
      subject: `In place: ${linkedId}`,
      kind: "monitor" as const,
      note,
      reviewBy: "2027-01-05",
      linkedTab: "control-in-place",
      linkedId,
      linkedIndustry: "dental" as const,
      ...extra,
    }));
  }
  const stored = (decisions: unknown[], answers: SetupAnswers | null = ANSWERS) =>
    normalizeProfile(
      JSON.parse(JSON.stringify({ ...bayside(), setupAnswers: answers ?? undefined, decisions })),
    );

  it("drops them on load, and the controls keep the same credit", () => {
    const before = resolveTemplate({ ...bayside(), decisions: seeded() });
    const restored = stored(seeded());
    expect(restored.decisions).toEqual([]);
    const after = resolveTemplate(restored);
    for (const id of ["c-sod-cash", "c-sod-ap"]) {
      expect(after.controls.find((c) => c.id === id)?.compensatingControls).toEqual(
        before.controls.find((c) => c.id === id)?.compensatingControls,
      );
    }
  });

  it("keeps an entry the owner wrote, reviewed or that the answers no longer give", () => {
    expect(stored(seeded("Dana reads the statement every month.")).decisions).toHaveLength(2);
    expect(
      stored(
        seeded(STATEMENT, {
          reviews: [
            {
              at: "2026-11-01T00:00:00.000Z",
              outcome: "still_open",
              snapshot: {
                at: "2026-11-01T00:00:00.000Z",
                scoringVersion: "x",
                averageResidual: 1,
                sodOpenConflicts: 1,
                segregationHealth: 1,
              },
            },
          ],
        }),
      ).decisions,
    ).toHaveLength(2);
    expect(stored(seeded(), { ...UNANSWERED }).decisions).toHaveLength(2);
    expect(stored(seeded(), null).decisions).toHaveLength(2);
  });
});
