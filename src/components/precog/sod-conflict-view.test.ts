import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "@/lib/precog/active-template";
import { defaultProfile } from "@/lib/precog/practice-profile";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import type { Person } from "@/lib/precog/types";
import { CONFLICT_RULES } from "@/lib/precog/sod/conflict-rules";
import { detectSodConflicts, type DetectedConflict } from "@/lib/precog/sod/detect";
import {
  conflictBadge,
  conflictBridge,
  conflictsByPerson,
  conflictTone,
  rulesDualReleaseCanNarrow,
  SEVERITY_FILTERS,
} from "./sod-conflict-view";

const dental = getBaseTemplate("dental");

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
