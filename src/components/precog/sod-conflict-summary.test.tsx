import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { HARD_GATE_WORDS } from "@/lib/precog/sod/conflict-rules";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import { ConflictSummary } from "./sod-conflict-summary";

describe("ConflictSummary", () => {
  const profile = defaultProfile("dental");
  const tpl = resolveTemplate(profile);
  const conflicts = detectSodConflicts(
    tpl,
    profile.staff,
    sodDetectionOptions(tpl, profile.dualRelease),
  ).conflicts;
  const markup = (ruleId: string) => {
    const conflict = conflicts.find((c) => c.ruleId === ruleId);
    expect(conflict, ruleId).toBeDefined();
    return renderToStaticMarkup(<ConflictSummary conflict={conflict!} staff={profile.staff} />);
  };

  it("names the hard gate that lifted a pair to critical", () => {
    const conflict = conflicts.find((c) => c.ruleId === "rule-payroll-release");
    expect(conflict?.gate).toBe("money_out");
    const html = markup("rule-payroll-release");
    expect(html).toContain("Always top tier");
    expect(html).toContain(HARD_GATE_WORDS.money_out.label);
    expect(html).toContain("whatever its own weight");
  });

  it("says nothing about a gate on a pair the rulebook ranks on its own", () => {
    const html = markup("rule-cash-rec");
    expect(html).not.toContain("Always top tier");
    expect(html).not.toContain("whatever its own weight");
  });
});
