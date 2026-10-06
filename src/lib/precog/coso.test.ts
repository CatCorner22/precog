import { describe, expect, it } from "vitest";
import { resolveTemplate } from "./active-template";
import { getIndustryTemplate } from "./templates";
import { assessCoso, componentStatus, COSO_PRINCIPLE_COUNT } from "./coso";
import type { AccessReconciliation } from "./firm/reconcile";
import { defaultProfile } from "./practice-profile";
import type { Person, StaffComposition } from "./types";

const people: Person[] = [
  { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, entitlements: [] },
  { id: "own-2", name: "Ben Ochoa", role: "Bookkeeper", active: true, entitlements: [] },
];
const own = resolveTemplate({ industry: "general", customPeople: people, customRelations: [] });
const generalSample = getIndustryTemplate("general");
const clean: StaffComposition = {
  teamSize: 10,
  soleOwnerKnowledgeCount: 0,
  avgTenureYears: 5,
  segregationScore: 100,
  dualControlPayments: false,
  independentBankRec: true,
};

describe("assessCoso", () => {
  it("scores the profile's staff, not the template's", () => {
    const fromTemplate = assessCoso(own, own.staffComposition);
    const fromProfile = assessCoso(own, clean);
    const note = (a: typeof fromProfile) =>
      a.components
        .find((c) => c.id === "control_activities")!
        .principles.find((p) => p.number === 10)!.note;
    expect(note(fromProfile)).toMatch(/^Segregation score 100\/100/);
    expect(note(fromTemplate)).toMatch(
      new RegExp(`^Segregation score ${own.staffComposition.segregationScore}/100`),
    );
    expect(fromProfile.gaps).toBeLessThan(fromTemplate.gaps);
  });

  it("never lists a key-person finding with a zero count", () => {
    for (const a of [
      assessCoso(own, clean),
      assessCoso(generalSample, generalSample.staffComposition),
    ]) {
      const spof = a.priorityFindings.find((f) => f.id === "ce-spof");
      if (spof) expect(spof.detail).not.toMatch(/^0 /);
    }
    expect(assessCoso(own, clean).priorityFindings.some((f) => f.id === "ce-spof")).toBe(false);
  });

  it("says the register is not assessed instead of scoring the sample list", () => {
    const a = assessCoso(own, clean);
    const competence = a.components
      .find((c) => c.id === "control_environment")!
      .principles.find((p) => p.number === 4)!;
    expect(competence.notAssessed).toBe(true);
    expect(competence.note).toBe(
      "Register not assessed yet: mark who can do each item on Who knows what.",
    );
    expect(a.priorityFindings.some((f) => f.id === "ic-register")).toBe(true);
    expect(a.priorityFindings.some((f) => f.id.startsWith("ic-k"))).toBe(false);
  });

  it("leaves sample scenarios out until the owner confirms one", () => {
    const none = assessCoso(own, clean);
    expect(none.priorityFindings.some((f) => f.id === "ra-top")).toBe(false);
    const p7 = none.components
      .find((c) => c.id === "risk_assessment")!
      .principles.find((p) => p.number === 7)!;
    expect(p7.notAssessed).toBe(true);
    expect(p7.note).toMatch(
      /^Precog does not count sample scenarios from the general small business sample yet/,
    );
    const one = assessCoso(own, clean, { confirmedScenarioIds: new Set(["sc-vendor-fraud"]) });
    const top = one.priorityFindings.find((f) => f.id === "ra-top")!;
    expect(top.label).toBe("Top residual scenario: One person sets up vendors and pays them");
    expect(top.detail).toContain("assumed days until found");
  });
});

describe("compensating controls in COSO findings", () => {
  it("quote the live dual-release policy, never a figure written into the control", () => {
    const p = defaultProfile("dental");
    const sample = getIndustryTemplate("dental");
    const tpl = {
      ...sample,
      controls: sample.controls.map((c) =>
        c.id === "c-sod-ap"
          ? { ...c, compensatingControls: ["Dual release on payments > $1,000"] }
          : c,
      ),
    };
    const detail = (a: ReturnType<typeof assessCoso>) =>
      a.components
        .find((c) => c.id === "control_activities")!
        .findings.find((f) => f.id === "ca-c-sod-ap")!.detail;
    const off = assessCoso(tpl, p.staff, { dualRelease: { ...p.dualRelease, enabled: false } });
    expect(detail(off)).toBe(
      "A sentence is written down, not a tested control: Dual release (off in your dual-release policy)",
    );
    const on = assessCoso(tpl, p.staff, { dualRelease: { ...p.dualRelease, enabled: true } });
    expect(detail(on)).toBe(
      "A sentence is written down, not a tested control: Dual release per your policy: ACH / vendor electronic pay above $500; Paper checks above $500; New vendor master at every amount",
    );
    expect(detail(assessCoso(tpl, p.staff))).not.toContain("$1,000");
  });
});

describe("the staff assessCoso scores", () => {
  it("must be passed, so no screen scores the industry sample's team by default", () => {
    // @ts-expect-error staff is required: the template's staff composition is the sample team's.
    const call = () => assessCoso(own);
    expect(call).toBeTypeOf("function");
  });
});

describe("priority findings", () => {
  it("keeps the most severe findings when there are more than eight", () => {
    const tpl = getIndustryTemplate("dental");
    const a = assessCoso(tpl, tpl.staffComposition);
    const all = a.components
      .flatMap((c) => c.findings)
      .filter((f) => f.severity === "critical" || f.severity === "weak");
    expect(all.length).toBeGreaterThan(8);
    const critical = all.filter((f) => f.severity === "critical").length;
    const kept = a.priorityFindings.map((f) => f.severity);
    // No weak finding is kept while a critical one is cut.
    expect(kept.slice(0, Math.min(8, critical)).every((s) => s === "critical")).toBe(true);
    expect(kept).toHaveLength(8);
    expect(a.priorityFindings.some((f) => f.severity === "weak")).toBe(critical < 8);
  });

  it("reads the sample's cash pair as unaddressed: no sample accepts a risk without a logged decision", () => {
    const tpl = getIndustryTemplate("dental");
    const a = assessCoso(tpl, tpl.staffComposition);
    const cash = a.components.flatMap((c) => c.findings).find((f) => f.id === "ca-c-sod-cash")!;
    expect(cash.severity).toBe("critical");
    expect(cash.detail).toBe(
      "A sentence is written down, not a tested control: Owner compares the deposit slip to the day sheet weekly",
    );
    expect(a.components.flatMap((c) => c.principles).find((p) => p.number === 5)!.note).toBe(
      "The business has not recorded a residual-risk decision on any duty conflict.",
    );
    expect(a.priorityFindings.map((f) => f.id)).toEqual([
      "ce-spof",
      "ra-top",
      "ra-fraud",
      "ca-c-cash",
      "ca-c-sod-cash",
      "ca-c-sod-billing",
      "ca-c-sod-ap",
      "ca-c-payroll",
    ]);
  });

  it("drops the fraud-driver finding when no driver is active", () => {
    const allSeparated = {
      ...generalSample,
      controls: generalSample.controls.map((c) => ({ ...c, segregated: true })),
    };
    const a = assessCoso(allSeparated, { ...clean, dualControlPayments: true });
    const fraud = a.components.flatMap((c) => c.findings).find((f) => f.id === "ra-fraud")!;
    expect(fraud.severity).toBe("adequate");
    expect(a.priorityFindings.some((f) => f.id === "ra-fraud")).toBe(false);
  });
});

describe("COSO component statuses", () => {
  const dental = getIndustryTemplate("dental");
  const withControls = (change: (c: (typeof dental.controls)[number]) => object) => ({
    ...dental,
    controls: dental.controls.map((c) => (c.segregated ? c : { ...c, ...change(c) })),
  });
  const status = (a: ReturnType<typeof assessCoso>, id: string) =>
    a.components.find((c) => c.id === id)!.status;
  const principle = (a: ReturnType<typeof assessCoso>, n: number) =>
    a.components.flatMap((c) => c.principles).find((p) => p.number === n)!;

  it("read a gap when any principle has one, with no score to average it away", () => {
    expect(componentStatus([{ status: "in_place" }, { status: "gap" }])).toBe("gap");
    expect(componentStatus([{ status: "in_place" }, { status: "not_assessed" }])).toBe("in_place");
    expect(componentStatus([{ status: "not_assessed" }])).toBe("not_assessed");
    const a = assessCoso(dental, dental.staffComposition);
    for (const c of a.components) {
      expect(c).not.toHaveProperty("score");
      expect(c.status).toBe(componentStatus(c.principles));
    }
    expect(a).not.toHaveProperty("overall");
  });

  it("do not score closing every duty conflict below accepting each one", () => {
    const accepted = assessCoso(
      withControls(() => ({ residualRiskAccepted: true })),
      clean,
    );
    const closed = assessCoso(
      withControls(() => ({ segregated: true })),
      clean,
    );
    expect(closed.gaps).toBeLessThanOrEqual(accepted.gaps);
    const p5 = principle(closed, 5);
    expect(p5.status).toBe("in_place");
    expect(p5.note).toBe("No open duty conflict needs a residual-risk decision.");
    // Accepting the risk records a decision; it does not close the gap.
    expect(principle(accepted, 12).status).toBe("gap");
    expect(principle(accepted, 17).status).toBe("in_place");
  });

  it("mark Control Activities as a gap for one critical duty conflict", () => {
    // Every control split and nobody holding a pair, then Ben holding one critical pair.
    const team = (ben: Person["entitlements"]) => {
      const tpl = resolveTemplate({
        industry: "general",
        customPeople: [
          { ...people[0], entitlements: ["view_reports_only"] },
          { ...people[1], entitlements: ben },
        ],
        customRelations: [],
      });
      return { ...tpl, controls: tpl.controls.map((c) => ({ ...c, segregated: true })) };
    };
    const none = assessCoso(team(["view_reports_only"]), clean);
    expect(principle(none, 10).status).toBe("in_place");
    expect(status(none, "control_activities")).toBe("in_place");
    const a = assessCoso(team(["create_vendor", "release_payment"]), clean);
    expect(principle(a, 10).status).toBe("gap");
    expect(principle(a, 10).note).toContain(
      "1 open critical or high duty conflict on the duty map",
    );
    expect(status(a, "control_activities")).toBe("gap");
  });
});

describe("a business with nothing assessed", () => {
  it("shows no adequate or strong label and says how many principles are not assessed", () => {
    const a = assessCoso(own, clean);
    const principles = a.components.flatMap((c) => c.principles);
    expect(principles).toHaveLength(COSO_PRINCIPLE_COUNT);
    const statuses = [...principles.map((p) => p.status), ...a.components.map((c) => c.status)];
    expect(statuses.every((s) => s === "gap" || s === "in_place" || s === "not_assessed")).toBe(
      true,
    );
    // P1, 4, 6, 7, 9, 11, 13, 14 and 15: no record behind them yet.
    expect(a.notAssessed).toBe(9);
    expect(principles.filter((p) => p.notAssessed).length).toBe(a.notAssessed);
    for (const p of principles) expect(p.notAssessed === true).toBe(p.status === "not_assessed");
  });
});

describe("principle 11", () => {
  const rec = (users: AccessReconciliation["users"]): AccessReconciliation => ({
    importedAt: "2026-09-01T10:00:00.000Z",
    source: "quickbooks",
    users,
    vendors: [],
  });
  const row = (over: Partial<AccessReconciliation["users"][number]>) => ({
    id: "u1",
    name: "Ben Ochoa",
    email: "",
    role: "Standard",
    mapped: [],
    unmatchedTokens: [],
    extra: [],
    missingFromBooks: [],
    status: "mapped" as const,
    ...over,
  });
  const p11 = (a: ReturnType<typeof assessCoso>) =>
    a.components.flatMap((c) => c.principles).find((p) => p.number === 11)!;

  it("reads the access import when there is one", () => {
    expect(p11(assessCoso(own, clean)).status).toBe("not_assessed");
    const fine = p11(assessCoso(own, clean, { accessReconciliation: rec([row({})]) }));
    expect(fine.status).toBe("in_place");
    expect(fine.notAssessed).toBeUndefined();
    expect(fine.note).toBe(
      "Access export imported on Sep 1, 2026: every row matches the duty map.",
    );
    const left = p11(
      assessCoso(own, clean, {
        accessReconciliation: rec([
          row({ status: "pending", leftBusiness: true }),
          row({ id: "u2", extra: ["export_bulk_data"] }),
        ]),
      }),
    );
    expect(left.status).toBe("gap");
    expect(left.note).toBe(
      "Access export imported on Sep 1, 2026: 1 row still to map, 1 person who left still with a sign-in and 1 person with access the duty map does not show.",
    );
  });
});

describe("sample controls in COSO", () => {
  it("does not count a sample control the owner has not confirmed as a duty conflict", () => {
    const tpl = resolveTemplate({ industry: "dental", customPeople: people });
    const starters = tpl.controls.filter((c) => c.starter && !c.segregated);
    expect(starters.length).toBeGreaterThan(0);
    const a = assessCoso(tpl, clean);
    const findings = a.components.find((c) => c.id === "control_activities")!.findings;
    for (const c of starters) expect(findings.some((f) => f.id === `ca-${c.id}`)).toBe(false);
    const p10 = a.components
      .find((c) => c.id === "control_activities")!
      .principles.find((p) => p.number === 10)!;
    expect(p10.note).toMatch(
      /Precog leaves out \d+ sample controls? until you confirm (it runs|they run) here\./,
    );
  });
});

describe("principles the app cannot read", () => {
  it("say so instead of asserting facts about the business", () => {
    const a = assessCoso(own, clean);
    const principles = a.components.flatMap((c) => c.principles);
    for (const n of [1, 6, 9, 11, 13, 15]) {
      const p = principles.find((x) => x.number === n)!;
      expect(p.notAssessed, `P${n}`).toBe(true);
      expect(p.status, `P${n}`).toBe("not_assessed");
      expect(p.note).toMatch(/^Not assessed/);
    }
    expect(principles.map((p) => p.note).join(" ")).not.toMatch(/\bPMS\b|practice/);
  });
});
