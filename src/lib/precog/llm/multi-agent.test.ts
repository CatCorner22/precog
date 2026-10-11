import { describe, expect, it } from "vitest";
import { RISK_SCALE } from "../scoring/bands";
import { RESIDUAL_BAND_LABEL } from "../scoring/weights";
import { defaultProfile } from "../practice-profile";
import { INDUSTRIES } from "../industry";
import { resolveTemplate } from "../active-template";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { openFindings, partialDualReleaseCoverage } from "../sod/open-findings";
import { count } from "../text";
import { runSpecialistAgents } from "./multi-agent";
import { executeTool } from "./tools";
import type { ToolResult } from "./types";

function critic(averageResidual: number): string[] {
  const residual: ToolResult = {
    tool: "get_residual_portfolio",
    ok: true,
    summary: "",
    data: { averageResidual, top: [] },
  };
  return runSpecialistAgents([residual]).find((n) => n.agent === "critic")!.bullets;
}

describe("the critic's residual threshold", () => {
  it("calls residual elevated at the app's act-now band and not below it", () => {
    const elevated = /The average risk index is in the "(?:High|Severe)" band/;
    expect(critic(RISK_SCALE.actNow - 3).some((b) => elevated.test(b))).toBe(false);
    expect(critic(RISK_SCALE.actNow)).toContain(
      `The average risk index is in the "${RESIDUAL_BAND_LABEL.act_now}" band; waiting is a choice with a price.`,
    );
    expect(critic(RISK_SCALE.critical).join(" ")).toContain(
      `in the "${RESIDUAL_BAND_LABEL.critical_path}" band`,
    );
    expect(critic(RISK_SCALE.critical).join(" ")).not.toMatch(/fix first|fix soon|worth doing/i);
  });
});

describe("the controls lens on the sample", () => {
  it("counts every sample duty conflict as not yet accepted: the sample logs no decision", () => {
    const sod = executeTool("get_sod_conflicts", { profile: defaultProfile("dental") });
    const shield = runSpecialistAgents([sod]).find((n) => n.agent === "shield")!.bullets;
    expect(shield[0]).toBe(
      "20 open duty conflicts; 20 not yet accepted or fixed. Write each decision down in the Decisions log.",
    );
  });
});

describe("the controls lens counts open duty conflicts as every screen does", () => {
  // The sample as shipped, and with dual release on: one channel covering
  // every amount (its pairs close) and the rest above a threshold (their
  // pairs stay open), so the lens cannot pass by counting every finding.
  const withDualRelease = (industry: (typeof INDUSTRIES)[number]["id"]) => {
    const base = defaultProfile(industry);
    return {
      ...base,
      dualRelease: {
        ...base.dualRelease,
        enabled: true,
        rules: base.dualRelease.rules.map((r, i) => ({
          ...r,
          enabled: true,
          ...(i === 0 ? { thresholdUsd: 0 } : {}),
        })),
      },
    };
  };
  const cases = INDUSTRIES.flatMap((i) => [
    [`${i.id} sample`, defaultProfile(i.id)] as const,
    [`${i.id} with dual release`, withDualRelease(i.id)] as const,
  ]);
  it.each(cases)("%s: the lens count equals openFindings", (_label, profile) => {
    const tpl = resolveTemplate(profile);
    const report = detectSodConflicts(
      tpl,
      profile.staff,
      sodDetectionOptions(tpl, profile.dualRelease),
    );
    const open = openFindings(
      report.conflicts,
      partialDualReleaseCoverage(profile.dualRelease, report.conflicts),
    );
    const sod = executeTool("get_sod_conflicts", { profile });
    const shield = runSpecialistAgents([sod]).find((n) => n.agent === "shield")!.bullets;
    expect(shield[0]).toMatch(
      new RegExp(
        `^${count(open.length, "open duty conflict")}; ${open.filter((c) => !c.residualRiskAccepted).length} not yet accepted or fixed\\.`,
      ),
    );
  });
});
