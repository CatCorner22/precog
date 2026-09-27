import { describe, expect, it } from "vitest";
import { resolveTemplate } from "./active-template";
import { getIndustryTemplate } from "./templates";
import { assessCoso } from "./coso";
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
    expect(fromProfile.overall).toBeGreaterThan(fromTemplate.overall);
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
    expect(p7.note).toMatch(/^Sample scenarios from the general small business sample/);
    const one = assessCoso(own, clean, { confirmedScenarioIds: new Set(["sc-vendor-fraud"]) });
    const top = one.priorityFindings.find((f) => f.id === "ra-top")!;
    expect(top.label).toBe("Top residual future: One person sets up vendors and pays them");
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
    expect(detail(off)).toBe("Compensating: Dual release (off in your dual-release policy)");
    const on = assessCoso(tpl, p.staff, { dualRelease: { ...p.dualRelease, enabled: true } });
    expect(detail(on)).toBe(
      "Compensating: Dual release per your policy: ACH / vendor electronic pay above $500; Paper checks above $500; New vendor master at every amount",
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
    expect(p10.note).toMatch(/sample controls? not yet confirmed/);
  });
});

describe("principles the app cannot read", () => {
  it("say so instead of asserting facts about the business", () => {
    const a = assessCoso(own, clean);
    const principles = a.components.flatMap((c) => c.principles);
    for (const n of [6, 9, 11, 13, 15]) {
      const p = principles.find((x) => x.number === n)!;
      expect(p.notAssessed, `P${n}`).toBe(true);
      expect(p.note).toMatch(/^Not assessed/);
    }
    expect(principles.map((p) => p.note).join(" ")).not.toMatch(/\bPMS\b|practice/);
  });
});
