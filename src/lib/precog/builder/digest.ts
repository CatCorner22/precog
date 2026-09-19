/**
 * Weekly owner digest — plain text suitable for email, Slack, or a printed note.
 */
import type { DueItem } from "./due";
import type { EffectivenessSummary } from "./effectiveness";
import type { MapHealthReport } from "../process-graph";
import type { WeeklyAction } from "@/components/precog/weekly-action-plan";

export interface DigestInput {
  businessName: string;
  health: MapHealthReport;
  previousHealth: number | null;
  due: DueItem[];
  actions: WeeklyAction[];
  effectiveness: EffectivenessSummary;
  busFactorAtRisk: number;
  teamSize: number;
  appUrl?: string;
  now?: Date;
}

export function buildDigest(input: DigestInput): { subject: string; body: string } {
  const now = input.now ?? new Date();
  const week = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const delta = input.previousHealth === null ? null : input.health.score - input.previousHealth;
  const overdue = input.due.filter((d) => d.status === "overdue");
  const thisWeek = input.due.filter((d) => d.status === "today" || d.status === "this_week");
  const never = input.due.filter((d) => d.status === "unscheduled" && d.kind === "evidence");
  const weakestDim = [...input.health.dimensions].sort((a, b) => a.score - b.score)[0];

  const lines: string[] = [];
  lines.push(`${input.businessName} — control digest for the week of ${week}`);
  lines.push("");
  lines.push(
    `MAP HEALTH: ${input.health.score}/100 (${input.health.bandLabel})${
      delta === null ? "" : delta === 0 ? " · unchanged" : ` · ${delta > 0 ? "+" : ""}${delta} vs last snapshot`
    }`,
  );
  lines.push(`  ${input.health.summary}`);
  if (weakestDim) lines.push(`  Weakest dimension: ${weakestDim.label} (${weakestDim.score}) — ${weakestDim.hint}`);
  lines.push("");

  lines.push("DUE THIS WEEK");
  if (!overdue.length && !thisWeek.length && !never.length) {
    lines.push("  Nothing due. Nice.");
  } else {
    for (const d of overdue) lines.push(`  ! OVERDUE ${Math.abs(d.daysLeft ?? 0)}d — ${d.title} (${d.detail})`);
    for (const d of thisWeek) lines.push(`  • ${d.daysLeft === 0 ? "Today" : `In ${d.daysLeft}d`} — ${d.title} (${d.detail})`);
    if (never.length) lines.push(`  ○ ${never.length} evidence item(s) have never been recorded — do the first review to start the clock.`);
  }
  lines.push("");

  lines.push("TOP MOVES");
  input.actions.slice(0, 4).forEach((a, i) => {
    lines.push(`  ${i + 1}. ${a.title} [${a.effort} effort]`);
    lines.push(`     ${a.why}`);
  });
  lines.push("");

  lines.push("CONTROLS");
  lines.push(
    `  Design ${input.effectiveness.avgDesign} · Operating ${
      input.effectiveness.avgOperating === null ? "unknown (no evidence yet)" : input.effectiveness.avgOperating
    } · Overall ${input.effectiveness.avgOverall}`,
  );
  if (input.effectiveness.weakest) {
    const w = input.effectiveness.weakest;
    lines.push(`  Weakest: ${w.control.name} (${w.overall}) — ${w.notes[0] ?? "review design and evidence"}`);
  }
  if (input.effectiveness.unmapped.length)
    lines.push(`  ${input.effectiveness.unmapped.length} control(s) not mapped to any process.`);
  lines.push("");

  lines.push("PEOPLE");
  lines.push(
    input.busFactorAtRisk
      ? `  ${input.busFactorAtRisk} of ${input.teamSize} people would orphan a process or critical knowledge if they left. Assign backups.`
      : `  Every process and critical knowledge item has a backup. Keep it that way.`,
  );
  lines.push("");
  if (input.appUrl) lines.push(`Open Precog Pioneer: ${input.appUrl}`);
  lines.push("Educational internal-control decision support — not legal, actuarial, or forensic advice.");

  return {
    subject: `${input.businessName}: control digest ${week} — health ${input.health.score}${
      overdue.length ? `, ${overdue.length} overdue` : ""
    }`,
    body: lines.join("\n"),
  };
}

export function mailtoHref(subject: string, body: string, to = ""): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
