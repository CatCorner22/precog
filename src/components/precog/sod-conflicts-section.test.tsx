import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { INDUSTRIES } from "@/lib/precog/industry";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { libraryRows, procedureFromLibrary } from "@/lib/precog/procedures/library";
import { procedureForConflict } from "@/lib/precog/procedures/rule-procedures";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import { buildStartHereModel } from "@/lib/precog/start-here/model";
import { ownSetupProfile } from "@/lib/precog/business-lifecycle";
import { UNANSWERED } from "@/lib/precog/onboarding/setup-answers";
import type { Person } from "@/lib/precog/types";
import { SodPanel } from "./sod-panel";
import { StartHereFirstStepsSection } from "./start-here-first-steps-section";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const render = (profile: PracticeProfile) =>
  renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <SodPanel initialView="conflicts" onNavigate={() => {}} />
    </ReadOnlyPracticeProvider>,
  );

/** The What to do first box's items, as text. */
const boxItems = (page: string) => {
  const box = page.split('data-box="what-to-do-first"')[1]?.split("</ul>")[0] ?? "";
  return [...box.matchAll(/<li[^>]*>((?:(?!<\/li>).)*)<\/li>/g)].map((m) =>
    m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/^· /, ""),
  );
};

describe("a duty-conflict card's written procedure", () => {
  const profile: PracticeProfile = { ...defaultProfile("general"), procedures: [] };
  const tpl = resolveTemplate(profile);
  const conflicts = detectSodConflicts(
    tpl,
    profile.staff,
    sodDetectionOptions(tpl, profile.dualRelease),
  ).conflicts;

  it("names the procedure for the pair on each card", () => {
    expect(conflicts.length).toBeGreaterThan(0);
    const page = render(profile);
    const first = procedureForConflict(conflicts[0].ruleId)!;
    expect(page).toContain(`Written procedure: ${first.title}`);
    expect(page.match(/Written procedure: /g)?.length).toBeGreaterThan(0);
  });

  it("names the business's own procedure once it is started", () => {
    const first = procedureForConflict(conflicts[0].ruleId)!;
    const row = libraryRows(tpl, [], profile.industry).find(
      (r) => r.recommendation.id === first.id,
    )!;
    const started = { ...procedureFromLibrary(row, profile.industry, "2026-10-01"), title: "Ours" };
    expect(render({ ...profile, procedures: [started] })).toContain("Written procedure: Ours");
  });
});

describe("the duty-conflict list under the open count", () => {
  // A team with open pairs, the owner's own pairs (p6) and pairs dual release
  // covers at every amount (p4; dual release is off, so no threshold applies).
  const profile: PracticeProfile = { ...defaultProfile("general"), procedures: [] };
  const tpl = resolveTemplate(profile);
  const detected = detectSodConflicts(
    tpl,
    profile.staff,
    sodDetectionOptions(tpl, profile.dualRelease),
  );
  const report = {
    ...detected,
    conflicts: detected.conflicts.map((c) =>
      c.personId === "p6"
        ? { ...c, ownerHeld: true }
        : c.personId === "p4"
          ? { ...c, dualReleaseMitigated: true }
          : c,
    ),
  };
  const ownerHeld = report.conflicts.filter((c) => c.ownerHeld).length;
  const covered = report.conflicts.filter((c) => c.dualReleaseMitigated).length;
  const page = renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <SodPanel initialView="conflicts" onNavigate={() => {}} report={report} />
    </ReadOnlyPracticeProvider>,
  );
  /** The conflicts each person's heading counts, added up, in one stretch of the page. */
  const cardsIn = (html: string) =>
    [...html.matchAll(/ · (\d+) conflicts?<\/span><\/h3>/g)].reduce((n, m) => n + Number(m[1]), 0);
  const [before, rest = ""] = page.split('data-list="not-open"');
  const openList = before.split('data-list="open"')[1] ?? "";

  it("lists exactly the open findings the sub-tab counts", () => {
    expect(ownerHeld).toBeGreaterThan(0);
    expect(covered).toBeGreaterThan(0);
    const counted = Number(/Duty conflicts \((\d+)\)/.exec(page)![1]);
    expect(counted).toBe(report.conflicts.length - ownerHeld - covered);
    expect(cardsIn(openList)).toBe(counted);
  });

  it("puts the owner's own pairs and the fully covered pairs in a folded group below", () => {
    expect(rest).toContain(
      `Not counted as open (${ownerHeld + covered}): your own pairs and pairs dual release covers at every amount`,
    );
    expect(cardsIn(rest)).toBe(ownerHeld + covered);
    // Folded: the group is closed until the owner opens it.
    expect(rest.slice(0, rest.indexOf(">"))).not.toMatch(/\bopen\b/);
  });
});

describe("duty-conflict controls on a touch screen", () => {
  it("makes the severity chips and the written-procedure links 44px tall", () => {
    const page = render({ ...defaultProfile("general"), procedures: [] });
    const group = page
      .split('aria-label="Show duty conflicts of one severity"')[1]
      .split("</div>")[0];
    const chips = [...group.matchAll(/<button[^>]*class="([^"]*)"/g)];
    expect(chips).toHaveLength(5);
    for (const chip of chips) expect(chip[1].split(" ")).toContain("pointer-coarse:min-h-11");
    const links = [
      ...page.matchAll(/<button[^>]*class="([^"]*)"[^>]*>(?:(?!<\/button>).)*Written procedure: /g),
    ];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link[1].split(" ")).toContain("pointer-coarse:min-h-11");
  });
});

describe("the What to do first box", () => {
  it.each(INDUSTRIES.map((i) => i.id))(
    "%s sample: leads with the first step Start here lists",
    (industry) => {
      const profile: PracticeProfile = { ...defaultProfile(industry), procedures: [] };
      const template = resolveTemplate(profile);
      const { firstLine } = buildStartHereModel({
        profile,
        template,
        today: new Date(2026, 8, 26),
      }).firstSteps;
      expect(firstLine).toBeTruthy();
      const items = boxItems(render(profile));
      expect(items[0]).toBe(`First, as on Start here: ${firstLine}`);
      // No later line names a different first move.
      expect(items.slice(1).join(" ")).not.toMatch(/\bStart by\b|\bfirst\b/i);
    },
  );
});

describe("the What to do first box says each thing once", () => {
  it.each(INDUSTRIES.map((i) => i.id))(
    "%s sample: the first step and two recommendations show; the rest fold",
    (industry) => {
      const profile: PracticeProfile = { ...defaultProfile(industry), procedures: [] };
      const template = resolveTemplate(profile);
      const total = detectSodConflicts(
        template,
        profile.staff,
        sodDetectionOptions(template, profile.dualRelease),
      ).recommendations.length;
      const page = render(profile);
      const items = boxItems(page);
      expect(items.length).toBeLessThanOrEqual(3);
      if (total > 2) {
        expect(items).toHaveLength(3);
        expect(page).toContain(`Show the other ${total - 2} recommendation`);
        // The folded list holds exactly the rest, each once.
        const folded = page.split("Show the other")[1]?.split("</details>")[0] ?? "";
        expect(folded.match(/<li>/g) ?? []).toHaveLength(total - 2);
      } else {
        expect(page).not.toContain("Show the other");
      }
    },
  );

  it("calls five of eleven money duties much of the cycle, and seven most of it", () => {
    const five: Person[] = [
      {
        id: "o",
        name: "Owner",
        role: "Owner",
        active: true,
        owner: true,
        entitlements: ["sign_checks"],
      },
      {
        id: "k",
        name: "Kim",
        role: "Office Manager",
        active: true,
        entitlements: [
          "collect_cash",
          "post_payments",
          "prepare_deposit",
          "enter_invoices",
          "enter_payroll",
        ],
      },
    ];
    const text = (people: Person[]) => {
      const profile: PracticeProfile = {
        ...ownSetupProfile({
          industry: "dental",
          practiceName: "Test",
          people,
          answers: UNANSWERED,
        }),
        procedures: [],
      };
      const template = resolveTemplate(profile);
      return detectSodConflicts(
        template,
        profile.staff,
        sodDetectionOptions(template, profile.dualRelease),
      ).recommendations.join(" ");
    };
    expect(text(five)).toMatch(/holds 5 of the 11 core money duties, so much of the money cycle/);
    const seven: Person[] = [
      five[0],
      {
        ...five[1],
        entitlements: [...(five[1].entitlements ?? []), "initiate_ach", "bank_reconcile"],
      },
    ];
    expect(text(seven)).toMatch(/holds 7 of the 11 core money duties, so most of the money cycle/);
  });
});

describe("Start here and Who controls what name one first step, for the person in conflict", () => {
  // Bayside Dental: Lisa releases payments and reconciles the bank but banks
  // no money; Carmen takes, records and banks it and holds 5 of the 11 core
  // money duties. Start here once said "Someone other than the person who
  // banks the money reconciles the account" while Lisa's card said "Someone
  // who releases no payments reconciles the account".
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
      entitlements: ["release_payment", "bank_reconcile"],
    },
    {
      id: "own-carmen",
      name: "Carmen Ruiz",
      role: "Front desk",
      active: true,
      entitlements: [
        "collect_cash",
        "post_payments",
        "prepare_deposit",
        "enter_invoices",
        "issue_refunds",
      ],
    },
  ];
  const profile: PracticeProfile = {
    ...ownSetupProfile({
      industry: "dental",
      practiceName: "Bayside Dental",
      people: PEOPLE,
      answers: { ...UNANSWERED, ownerReadsStatement: "yes" },
    }),
    procedures: [],
  };
  const model = buildStartHereModel({
    profile,
    template: resolveTemplate(profile),
    today: new Date(2026, 8, 26),
  });
  const LINE =
    "Lisa Park can both reconcile the bank account and release payments: someone other than Lisa Park reconciles the account";
  const page = render(profile);

  it("words Start here's item 1 and the What to do first box alike, naming Lisa and her two duties", () => {
    expect(model.firstSteps.steps[0].control.id).toBe("independent-bank-reconciliation");
    const startHere = renderToStaticMarkup(
      <StartHereFirstStepsSection model={model.firstSteps} part="actions" />,
    );
    const first = /<p class="min-w-0 grow[^"]*">([^<]*)<\/p>/.exec(startHere)?.[1];
    expect(first).toBe(LINE);
    expect(startHere).not.toContain("the person who banks the money");
    expect(boxItems(page)[0]).toBe(`First, as on Start here: ${LINE}`);
  });

  it("says the list opens with Lisa by her most severe pair, not with Carmen whom the summary names", () => {
    expect(page).toContain("Carmen Ruiz (Front desk) holds 5 of the 11 core money duties");
    expect(page).not.toContain("most severe first");
    expect(page.replace(/&#x27;/g, "'")).toContain(
      "Grouped by person, in order of each person's most severe pair: Lisa Park comes first, not Carmen Ruiz, who holds 5 of the 11 core money duties.",
    );
    const openList = page.split('data-list="open"')[1] ?? "";
    expect(/<section aria-label="([^"]+)"/.exec(openList)?.[1]).toBe("Lisa Park");
  });

  it("keeps the plain heading where the summary names nobody for the money cycle", () => {
    // Carmen with three money duties: no one holds most of the cycle.
    const people = PEOPLE.map((p) =>
      p.id === "own-carmen"
        ? { ...p, entitlements: ["collect_cash", "post_payments", "prepare_deposit"] }
        : p,
    ) as Person[];
    const plain = render({
      ...ownSetupProfile({
        industry: "dental",
        practiceName: "Bayside Dental",
        people,
        answers: { ...UNANSWERED, ownerReadsStatement: "yes" },
      }),
      procedures: [],
    });
    expect(plain).not.toContain("core money duties");
    expect(plain).toContain("Each pair of duties one person holds, most severe first");
  });
});
