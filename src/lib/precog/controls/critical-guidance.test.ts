import { describe, expect, it } from "vitest";
import { KNOWLEDGE_CORPUS } from "../rag/corpus";
import { RECOMMENDED_PROCEDURES } from "../procedures/library";
import { PAYMENT_DESTINATION_CHANGE, RECEIPT_SETTLEMENT } from "./critical-guidance";

const procedure = (id: string) => RECOMMENDED_PROCEDURES.find((p) => p.id === id)!;

describe("critical controls agree across retrieval and procedures", () => {
  it("requires payment-change verification before use in the procedure and its fallback", () => {
    const change = procedure("lib-vendor-bank-change");
    expect(change.steps.map((s) => s.text).join(" ")).toMatch(/previously known.*before/i);
    expect(change.ifYouCannotSeparate).toMatch(/previously known.*before/i);
    expect(change.ifYouCannotSeparate).toMatch(/does not replace.*before/i);
    for (const record of PAYMENT_DESTINATION_CHANGE.evidence)
      expect(change.evidenceToKeep).toContain(record);
  });
  it("does not present quarterly change review as the preventive safeguard", () => {
    const guidance = KNOWLEDGE_CORPUS.find((c) => c.id === "monitoring-cadence-practice")!;
    expect(guidance.text).toMatch(/before.*change/i);
    expect(guidance.text).toMatch(/does not replace/i);
    expect(guidance.text).not.toMatch(/change list quarterly/i);
  });
  it("reconciles card receipts through settlement differences, not a false gross-equals-bank rule", () => {
    expect(RECEIPT_SETTLEMENT.reconciliation).toMatch(/fees.*refunds.*chargebacks.*timing/i);
    const guidance = KNOWLEDGE_CORPUS.find((c) => c.id === "monitoring-cadence-practice")!;
    expect(guidance.text).toContain(RECEIPT_SETTLEMENT.reconciliation);
    for (const record of RECEIPT_SETTLEMENT.evidence)
      expect(procedure("lib-cash-deposit").evidenceToKeep).toContain(record);
  });
  it("states the limits of the independent-contact control in the procedure", () => {
    const change = procedure("lib-vendor-bank-change");
    expect(change.steps.map((s) => s.text).join(" ")).toMatch(/authorized.*contact/i);
    expect(change.source).toMatch(/Precog.s suggested design/i);
  });
});
