import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { defaultDualReleasePolicy } from "../controls/dual-release-policy";
import { getIndustryTemplate } from "../templates";
import { CONFLICT_RULES } from "../sod/conflict-rules";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import type { StaffComposition } from "../types";
import { DEFAULT_RISK_VARIABLES, mergeStaffIntoVariables } from "./dynamic-variables";
import { evaluateControlFailure, type FailureInputs } from "./control-failure";

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
    expect(residual).toBeDefined();
    expect(residual!.withoutIt).toBeGreaterThan(residual!.withIt);
    expect(
      report.findings.some((finding) =>
        control.compensatingControls.some((text) => finding.lostInPlace.includes(text)),
      ),
    ).toBe(true);

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

  it("marks a non-segregated control as a gap", () => {
    const control = dental.controls.find((item) => !item.segregated)!;
    const report = evaluateControlFailure(
      dental,
      { kind: "control", id: control.id },
      inputsFor(dental),
    );

    expect(report.mode).toBe("gap");
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
