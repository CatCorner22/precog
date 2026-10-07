import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import type { Person } from "@/lib/precog/types";
import {
  buildReportModelForProfile,
  printsLayoutSix,
  serializeReportModel,
} from "@/lib/precog/report/stored-model";
import { ControlReport } from "./control-report";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const locked: ReportVersionRow = {
  id: "v1",
  businessId: "b1",
  versionNo: 1,
  revision: null,
  scopeNote: "",
  preparedBy: null,
  preparedByName: "Dana Wells",
  preparedAt: "2026-09-26T12:00:00.000Z",
  reviewedBy: null,
  reviewedByName: null,
  reviewedAt: null,
  reviewNote: "",
  reviewOverrideNote: null,
  sentAt: null,
  hasFigures: false,
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

const DUTIES: Person["entitlements"][] = [
  ["approve_payroll", "sign_checks"],
  ["enter_invoices", "release_payment", "bank_reconcile"],
  ["collect_cash", "post_payments"],
];

/**
 * Dana's office: twelve active people she entered herself, one who has left,
 * the starter map with nobody assigned, and the "3" setup left in `staff`.
 */
const dana: PracticeProfile = (() => {
  const base = defaultProfile("dental");
  const people: Person[] = Array.from({ length: 13 }, (_, i) => ({
    id: `wells-${i}`,
    name: `Person ${i}`,
    role: i === 0 ? "Owner" : "Front desk",
    active: i < 12,
    owner: i === 0 ? true : undefined,
    entitlements: DUTIES[i % DUTIES.length] ?? [],
  }));
  return {
    ...base,
    practiceName: "Wells Family Dental",
    onboardingComplete: true,
    staff: { ...base.staff, teamSize: 3 },
    customPeople: people,
  };
})();

const live = (profile: PracticeProfile) =>
  renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <ControlReport locked={locked} />
    </ReadOnlyPracticeProvider>,
  );

const storedUnder = (profile: PracticeProfile, layoutVersion: number) =>
  renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <ControlReport
        locked={locked}
        frozen={{
          layoutVersion,
          model: serializeReportModel(buildReportModelForProfile(profile, "2026-09-26")),
        }}
      />
    </ReadOnlyPracticeProvider>,
  );

/** The report's text with its tags as single bars. */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, "|")
    .replace(/\|+/g, "|")
    .replace(/&#x27;/g, "'");

const between = (text: string, from: string, to: string) => {
  const start = text.indexOf(from);
  expect(start, from).toBeGreaterThanOrEqual(0);
  return text.slice(start, text.indexOf(to, start));
};

describe("report layout 6", () => {
  it("is printed from layout 6 on, not by versions locked under layouts 1 to 5", () => {
    expect([1, 2, 3, 4, 5].map(printsLayoutSix)).toEqual([false, false, false, false, false]);
    expect(printsLayoutSix(6)).toBe(true);
  });

  it("prints versions locked under layout 6 as layout 6 printed them", () => {
    const text = textOf(storedUnder(dana, 6));
    expect(text).toContain(
      "|Dental office · 12-person practice · starter process map (not yet edited) · generated",
    );
    expect(text).toContain(
      "|Starter process map from the dental office template, not yet edited: 8 processes, none with an owner yet.",
    );
    expect(text).toContain("This does not mean you are uninsured..|");
  });

  it("names the people mapped, not a team size, and the starter map as Precog's example (layout 7)", () => {
    const text = textOf(live(dana));
    expect(text).toContain(
      "|Dental office · 12 people mapped · Precog's example dental office processes, not yet edited · generated",
    );
    expect(text).not.toContain("-person");
    expect(text).not.toContain("sample process map");
    expect(text).not.toContain("starter process map");
    expect(text).toContain(
      "|Precog's example dental office processes, not this business's own map yet: 8 processes, none with an owner yet.",
    );
  });

  it("adds the headcount the owner gave at setup", () => {
    const band = {
      ...dana,
      onboardingFacts: { schemaVersion: 1 as const, workforceBand: "7-30" as const },
    };
    expect(textOf(live(band))).toContain(
      "|Dental office · 12 people mapped (setup: 7–30 people) · Precog's example",
    );
    const counted = {
      ...dana,
      onboardingFacts: {
        schemaVersion: 1 as const,
        workforceBand: "7-30" as const,
        workforceCount: 14,
      },
    };
    expect(textOf(live(counted))).toContain(
      "|Dental office · 12 people mapped (setup: 14 people) ·",
    );
    const one = { ...dana, customPeople: dana.customPeople!.slice(0, 1) };
    expect(textOf(live(one))).toContain("|Dental office · 1 person mapped ·");
  });

  it("says so when the owner's own team has nobody active on it", () => {
    const empty = { ...dana, customPeople: [] };
    expect(textOf(live(empty))).toContain("|Dental office · nobody mapped yet ·");
  });

  it("ends the insurance sentence with one full stop", () => {
    const text = textOf(live(dana));
    expect(text).toContain(
      "|Insurance: Nobody has assessed insurance, so Precog models no recovery. This does not mean you are uninsured.|",
    );
    expect(text).not.toContain("uninsured..");
  });

  it("keeps the sample's own size on the sample", () => {
    const text = textOf(live(defaultProfile("dental")));
    expect(text).toContain("|Dental office · 6-person practice · industry template map");
  });

  it("counts the segregation sentence as the executive summary counts it", () => {
    for (const profile of [defaultProfile("dental"), dana]) {
      const text = textOf(live(profile));
      const summary = between(text, "|Executive summary|", "|Map completeness|");
      const open = /\|(\d+) open duty conflicts?, /.exec(summary)?.[1];
      expect(open).toBeDefined();
      const section = between(text, "|Segregation of duties|", "|Person|");
      expect(section).toMatch(
        new RegExp(
          `^\\|Segregation of duties\\|${open} open duty conflicts?: \\d+ critical, \\d+ high, \\d+ medium, \\d+ related duties, held by \\d+ of \\d+ people\\.`,
        ),
      );
      expect(section).not.toMatch(/\d+ critical, \d+ high, \d+ medium open conflicts across/);
    }
  });

  it("prints the residual tile in the residual band words", () => {
    const text = textOf(live(defaultProfile("dental")));
    expect(between(text, "|Severe on the residual index|", "|Duty separation|")).toBe(
      "|Severe on the residual index|5|Residual 80 or more · 9 high · 6 moderate",
    );
    expect(text).not.toContain("Fix first on the residual index");
  });

  it("prints a version locked under layout 5 exactly as before", () => {
    const text = textOf(storedUnder(dana, 5));
    expect(text).toContain("|Dental office · 3-person practice · sample process map · generated");
    expect(text).toContain("|Sample process map from the dental office sample:");
    expect(text).not.toContain("not yet edited");
    expect(text).not.toContain("Precog's example");
    // Layout 5 keeps the double full stop it printed.
    expect(text).toContain("This does not mean you are uninsured..|");
    expect(text).toMatch(
      /\|Segregation of duties\|\d+ critical, \d+ high, \d+ medium open conflicts across \d+ of 12 people\. \d+ covered by dual release at every amount\./,
    );
    const sample = textOf(storedUnder(defaultProfile("dental"), 5));
    expect(sample).toContain(
      "|Fix first on the residual index|5|Residual 80 or more · 9 fix soon · 6 worth doing|",
    );
    expect(sample).not.toContain("Severe on the residual index");
  });
});

describe("another problem in the report's monthly section", () => {
  const DONATION = "A family's mailed donation check never reached the bank";
  const withProblem: PracticeProfile = {
    ...dana,
    monthlyReviews: [
      {
        key: "other_problem",
        period: "2026-09",
        result: "exception",
        ownerName: "Priya",
        notes: DONATION,
        recordedAt: "2026-09-25T15:00:00.000Z",
      },
      {
        key: "bank_statement",
        period: "2026-09",
        result: "done",
        ownerName: "Priya",
        notes: "",
        recordedAt: "2026-09-24T15:00:00.000Z",
      },
    ],
  };
  const monthly = (text: string) => between(text, "|Monthly review|", "|Priority stack|");

  it("prints nothing new in versions locked under layout 6", () => {
    expect(monthly(textOf(storedUnder(withProblem, 6)))).not.toContain(DONATION);
  });

  it("prints each problem as its own line under layout 7, after the checks", () => {
    const section = monthly(textOf(live(withProblem)));
    expect(section).toContain("|Open the bank statement: Done — Priya|");
    expect(section).toContain("|Read the cleared-check images: not recorded|");
    expect(section).toMatch(
      /\|Review vendors added or changed: not recorded\|Another problem: Exception — Priya: A family(&#x27;|')s mailed donation check never reached the bank$/,
    );
  });

  it("prints a version locked under layout 5 exactly as before", () => {
    const before = monthly(
      textOf(
        storedUnder({ ...withProblem, monthlyReviews: withProblem.monthlyReviews!.slice(1) }, 5),
      ),
    );
    const after = monthly(textOf(storedUnder(withProblem, 5)));
    expect(after).toBe(before);
    expect(after).not.toContain("Another problem");
    expect(after).toContain("|Open the bank statement: Done — Priya|");
  });
});

describe("a locked version's executive summary and steps", () => {
  it("prints the words stored under layout 5, not the step as Precog names it now", () => {
    const model = buildReportModelForProfile(defaultProfile("general"), "2026-09-26");
    const catalog =
      "Move any single duty out of the concentrated role — even just the bank reconciliation";
    const stored = {
      ...model,
      summary: model.summary.map((line) =>
        line.startsWith("First step: ") ? `First step: ${catalog}.` : line,
      ),
      steps: model.steps.map((step, i) =>
        i === 0 ? { ...step, control: { ...step.control, label: catalog } } : step,
      ),
    };
    const text = textOf(
      renderToStaticMarkup(
        <ReadOnlyPracticeProvider profile={defaultProfile("general")}>
          <ControlReport
            locked={locked}
            frozen={{ layoutVersion: 5, model: serializeReportModel(stored) }}
          />
        </ReadOnlyPracticeProvider>,
      ),
    );
    expect(model.summary.some((line) => line.startsWith("First step: "))).toBe(true);
    expect(text).toContain(`|First step: ${catalog}.|`);
    expect(text).toContain(catalog);
    expect(text).not.toContain(model.steps[0]!.control.label);
  });
});

describe("report on a phone", () => {
  /** Every opening tag in `html` whose class list holds `token`. */
  const tagsWith = (html: string, token: string) =>
    [...html.matchAll(/<([a-z0-9]+)\b[^>]*\bclass="([^"]*)"/g)].filter(([, , cls]) =>
      cls!.split(/\s+/).includes(token),
    );

  it("stacks the duty-conflict rows below the sm width and keeps the table for sm and print", () => {
    const html = live(defaultProfile("dental"));
    const tables = [...html.matchAll(/<table\b[^>]*>/g)].map((m) => ({
      tag: m[0],
      wrapped: /<div class="[^"]*\boverflow-x-auto\b[^"]*">\s*$/.test(html.slice(0, m.index)),
    }));
    expect(tables.length).toBeGreaterThan(0);
    // No table is wider than the screen below sm: it scrolls in its own box
    // or does not show there at all.
    for (const t of tables) {
      const hiddenOnPhone = /\bhidden\b/.test(t.tag) && /\bsm:table\b/.test(t.tag);
      expect(t.wrapped || hiddenOnPhone, t.tag).toBe(true);
    }
    const conflictTable = tables.find((t) => /\bsm:table\b/.test(t.tag));
    expect(conflictTable?.tag).toMatch(/\bprint:table\b/);
    // The stacked rows show on a phone only, never in print.
    const stacked = tagsWith(html, "sm:hidden");
    expect(stacked).toHaveLength(1);
    expect(stacked[0]![2]).toMatch(/\bprint:hidden\b/);
    const start = html.indexOf(stacked[0]![0]);
    const rows = textOf(html.slice(start, html.indexOf("</ul>", start)));
    const model = buildReportModelForProfile(defaultProfile("dental"), "2026-09-26");
    for (const c of model.sod.conflicts) expect(rows).toContain(c.personName);
    expect(rows).toContain("Severity: Critical");
    expect(rows).toContain("Response: No decision yet");
  });
});
