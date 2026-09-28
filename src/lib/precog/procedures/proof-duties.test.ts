import { describe, expect, it } from "vitest";
import { teamTemplate } from "@/test/fixtures";
import { defaultDualReleasePolicy } from "../controls/dual-release";
import { getIndustryTemplate } from "../templates";
import type { KnowledgeRelation } from "../types";
import { procedureDutyConflicts } from "./duty-conflicts";
import { newProcedure, newStep, verifyProcedure } from "./lifecycle";
import { normalizeProcedures } from "./normalize";
import { backupProofs, levelRaiseOffer, proofIsStale, provenBackups, withProof } from "./proof";

const TODAY = "2026-10-01";

const procedure = (extra = {}) =>
  newProcedure(
    {
      industry: "general",
      title: "Reconcile the bank",
      steps: [newStep("Open the bank feed.")],
      knowledgeIds: ["k1", "k2"],
      backupPersonIds: ["t2"],
      ...extra,
    },
    TODAY,
  );

describe("backup proved it", () => {
  it("records a run newest first without touching the verification", () => {
    const verified = verifyProcedure(procedure(), "owner", TODAY);
    const once = withProof(verified, { personId: "t2", on: "2026-10-02", alone: false });
    const twice = withProof(once, { personId: "t2", on: "2026-10-09", alone: true });
    expect(twice.proofs.map((p) => p.on)).toEqual(["2026-10-09", "2026-10-02"]);
    expect(twice.verifiedAt).toBe(TODAY);
  });

  it("offers a level raise only after an unaided run, only where the person is below proficient", () => {
    const relations: KnowledgeRelation[] = [
      { personId: "t2", knowledgeId: "k1", level: "basic" },
      { personId: "t2", knowledgeId: "k2", level: "expert" },
    ];
    expect(levelRaiseOffer(relations, procedure(), "t2", false)).toEqual([]);
    expect(levelRaiseOffer(relations, procedure(), "t2", true)).toEqual([
      { knowledgeId: "k1", from: "basic", to: "proficient" },
    ]);
    expect(levelRaiseOffer([], procedure(), "t3", true).map((o) => o.from)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("finds each backup's latest unaided run, and none for a run with help", () => {
    let p = withProof(procedure({ backupPersonIds: ["t2", "t3"] }), {
      personId: "t2",
      on: "2026-03-01",
      alone: true,
    });
    p = withProof(p, { personId: "t2", on: "2026-09-01", alone: true });
    p = withProof(p, { personId: "t3", on: "2026-09-15", alone: false });
    expect(backupProofs(p)).toEqual([
      { personId: "t2", on: "2026-09-01" },
      { personId: "t3", on: null },
    ]);
    const map = provenBackups([p], "general");
    expect(map.get("t2\u0000k1")).toBe("2026-09-01");
    expect(map.has("t3\u0000k1")).toBe(false);
    expect(provenBackups([p], "dental").size).toBe(0);
  });

  it("treats a run more than a year old as due again", () => {
    expect(proofIsStale("2025-09-30", TODAY)).toBe(true);
    expect(proofIsStale("2025-10-01", TODAY)).toBe(false);
  });

  it("keeps proofs and known duties through the normaliser, dropping bad ones", () => {
    const [p] = normalizeProcedures(
      [
        {
          ...procedure(),
          dutyIds: ["bank_reconcile", "not_a_duty", "bank_reconcile"],
          proofs: [
            { id: "a", personId: "t2", on: "2026-09-01", alone: true, note: " fine " },
            { id: "b", personId: "t2", on: "2099-01-01", alone: true },
            { id: "c", on: "2026-09-01" },
          ],
        },
      ],
      TODAY,
    );
    expect(p.dutyIds).toEqual(["bank_reconcile"]);
    expect(p.proofs).toEqual([
      { id: "a", personId: "t2", on: "2026-09-01", alone: true, note: "fine" },
    ]);
  });
});

describe("duty conflicts for a backup", () => {
  const tpl = teamTemplate(getIndustryTemplate("general"), [
    { name: "Olive Owner", role: "Owner", duties: ["approve_vendor", "approve_payroll"] },
    { name: "Cass Cashier", role: "Office Manager", duties: ["collect_cash"] },
    { name: "Rae Recorder", role: "Bookkeeper", duties: ["post_payments", "bank_reconcile"] },
  ]);
  const policy = defaultDualReleasePolicy(tpl, tpl.staffComposition);
  const reconcile = { dutyIds: ["bank_reconcile" as const] };

  it("warns when the backup would hold cash and reconcile the bank", () => {
    const found = procedureDutyConflicts(tpl, policy, reconcile, "t2");
    expect(found.map((c) => c.ruleId)).toContain("rule-custody-rec");
    expect(found.every((c) => c.personId === "t2")).toBe(true);
  });

  it("does not repeat a conflict the person already holds", () => {
    expect(procedureDutyConflicts(tpl, policy, reconcile, "t3")).toEqual([]);
  });

  it("raises nothing for a procedure with no duties, or someone not on the team", () => {
    expect(procedureDutyConflicts(tpl, policy, {}, "t2")).toEqual([]);
    expect(procedureDutyConflicts(tpl, policy, reconcile, "nobody")).toEqual([]);
  });
});
