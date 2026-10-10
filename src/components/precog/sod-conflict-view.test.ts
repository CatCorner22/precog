import { getIndustryTemplate } from "@/lib/precog/templates";
import { describe, expect, it } from "vitest";
import { defaultProfile } from "@/lib/precog/practice-profile";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import type { Person } from "@/lib/precog/types";
import { CONFLICT_RULES } from "@/lib/precog/sod/conflict-rules";
import { detectSodConflicts, type DetectedConflict } from "@/lib/precog/sod/detect";
import { partialDualReleaseCoverage } from "@/lib/precog/sod/open-findings";
import {
  conflictBadge,
  conflictBridge,
  conflictFactors,
  conflictsByPerson,
  conflictTone,
  listOrderNote,
  rulesDualReleaseCanNarrow,
  SEVERITY_FILTERS,
} from "./sod-conflict-view";

const dental = getIndustryTemplate("dental");

function oneClerk(entitlements: string[]): IndustryTemplate {
  const clerk: Person = { id: "x1", name: "Solo Clerk", role: "Clerk", active: true, entitlements };
  return { ...dental, people: [clerk], relations: [], roleTemplates: {} };
}

function conflictsOf(tpl: IndustryTemplate): DetectedConflict[] {
  return detectSodConflicts(tpl, defaultProfile("dental").staff).conflicts;
}

describe("conflictBridge", () => {
  it("joins the rule's title to the pair when a related duty stands in", () => {
    const found = conflictsOf(oneClerk(["prepare_deposit", "post_adjustments"])).find(
      (c) => c.ruleId === "rule-collect-adjust",
    );
    expect(found).toBeDefined();
    expect(conflictBridge(found!)).toBe(
      "Here, Prepare bank deposit counts as take payment from customers.",
    );
  });

  it("adds nothing when the person holds the rule's own pair", () => {
    const found = conflictsOf(oneClerk(["collect_cash", "post_adjustments"])).find(
      (c) => c.ruleId === "rule-collect-adjust",
    );
    expect(conflictBridge(found!)).toBeNull();
  });
});

describe("conflictTone and conflictBadge", () => {
  const base = conflictsOf(oneClerk(["collect_cash", "post_adjustments"]))[0];

  it("colours an owner-held pair neutral, whatever its severity", () => {
    const owner = { ...base, severity: "critical" as const, ownerHeld: true };
    expect(conflictTone(owner)).toBe("default");
    expect(conflictBadge(owner)).toBe("Owner-held");
  });

  it("colours a pair narrowed by dual release green, and medium or related-duty findings neutral", () => {
    expect(conflictTone({ ...base, dualReleaseMitigated: true })).toBe("ok");
    expect(conflictTone({ ...base, severity: "medium", ownerHeld: false })).toBe("default");
    expect(conflictTone({ ...base, severity: "critical", ownerHeld: false })).toBe("danger");
  });

  it("names every severity in words, never by its code", () => {
    for (const option of SEVERITY_FILTERS) expect(option.label).not.toMatch(/_|^family$/);
    expect(conflictBadge({ ...base, severity: "family", ownerHeld: false })).toBe("Related duties");
  });
});

describe("rulesDualReleaseCanNarrow", () => {
  it("offers dual release only for the rules a channel narrows", () => {
    const narrowable = rulesDualReleaseCanNarrow(defaultProfile("dental").dualRelease);
    expect(narrowable.has("rule-vendor-create-pay")).toBe(true);
    expect(narrowable.has("rule-access-release")).toBe(false);
    expect(narrowable.size).toBeLessThan(CONFLICT_RULES.length);
  });
});

describe("conflictsByPerson", () => {
  it("keeps the report's order and puts each person's conflicts together", () => {
    const conflicts = conflictsOf(dental);
    const groups = conflictsByPerson(conflicts);
    expect(groups.flatMap((g) => g.conflicts)).toHaveLength(conflicts.length);
    expect(groups[0].personId).toBe(conflicts[0].personId);
    expect(new Set(groups.map((g) => g.personId)).size).toBe(groups.length);
  });
});

describe("conflictFactors", () => {
  const staff = { dualControlPayments: false, independentBankRec: false };

  it("names the holder, dual release and the staffing that leaves a pair open", () => {
    const found = conflictsOf(oneClerk(["release_payment", "bank_reconcile"])).find(
      (c) => c.entitlementA === "release_payment" || c.entitlementB === "release_payment",
    )!;
    expect(conflictFactors(found, staff)).toEqual([
      "Held by Solo Clerk",
      "No dual release covers it",
      "No second approver on payments",
      "Nobody independent reconciles the bank",
    ]);
    expect(conflictFactors(found, { dualControlPayments: true, independentBankRec: true })).toEqual(
      ["Held by Solo Clerk", "No dual release covers it"],
    );
  });

  it("says when the owner holds the pair and when dual release covers it", () => {
    expect(
      conflictFactors({
        personName: "Ana Ruiz",
        ownerHeld: true,
        dualReleaseMitigated: true,
        entitlementA: "create_vendor",
        entitlementB: "approve_vendor",
      }),
    ).toEqual(["Held by Ana Ruiz, the owner", "Dual release covers it"]);
  });

  it("names the threshold when dual release covers a rule only above it", () => {
    const policy = defaultProfile("dental").dualRelease;
    const rule = policy.rules.find((r) => r.mitigatesRuleIds.includes("rule-vendor-create-pay"))!;
    const limited = {
      ...policy,
      enabled: true,
      rules: [{ ...rule, enabled: true, thresholdUsd: 2500 }],
    };
    const covered = {
      personName: "Solo Clerk",
      ownerHeld: false,
      dualReleaseMitigated: true,
      entitlementA: "create_vendor",
      entitlementB: "release_payment",
      ruleId: "rule-vendor-create-pay",
    } as DetectedConflict;
    const threshold = partialDualReleaseCoverage(limited, [covered]).get(covered.ruleId);
    expect(threshold).toBe(2500);
    expect(conflictFactors(covered, undefined, threshold)).toEqual([
      "Held by Solo Clerk",
      "Dual release covers payments over $2,500 only",
    ]);
    // At a zero threshold every amount needs two people, so the rule is covered.
    const everyAmount = { ...limited, rules: [{ ...limited.rules[0], thresholdUsd: 0 }] };
    expect(partialDualReleaseCoverage(everyAmount, [covered]).has(covered.ruleId)).toBe(false);
    expect(conflictFactors(covered, undefined, undefined)[1]).toBe("Dual release covers it");
  });

  it("replaces the saturating score: no card prints 'Rank N of 100'", async () => {
    const { readFileSync } = await import("node:fs");
    const card = readFileSync(new URL("./sod-conflict-summary.tsx", import.meta.url), "utf8");
    expect(card).not.toMatch(/Rank \{/);
    expect(card).toContain("conflictFactors(conflict, staff, partialThresholdUsd)");
  });
});

describe("listOrderNote", () => {
  // Carmen holds most of the money cycle; Lisa's pair ranks higher.
  const lisa = { personId: "lisa", personName: "Lisa Park", role: "Office Manager" };
  const carmen = { personId: "carmen", personName: "Carmen Ruiz", role: "Front desk" };
  const card = (who: typeof lisa, id: string) =>
    ({ ...who, id: `${who.personId}:${id}`, ruleId: id }) as unknown as DetectedConflict;
  const holders = [
    {
      person: carmen,
      cycle: [
        "collect_cash",
        "post_payments",
        "prepare_deposit",
        "enter_invoices",
        "issue_refunds",
      ],
      of: 11,
    },
  ];
  const NOTE =
    "Grouped by person, in order of each person's most severe pair: Lisa Park comes first, not Carmen Ruiz, who holds 5 of the 11 core money duties.";

  it("says why the list opens with Lisa when Carmen, whom the summary names, is further down", () => {
    expect(listOrderNote([card(lisa, "a"), card(carmen, "b")], holders)).toBe(NOTE);
  });

  it("says nothing when a filter leaves Carmen out of the list shown", () => {
    // A severity or location filter that hides every one of Carmen's pairs:
    // the heading cannot say she is further down a list she is not in.
    expect(listOrderNote([card(lisa, "a")], holders)).toBeNull();
  });

  it("says nothing when the list opens with Carmen, or when the summary names nobody", () => {
    expect(listOrderNote([card(carmen, "b"), card(lisa, "a")], holders)).toBeNull();
    expect(listOrderNote([card(lisa, "a"), card(carmen, "b")], [])).toBeNull();
    expect(listOrderNote([], holders)).toBeNull();
  });
});
