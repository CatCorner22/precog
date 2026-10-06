import { describe, expect, it } from "vitest";
import { RISK_SCALE } from "../scoring/bands";
import { defaultProfile } from "../practice-profile";
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
    const elevated = /"fix soon" band/;
    expect(critic(RISK_SCALE.actNow - 3).some((b) => elevated.test(b))).toBe(false);
    expect(critic(RISK_SCALE.actNow).some((b) => elevated.test(b))).toBe(true);
  });
});

describe("the controls lens on the sample", () => {
  it("counts every sample duty conflict as not yet accepted: the sample logs no decision", () => {
    const sod = executeTool("get_sod_conflicts", { profile: defaultProfile("dental") });
    const shield = runSpecialistAgents([sod]).find((n) => n.agent === "shield")!.bullets;
    expect(shield[0]).toBe(
      "20 duty conflicts; 20 not yet accepted or fixed. Write each decision down in the Decisions log.",
    );
  });
});
