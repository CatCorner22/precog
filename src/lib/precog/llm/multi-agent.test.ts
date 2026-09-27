import { describe, expect, it } from "vitest";
import { RISK_SCALE } from "../scoring/bands";
import { runSpecialistAgents } from "./multi-agent";
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
    const elevated = /"act now" band/;
    expect(critic(RISK_SCALE.actNow - 3).some((b) => elevated.test(b))).toBe(false);
    expect(critic(RISK_SCALE.actNow).some((b) => elevated.test(b))).toBe(true);
  });
});
