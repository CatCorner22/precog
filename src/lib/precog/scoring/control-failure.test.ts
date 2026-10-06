import { describe, expect, it } from "vitest";
import { formatEstimateUsd } from "@/lib/utils";
import { resolveTemplate } from "../active-template";
import { defaultDualReleasePolicy } from "../controls/dual-release-policy";
import { staffFlagsFromDualRelease } from "../controls/dual-release-summary";
import { INDUSTRIES } from "../industry";
import { defaultProfile } from "../practice-profile";
import { withDualRelease, withStaff } from "../profile-actions";
import { getIndustryTemplate } from "../templates";
import { CONFLICT_RULES } from "../sod/conflict-rules";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { openFindings, partialDualReleaseCoverage } from "../sod/open-findings";
import type { StaffComposition } from "../types";
import { DEFAULT_RISK_VARIABLES, mergeStaffIntoVariables } from "./dynamic-variables";
import { portfolioSummary } from "./residual-engine";
import {
  DUAL_RELEASE_GAP_LEAD as GAP_LEAD,
  DUAL_RELEASE_INOPERABLE_LEAD as INOPERABLE_LEAD,
  evaluateControlFailure,
  SAFEGUARDS,
  type FailureInputs,
} from "./control-failure";
import { confirmedScenarioIds } from "./scope";
import { DEFAULT_WEIGHTS } from "./weights";

const dental = getIndustryTemplate("dental");

function inputsFor(
  tpl: typeof dental,
  staff: StaffComposition = { ...tpl.staffComposition },
): FailureInputs {
  return {
    staff,
    riskVariables: mergeStaffIntoVariables({ ...DEFAULT_RISK_VARIABLES }, staff),
    dualRelease: defaultDualReleasePolicy(tpl, staff),
  };
}

describe("control failure impact", () => {
  it("compares an active dual-release safeguard with its failure", () => {
    const staff = { ...dental.staffComposition, dualControlPayments: true };
    let dualRelease = defaultDualReleasePolicy(dental, staff);
    if (
      !detectSodConflicts(dental, staff, sodDetectionOptions(dental, dualRelease)).conflicts.some(
        (finding) => finding.dualReleaseMitigated,
      )
    ) {
      dualRelease = {
        ...dualRelease,
        enabled: true,
        rules: dualRelease.rules.map((rule) => ({
          ...rule,
          enabled: true,
          thresholdUsd: 0,
        })),
      };
    }
    const report = evaluateControlFailure(
      dental,
      { kind: "safeguard", id: "dual_release" },
      {
        ...inputsFor(dental, staff),
        dualRelease,
      },
    );

    expect(report.mode).toBe("failure");
    expect(
      report.scenarios.some(
        (scenario) => scenario.withoutIt.retainedExpected > scenario.withIt.retainedExpected,
      ),
    ).toBe(true);
    expect(report.residual.withoutIt).toBeGreaterThanOrEqual(report.residual.withIt);
    expect(
      report.findings.some((finding) =>
        finding.lostInPlace.includes("Dual-release policy active on related channel"),
      ),
    ).toBe(true);
  });

  it("compares a missing bank reconciliation safeguard with adding it", () => {
    const staff = { ...dental.staffComposition, independentBankRec: false };
    const report = evaluateControlFailure(
      dental,
      { kind: "safeguard", id: "bank_rec" },
      inputsFor(dental, staff),
    );

    expect(report.mode).toBe("gap");
    expect(
      report.scenarios.some((scenario) => scenario.withoutIt.p50Days > scenario.withIt.p50Days),
    ).toBe(true);
  });

  it("shows the effects of losing a segregated control and its compensating text", () => {
    const targetId = "c-sod-cash";
    const tpl = {
      ...dental,
      controls: dental.controls.map((control) =>
        control.id === targetId ? { ...control, segregated: true } : control,
      ),
    };
    const control = tpl.controls.find((item) => item.id === targetId)!;
    const report = evaluateControlFailure(tpl, { kind: "control", id: control.id }, inputsFor(tpl));
    const residual = report.residual.rows.find((row) => row.id === `ctrl-${control.id}`);
    const linkedRules = CONFLICT_RULES.filter((rule) => rule.linkedControlId === control.id);

    expect(control.compensatingControls.length).toBeGreaterThan(0);
    expect(linkedRules.length).toBeGreaterThan(0);
    expect(report.mode).toBe("failure");
    expect(report.findingsKind).toBe("linked");
    expect(residual).toBeDefined();
    expect(residual!.withoutIt).toBeGreaterThan(residual!.withIt);
    expect(
      report.findings.some((finding) =>
        control.compensatingControls.some((text) => finding.lostInPlace.includes(text)),
      ),
    ).toBe(true);
    const inputs = inputsFor(tpl);
    const withItFindings = detectSodConflicts(
      tpl,
      inputs.staff,
      sodDetectionOptions(tpl, inputs.dualRelease),
    )
      .conflicts.filter((finding) => linkedRules.some((rule) => rule.id === finding.ruleId))
      .map((finding) => finding.controlsInPlace);
    const withoutItTpl = {
      ...tpl,
      controls: tpl.controls.map((item) =>
        item.id === control.id ? { ...item, segregated: false } : item,
      ),
    };
    const withoutItFindings = detectSodConflicts(
      withoutItTpl,
      inputs.staff,
      sodDetectionOptions(withoutItTpl, inputs.dualRelease),
    )
      .conflicts.filter((finding) => linkedRules.some((rule) => rule.id === finding.ruleId))
      .map((finding) => finding.controlsInPlace);
    expect(withItFindings).toEqual(withoutItFindings);

    const direct = tpl.processes.find((process) => process.controlIds.includes(control.id));
    expect(direct).toBeDefined();
    expect(report.processes).toContainEqual({
      id: direct!.id,
      name: direct!.name,
      via: "control",
    });
    const dependents = tpl.processes.filter((process) => process.dependencies.includes(direct!.id));
    for (const dependent of dependents) {
      expect(report.processes).toContainEqual({
        id: dependent.id,
        name: dependent.name,
        via: "depends",
      });
    }
  });

  it("lists current duty conflicts linked to a segregated control", () => {
    const targetId = "c-sod-ap";
    const tpl = {
      ...dental,
      controls: dental.controls.map((control) =>
        control.id === targetId
          ? { ...control, segregated: true, compensatingControls: [] }
          : control,
      ),
    };
    const inputs = inputsFor(tpl);
    const linkedRuleIds = new Set(
      CONFLICT_RULES.filter((rule) => rule.linkedControlId === targetId).map((rule) => rule.id),
    );
    const currentConflicts = detectSodConflicts(
      tpl,
      inputs.staff,
      sodDetectionOptions(tpl, inputs.dualRelease),
    ).conflicts.filter((finding) => linkedRuleIds.has(finding.ruleId));
    const report = evaluateControlFailure(tpl, { kind: "control", id: targetId }, inputs);

    expect(currentConflicts.length).toBeGreaterThan(0);
    expect(report.findingsKind).toBe("linked");
    expect(report.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining(currentConflicts.map((finding) => finding.id)),
    );
    expect(report.headline).toContain("duty conflict relies on it");
  });

  it("marks a non-segregated control as a gap", () => {
    const control = dental.controls.find((item) => !item.segregated)!;
    const inputs = inputsFor(dental);
    const report = evaluateControlFailure(dental, { kind: "control", id: control.id }, inputs);

    expect(report.mode).toBe("gap");
    expect(report.residual.withoutIt).toBe(
      portfolioSummary(dental, inputs.staff, DEFAULT_WEIGHTS, {
        confirmedScenarioIds: undefined,
        riskVariables: inputs.riskVariables,
      }).averageResidual,
    );
  });

  it("describes the coverage gained from a missing dual-release safeguard", () => {
    const inputs = inputsFor(dental);
    const report = evaluateControlFailure(
      dental,
      { kind: "safeguard", id: "dual_release" },
      inputs,
    );

    expect(report.mode).toBe("gap");
    expect(report.headline.startsWith("Without dual release")).toBe(true);
    expect(
      report.scenarios.some(
        (scenario) => scenario.withoutIt.retainedExpected > scenario.withIt.retainedExpected,
      ),
    ).toBe(true);
    if (report.findings.length > 0) {
      expect(report.headline).toContain("would gain a control in place");
      expect(report.headline).not.toContain("lose");
    }
  });

  it("does not credit dual release when both payment-channel rules are off", () => {
    const inputs = inputsFor(dental);
    const dualRelease = {
      ...inputs.dualRelease,
      enabled: false,
      rules: inputs.dualRelease.rules.map((rule) =>
        rule.channel === "ach" || rule.channel === "check" ? { ...rule, enabled: false } : rule,
      ),
    };
    const report = evaluateControlFailure(
      dental,
      { kind: "safeguard", id: "dual_release" },
      { ...inputs, dualRelease, today: "2026-10-07" },
    );

    expect(report.scenarios).toEqual([]);
    expect(report.notes).toContain(
      "Switching dual release on would not cover payments as it is set up. No ACH or check rule is on; turn one on for dual release to count.",
    );
  });

  it("leaves unconfirmed own-business scenarios and starter controls unscored", () => {
    const own = resolveTemplate({
      industry: "dental",
      customPeople: [
        { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, entitlements: [] },
      ],
    });
    const inputs = inputsFor(own);
    const noScenarios = evaluateControlFailure(
      own,
      { kind: "safeguard", id: "cameras" },
      { ...inputs, confirmedScenarioIds: new Set() },
    );
    const starter = own.controls.find((control) => control.starter)!;
    const sampleControl = evaluateControlFailure(
      own,
      { kind: "control", id: starter.id },
      { ...inputs, confirmedScenarioIds: new Set() },
    );

    expect(noScenarios.scenarios).toEqual([]);
    expect(noScenarios.notes).toContain(
      "No scenario is confirmed for this business yet, so no loss figure moves.",
    );
    expect(sampleControl.scored).toBe(false);
    expect(sampleControl.scenarios).toEqual([]);
    expect(sampleControl.residual.rows).toEqual([]);
    expect(sampleControl.notes.join(" ")).toContain("Precog does not count it yet");
    expect(sampleControl.notes.join(" ")).toContain("This runs here");
  });

  it("does not mutate its inputs and rejects an unknown control", () => {
    const inputs = inputsFor(dental);
    inputs.confirmedScenarioIds = new Set(["sc-cash-sod-failure"]);
    const before = structuredClone(inputs);

    evaluateControlFailure(dental, { kind: "safeguard", id: "alarm" }, inputs);

    expect(inputs).toEqual(before);
    expect(() =>
      evaluateControlFailure(dental, { kind: "control", id: "not-a-control" }, inputs),
    ).toThrow("Unknown control not-a-control");
  });
});

describe("one dual-release reading for today and the what-if", () => {
  const today = "2026-10-06";
  const now = new Date(`${today}T12:00:00`);

  /** The setup path from the review: payment rules off, then the staff checkbox ticked. */
  function flagOnPolicyInoperable() {
    let profile = defaultProfile("dental");
    profile = withDualRelease(
      profile,
      {
        ...profile.dualRelease,
        rules: profile.dualRelease.rules.map((rule) =>
          rule.channel === "ach" || rule.channel === "check" ? { ...rule, enabled: false } : rule,
        ),
      },
      now,
    );
    profile = withStaff(profile, { ...profile.staff, dualControlPayments: true });
    const tpl = resolveTemplate(profile);
    const confirmed = confirmedScenarioIds(profile.decisions, profile.industry);
    const inputs: FailureInputs = {
      staff: profile.staff,
      riskVariables: profile.riskVariables,
      dualRelease: profile.dualRelease,
      today,
      confirmedScenarioIds: confirmed,
    };
    const reported = portfolioSummary(tpl, profile.staff, DEFAULT_WEIGHTS, {
      confirmedScenarioIds: confirmed,
      riskVariables: profile.riskVariables,
    }).averageResidual;
    return { profile, tpl, inputs, reported };
  }

  it("gives today's residual as the report does when the staff flag is on and no payment rule can run", () => {
    const { profile, tpl, inputs, reported } = flagOnPolicyInoperable();
    expect(profile.staff.dualControlPayments).toBe(true);
    expect(staffFlagsFromDualRelease(profile.dualRelease, tpl, today).dualControlPayments).toBe(
      false,
    );

    const report = evaluateControlFailure(tpl, { kind: "safeguard", id: "dual_release" }, inputs);

    expect(report.mode).toBe("failure");
    expect(report.residual.withIt).toBe(reported);
    expect(report.residual.withoutIt).toBeGreaterThan(report.residual.withIt);
    expect(report.scenarios.length).toBeGreaterThan(0);
    expect(report.notes).toContain(
      `${INOPERABLE_LEAD} No ACH or check rule is on; turn one on for dual release to count.`,
    );
  });

  it("names a blanket waiver, not the rules, when the waiver is what blocks dual release", () => {
    const staff = { ...dental.staffComposition, dualControlPayments: false };
    const base = defaultDualReleasePolicy(dental, staff);
    const dualRelease = {
      ...base,
      enabled: false,
      rules: base.rules.map((rule) => ({ ...rule, enabled: true })),
      exceptions: [
        {
          id: "ex-blanket",
          label: "Everything",
          channels: [],
          action: "waive_dual" as const,
          enabled: true,
          reason: "Owner away",
          createdAt: `${today}T00:00:00.000Z`,
        },
      ],
    };
    const report = evaluateControlFailure(
      dental,
      { kind: "safeguard", id: "dual_release" },
      { ...inputsFor(dental, staff), dualRelease, today },
    );

    expect(report.mode).toBe("gap");
    expect(report.notes).toContain(
      `${GAP_LEAD} A waiver lets one person release every payment; end the waiver for dual release to count.`,
    );
    expect(report.notes.join(" ")).not.toContain("ACH or check rule");
  });

  it("names the missing second signer when only one person can sign", () => {
    const owner = dental.people.find((person) => person.active)!;
    const solo = { ...dental, people: [owner] };
    const staff = { ...solo.staffComposition, dualControlPayments: true };
    const base = defaultDualReleasePolicy(solo, staff);
    const dualRelease = {
      ...base,
      enabled: true,
      exceptions: [],
      rules: base.rules.map((rule) => ({ ...rule, enabled: true })),
    };
    const report = evaluateControlFailure(
      solo,
      { kind: "safeguard", id: "dual_release" },
      { ...inputsFor(solo, staff), dualRelease, today },
    );

    expect(report.mode).toBe("failure");
    expect(report.notes).toContain(
      `${INOPERABLE_LEAD} Name a second person allowed to sign; one person cannot approve their own payment.`,
    );
  });

  it("adds no note when the staff flag is on and a payment rule can run", () => {
    const staff = { ...dental.staffComposition, dualControlPayments: true };
    const base = defaultDualReleasePolicy(dental, staff);
    const dualRelease = {
      ...base,
      enabled: true,
      exceptions: [],
      rules: base.rules.map((rule) => ({ ...rule, enabled: true })),
    };
    const inputs = { ...inputsFor(dental, staff), dualRelease, today };
    const report = evaluateControlFailure(
      dental,
      { kind: "safeguard", id: "dual_release" },
      inputs,
    );

    expect(staffFlagsFromDualRelease(dualRelease, dental, today).dualControlPayments).toBe(true);
    expect(report.notes).toEqual([]);
    expect(report.residual.withIt).toBe(
      portfolioSummary(dental, staff, DEFAULT_WEIGHTS, {
        riskVariables: inputs.riskVariables,
      }).averageResidual,
    );
  });

  it("counts the duty conflicts a control guards as every other screen counts them", () => {
    const tpl = { ...dental, controls: dental.controls.map((c) => ({ ...c, segregated: true })) };
    const staff = { ...tpl.staffComposition, dualControlPayments: true };
    const base = defaultDualReleasePolicy(tpl, staff);
    const dualRelease = {
      ...base,
      enabled: true,
      exceptions: [],
      rules: base.rules.map((rule) => ({ ...rule, enabled: true, thresholdUsd: 0 })),
    };
    const inputs = { ...inputsFor(tpl, staff), dualRelease };
    const all = detectSodConflicts(tpl, staff, sodDetectionOptions(tpl, dualRelease)).conflicts;
    const open = openFindings(all, partialDualReleaseCoverage(dualRelease, all));
    let linkedAll = 0;
    let linkedOpen = 0;

    for (const control of tpl.controls) {
      const linkedRuleIds = new Set(
        CONFLICT_RULES.filter((rule) => rule.linkedControlId === control.id).map((rule) => rule.id),
      );
      const expected = open.filter((finding) => linkedRuleIds.has(finding.ruleId));
      linkedOpen += expected.length;
      linkedAll += all.filter((finding) => linkedRuleIds.has(finding.ruleId)).length;
      const report = evaluateControlFailure(tpl, { kind: "control", id: control.id }, inputs);
      expect(report.findings.map((finding) => finding.id)).toEqual(
        expected.map((finding) => finding.id),
      );
    }
    // Dual release closes, or the owner holds, some linked pairs in this sample.
    expect(linkedAll).toBeGreaterThan(linkedOpen);
  });
});

describe("the headline's change figures", () => {
  /** Every sample's report for each safeguard, as the "If a control fails" panel builds it. */
  function reports() {
    return INDUSTRIES.flatMap(({ id }) => {
      const profile = defaultProfile(id);
      const tpl = resolveTemplate(profile);
      return SAFEGUARDS.map((safeguard) =>
        evaluateControlFailure(
          tpl,
          { kind: "safeguard", id: safeguard.id },
          {
            staff: profile.staff,
            riskVariables: profile.riskVariables,
            dualRelease: profile.dualRelease,
            today: "2026-10-06",
            confirmedScenarioIds: confirmedScenarioIds(profile.decisions, profile.industry),
          },
        ),
      );
    });
  }

  /** The dollars a figure prints beside the headline: "about $29,000" is 29,000. */
  const printed = (n: number) => Number(formatEstimateUsd(n).replace(/[^\d.-]/g, ""));

  it("subtract the rounded figures printed beside them, so a reader's subtraction matches", () => {
    let checked = 0;
    for (const report of reports()) {
      const [worst] = report.scenarios;
      if (!worst) continue;
      const retained = /about \$([\d,]+) (more|less) retained loss on /.exec(report.headline);
      const retainedChange =
        printed(worst.withoutIt.retainedExpected) - printed(worst.withIt.retainedExpected);
      expect(retained ? Number(retained[1].replace(/,/g, "")) : 0, report.headline).toBe(
        Math.abs(retainedChange),
      );
      const cost = /annual cost of risk (rises|falls) about \$([\d,]+)/.exec(report.headline);
      const costChange =
        printed(worst.withoutIt.expectedAnnualCostOfRisk) -
        printed(worst.withIt.expectedAnnualCostOfRisk);
      expect(cost ? Number(cost[2].replace(/,/g, "")) : 0, report.headline).toBe(
        Math.abs(costChange),
      );
      checked += 1;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("reads about $8,000 between about $29,000 and about $37,000 on the dental sample", () => {
    const profile = defaultProfile("dental");
    const report = evaluateControlFailure(
      resolveTemplate(profile),
      { kind: "safeguard", id: "dual_release" },
      {
        staff: profile.staff,
        riskVariables: profile.riskVariables,
        dualRelease: profile.dualRelease,
        today: "2026-10-06",
        confirmedScenarioIds: confirmedScenarioIds(profile.decisions, profile.industry),
      },
    );
    const [worst] = report.scenarios;
    expect(formatEstimateUsd(worst.withIt.retainedExpected)).toBe("about $29,000");
    expect(formatEstimateUsd(worst.withoutIt.retainedExpected)).toBe("about $37,000");
    expect(report.headline).toContain(
      "about $8,000 more retained loss on Front desk lead leaves with sole denial knowledge",
    );
    expect(report.headline).toContain("annual cost of risk rises about $1,300");
  });
});
