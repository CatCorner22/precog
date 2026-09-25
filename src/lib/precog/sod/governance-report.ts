import { entitlementById } from "./conflict-rules";
import { analyzeDutyCoverage } from "./coverage-analysis";
import { detectSodConflicts, type RoleAssignment } from "./detect";
import { powerGuidance } from "./power-guidance";
import type { IndustryId } from "../industry";
import type { StaffComposition } from "../types";

function clean(value: string) {
  return value
    .replaceAll("|", "\\|")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

/** Produce a portable, review-ready record of the current control design. */
export function createGovernanceReport(
  assignments: RoleAssignment[],
  staff?: StaffComposition,
  generatedAt = new Date(),
  /** The line of business, so each power's guidance uses its own words. */
  industry: IndustryId = "general",
): string {
  const report = detectSodConflicts(staff, { assignments });
  const coverage = analyzeDutyCoverage(assignments);
  const lines = [
    "# Power, Duty & Responsibility Governance Report",
    "",
    `Generated: ${generatedAt.toISOString()}`,
    "",
    "> Planning analysis only. Validate actual access, approvals, evidence, and compensating controls with accountable management.",
    "",
    "## Executive summary",
    "",
    `- SoD health: **${report.summary.segregationHealth}/100**`,
    `- Continuity resilience: **${coverage.resilienceScore}/100**`,
    `- Open conflicts: **${report.conflicts.length}** (${report.summary.critical} critical, ${report.summary.high} high)`,
    `- Unassigned duties: **${coverage.unassigned.length}**`,
    `- Critical single points: **${coverage.singlePoints.length}**`,
    `- People / modeled jobs: **${assignments.length}**`,
    "",
    "## Conflict register",
    "",
    "| Person | Severity | Conflict | Why it matters | Recommended fallback |",
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
      (item) => `- **Owner required:** ${clean(item.label)} (risk ${item.riskWeight}/5)`,
    ),
    ...coverage.singlePoints.map(
      (item) =>
        `- **Backup required:** ${clean(item.label)} — currently only ${clean(item.assignees[0]?.personName ?? "one assignee")}`,
    ),
    ...(coverage.unassigned.length || coverage.singlePoints.length
      ? []
      : ["- No material ownership or backup gaps detected."]),
    "",
    "## Responsibility charters",
    "",
  ];

  const guidanceFor = powerGuidance(industry);
  for (const person of assignments) {
    lines.push(`### ${clean(person.personName)} — ${clean(person.role)}`, "");
    const duties = person.entitlements.filter((id) => id !== "view_reports_only");
    if (!duties.length) lines.push("- Reporting access only; no operating powers modeled.", "");
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
