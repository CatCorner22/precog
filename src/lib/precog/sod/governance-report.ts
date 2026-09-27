import type { RoleAssignment } from "./assignments";
import { entitlementById, isOperatingDuty } from "./conflict-rules";
import { analyzeDutyCoverage } from "./coverage-analysis";
import { detectAssignments } from "./detect";
import { powerGuidance } from "./power-guidance";
import type { IndustryId } from "../industry";
import type { StaffComposition } from "../types";

/** Produce a portable, review-ready record of the current control design. */
export function createGovernanceReport(
  assignments: RoleAssignment[],
  staff?: StaffComposition,
  generatedAt = new Date(),
  /** The line of business, so each power's guidance uses its own words. */
  industry: IndustryId = "general",
): string {
  const report = detectAssignments({ assignments, industry }, staff);
  const coverage = analyzeDutyCoverage(assignments);
  const { summary } = report;
  const open = summary.critical + summary.high + summary.medium + summary.family;
  const lines = [
    "# Duty Conflict and Coverage Report",
    "",
    `Generated: ${generatedAt.toISOString()}`,
    "",
    "> This report describes the duties as recorded here; confirm them against real system access.",
    "",
    "## Summary",
    "",
    `- Duty-conflict health: **${summary.segregationHealth}/100**`,
    `- Continuity resilience: **${coverage.resilienceScore}/100**`,
    `- Open conflicts: **${open}** (${summary.critical} critical, ${summary.high} high)`,
    ...(summary.ownerHeld
      ? [`- Pairs the owner holds (not theft risks): **${summary.ownerHeld}**`]
      : []),
    ...(summary.dualReleaseMitigated
      ? [`- Pairs a dual-release rule narrows: **${summary.dualReleaseMitigated}**`]
      : []),
    `- Duties nobody holds: **${coverage.unassigned.length}**`,
    `- High-risk duties with one holder: **${coverage.singlePoints.length}**`,
    `- People on the map: **${assignments.length}**`,
    "",
    "## Conflict register",
    "",
    "| Person | Severity | Conflict | Why it matters | Controls that narrow it |",
    "|---|---|---|---|---|",
    ...report.conflicts.map(
      (item) =>
        `| ${clean(item.personName)} | ${item.severity} | ${clean(item.labelA)} × ${clean(item.labelB)} | ${clean(item.why)} | ${clean(item.compensatingControls.slice(0, 2).join("; "))} |`,
    ),
    ...(report.conflicts.length ? [] : ["| — | — | No conflicts detected | — | — |"]),
    "",
    "## Continuity register",
    "",
    ...coverage.unassigned.map(
      (item) => `- **Nobody holds:** ${clean(item.label)} (risk ${item.riskWeight}/5)`,
    ),
    ...coverage.singlePoints.map(
      (item) =>
        `- **Backup required:** ${clean(item.label)} — currently only ${clean(item.assignees[0]?.personName ?? "one assignee")}`,
    ),
    ...(coverage.unassigned.length || coverage.singlePoints.length
      ? []
      : ["- Every high-risk duty has a holder and a backup."]),
    "",
    "## Duty charters",
    "",
  ];

  const guidanceFor = powerGuidance(industry);
  for (const person of assignments) {
    lines.push(`### ${clean(person.personName)} — ${clean(person.role)}`, "");
    const duties = person.entitlements.filter(isOperatingDuty);
    if (!duties.length) lines.push("- Reads reports only; holds no operating duties.", "");
    for (const id of duties) {
      const entitlement = entitlementById(id);
      const guidance = guidanceFor[id];
      if (!entitlement || !guidance) continue;
      lines.push(
        `#### ${clean(entitlement.label)}`,
        `- Purpose: ${clean(guidance.purpose)}`,
        `- Evidence: ${clean(guidance.evidence)}`,
        `- Boundary: ${clean(guidance.boundary)}`,
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/** A value safe inside a Markdown table cell: pipes escaped, line breaks flattened. */
function clean(value: string) {
  return value
    .replaceAll("|", "\\|")
    .replace(/[\r\n]+/g, " ")
    .trim();
}
