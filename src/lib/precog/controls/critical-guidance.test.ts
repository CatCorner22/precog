import { describe, expect, it } from "vitest";
import { blueprintsForIndustry } from "../operating-blueprint";
import { INDUSTRIES } from "../industry";
import { KNOWLEDGE_CORPUS } from "../rag/corpus";
import { RECOMMENDED_PROCEDURES } from "../procedures/library";

describe("critical controls agree across planning, retrieval and procedures", () => {
  it.each(INDUSTRIES.map((i) => i.id))(
    "requires payment-change verification before use in %s",
    (id) => {
      const plan = blueprintsForIndustry(id).find((p) => p.id === "procure-pay")!;
      expect(plan.standard.join(" ")).toMatch(/previously known.*before/i);
      expect(plan.fallback.join(" ")).toMatch(/does not replace.*before/i);
    },
  );
  it("does not present quarterly change review as the preventive safeguard", () => {
    const guidance = KNOWLEDGE_CORPUS.find((c) => c.id === "monitoring-cadence-practice")!;
    expect(guidance.text).toMatch(/before.*change/i);
    expect(guidance.text).toMatch(/does not replace/i);
    expect(guidance.text).not.toMatch(/change list quarterly/i);
  });
  it("reconciles card receipts through settlement differences, not a false gross-equals-bank rule", () => {
    for (const industry of INDUSTRIES) {
      const plan = blueprintsForIndustry(industry.id).find((p) => p.id === "cash-receipts")!;
      expect(plan.standard.join(" ")).toMatch(/fees.*refunds.*chargebacks.*timing/i);
    }
  });
  it("states the limits of the independent-contact control in the procedure", () => {
    const procedure = RECOMMENDED_PROCEDURES.find((p) => p.id === "lib-vendor-bank-change")!;
    expect(procedure.steps.map((s) => s.text).join(" ")).toMatch(/authorized.*contact/i);
    expect(procedure.source).toMatch(/Precog.s suggested design/i);
  });
});
