import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { INDUSTRIES } from "../industry";
import { defaultProfile } from "../practice-profile";
import { CONFLICT_RULES } from "../sod/conflict-rules";
import { libraryRows, procedureFromLibrary, RECOMMENDED_PROCEDURES } from "./library";
import {
  conflictProcedureLink,
  libraryIdFromItem,
  libraryIdsForRule,
  libraryItem,
  procedureForConflict,
  rankLibraryRowsByConflicts,
  RULE_PROCEDURE,
  writtenProcedureFor,
} from "./rule-procedures";
import { newProcedure } from "./lifecycle";

const TODAY = "2026-10-01";
const LIBRARY = new Map(RECOMMENDED_PROCEDURES.map((r) => [r.id, r]));

describe("the written procedure each duty-conflict rule leads to", () => {
  it("covers all 38 rules, each with a library procedure that exists", () => {
    expect(CONFLICT_RULES).toHaveLength(38);
    for (const rule of CONFLICT_RULES) {
      const entry = RULE_PROCEDURE[rule.id];
      expect(entry, rule.id).toBeDefined();
      for (const id of libraryIdsForRule(rule.id)) {
        expect(LIBRARY.has(id), `${rule.id} -> ${id}`).toBe(true);
      }
      expect(procedureForConflict(rule.id)?.id, rule.id).toBe(entry.primary);
    }
  });

  it("links each rule to a procedure that applies to every line of business, as every rule does", () => {
    for (const rule of CONFLICT_RULES) {
      const [primary, ...also] = libraryIdsForRule(rule.id);
      expect(LIBRARY.get(primary)?.industries, `${rule.id} -> ${primary}`).toBeUndefined();
      // Another procedure may be for some lines only (the cash drawer close
      // is not a nonprofit's); a line that is not shown it ranks without it.
      for (const id of also) {
        const lines = LIBRARY.get(id)?.industries;
        if (lines) expect(lines.length, `${rule.id} -> ${id}`).toBeGreaterThan(0);
      }
    }
    // So every industry's sample can start the procedure a conflict card names.
    for (const industry of INDUSTRIES) {
      const profile = defaultProfile(industry.id);
      const ids = new Set(
        libraryRows(resolveTemplate(profile), [], profile.industry).map((r) => r.recommendation.id),
      );
      for (const rule of CONFLICT_RULES) {
        const primary = RULE_PROCEDURE[rule.id].primary;
        const hiddenAsWritten =
          !ids.has(primary) &&
          writtenProcedureFor(primary, [], resolveTemplate(profile).knowledge, industry.id);
        expect(ids.has(primary) || Boolean(hiddenAsWritten), `${industry.id}: ${rule.id}`).toBe(
          true,
        );
      }
    }
  });

  it("has no entry for a rule that does not exist, and no repeats", () => {
    const ruleIds = new Set(CONFLICT_RULES.map((r) => r.id));
    expect(Object.keys(RULE_PROCEDURE).filter((id) => !ruleIds.has(id))).toEqual([]);
    for (const id of Object.keys(RULE_PROCEDURE)) {
      const all = libraryIdsForRule(id);
      expect(new Set(all).size, id).toBe(all.length);
    }
  });

  it("leads system administration plus recording payments received to the bank reconciliation", () => {
    // Its steps tick each deposit on the bank statement against a deposit in
    // the books: the check on what was recorded as received, made against a
    // record the system's administrator cannot edit.
    expect(libraryIdsForRule("rule-admin-pay")).toEqual(["lib-bank-rec", "lib-leaver-access"]);
    expect(conflictProcedureLink("rule-admin-pay", [], [], "general")).toEqual({
      title: "Reconcile the bank account",
      item: "lib:lib-bank-rec",
      started: false,
    });
    const steps = LIBRARY.get("lib-bank-rec")!.steps.map((s) => s.text);
    expect(steps).toContain(
      "Tick each deposit on the statement that matches a deposit in the books.",
    );
  });

  it("never leads a pair about money coming in to the vendor payment procedure", () => {
    const paysOut = new Set(["release_payment", "initiate_ach", "sign_checks"]);
    const incoming = CONFLICT_RULES.filter(
      (r) => [r.a, r.b].includes("post_payments") && ![r.a, r.b].some((d) => paysOut.has(d)),
    );
    expect(incoming.map((r) => r.id)).toContain("rule-admin-pay");
    for (const rule of incoming) {
      expect(RULE_PROCEDURE[rule.id].primary, rule.id).not.toBe("lib-release-payments");
    }
  });

  it("returns nothing for an unknown rule", () => {
    expect(procedureForConflict("rule-nope")).toBeUndefined();
    expect(libraryIdsForRule("rule-nope")).toEqual([]);
    expect(conflictProcedureLink("rule-nope", [], [], "general")).toBeNull();
  });
});

describe("the Procedures tab item for a recommendation", () => {
  it("round-trips a library id and refuses anything else", () => {
    expect(libraryItem("lib-bank-rec")).toBe("lib:lib-bank-rec");
    expect(libraryIdFromItem("lib:lib-bank-rec")).toBe("lib-bank-rec");
    expect(libraryIdFromItem("lib:lib-nope")).toBeNull();
    expect(libraryIdFromItem("lib-bank-rec")).toBeNull();
    expect(libraryIdFromItem(null)).toBeNull();
  });
});

describe("a conflict card's procedure link", () => {
  const profile = defaultProfile("general");
  const tpl = resolveTemplate(profile);

  it("opens the recommendation, ready to start, before the business has the procedure", () => {
    expect(conflictProcedureLink("rule-sign-rec", [], tpl.knowledge, "general")).toEqual({
      title: "Reconcile the bank account",
      item: "lib:lib-bank-rec",
      started: false,
    });
  });

  it("opens the business's own procedure once it is started", () => {
    const row = libraryRows(tpl, [], "general").find(
      (r) => r.recommendation.id === "lib-bank-rec",
    )!;
    const started = { ...procedureFromLibrary(row, "general", TODAY), title: "Our bank rec" };
    expect(conflictProcedureLink("rule-sign-rec", [started], tpl.knowledge, "general")).toEqual({
      title: "Our bank rec",
      item: started.id,
      started: true,
    });
    // Another line of business's copy is not this business's procedure.
    expect(
      conflictProcedureLink("rule-sign-rec", [{ ...started, industry: "dental" }], [], "general")
        ?.started,
    ).toBe(false);
  });

  it("opens the procedure for the register item it covers when that one is written", () => {
    const item = { id: "k-bank", name: "Bank reconciliation" };
    const written = newProcedure(
      { industry: "general", title: "Reconcile the bank", knowledgeIds: [item.id] },
      TODAY,
    );
    expect(conflictProcedureLink("rule-sign-rec", [written], [item], "general")?.item).toBe(
      written.id,
    );
  });
});

describe("recommendations ranked by the open conflicts they address", () => {
  const profile = defaultProfile("general");
  const rows = libraryRows(resolveTemplate(profile), [], profile.industry);
  const order = (ranked: { recommendation: { id: string } }[]) =>
    ranked.map((r) => r.recommendation.id);

  it("puts those linked to open critical conflicts first, then open high ones", () => {
    const ranked = rankLibraryRowsByConflicts(rows, [
      { ruleId: "rule-card-review", severity: "high" },
      { ruleId: "rule-backup-access", severity: "critical" },
    ]);
    expect(order(ranked).slice(0, 2)).toEqual(["lib-backup-test", "lib-card-review"]);
    expect(ranked).toHaveLength(rows.length);
    expect(ranked[0].fits).toBe(true);
  });

  it("counts a rule's other procedures, and puts more open conflicts ahead", () => {
    const ranked = rankLibraryRowsByConflicts(rows, [
      { ruleId: "rule-cash-rec", severity: "critical" },
      { ruleId: "rule-custody-rec", severity: "critical" },
    ]);
    expect(order(ranked).slice(0, 2)).toEqual(["lib-bank-rec", "lib-cash-deposit"]);
  });

  it("keeps the given order with no open conflicts", () => {
    expect(order(rankLibraryRowsByConflicts(rows, []))).toEqual(order(rows));
  });
});
