import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { entitlementLabel } from "@/lib/precog/sod/conflict-rules";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import { NO_RULE_CELL, SodMatrixSection } from "./sod-matrix-section";

describe("the duty conflict matrix", () => {
  const profile = defaultProfile("dental");
  const tpl = resolveTemplate(profile);
  const report = detectSodConflicts(
    tpl,
    profile.staff,
    sodDetectionOptions(tpl, profile.dualRelease),
  );
  const html = renderToStaticMarkup(<SodMatrixSection report={report} />);

  it("says a pair no rule assesses is not covered, never compatible", () => {
    expect(report.matrix.some((c) => c.status === "safe")).toBe(true);
    expect(NO_RULE_CELL).toBe("No rule covers this pair");
    // Customer records and refunds share a process, but no rule names the pair.
    expect(html).toContain(
      `${entitlementLabel("edit_patient_master")} and ${entitlementLabel("issue_refunds")}: no rule covers this pair`,
    );
    expect(html).not.toContain("compatible");
  });

  it("draws an unassessed pair in grey, not in the green of a passed check", () => {
    expect(html).not.toContain("bg-ok");
    expect(html).not.toContain("✓");
  });
});
