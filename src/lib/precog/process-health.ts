import { HEAT_BANDS, healthLevel, type HealthLevel } from "./scoring/bands";
import { processRecordReport } from "./process-record";
import { count, joinWithAnd } from "./text";
import type { MapValidationIssue } from "./process-validation";
import type { ProcessMapSnapshot } from "./process-graph";

export type MapHealthBand = "healthy" | "fair" | "at_risk" | "critical";

interface MapHealthDimension {
  id: string;
  label: string;
  score: number;
  weight: number;
  hint: string;
}

export interface MapHealthReport {
  score: number;
  band: MapHealthBand;
  bandLabel: string;
  summary: string;
  dimensions: MapHealthDimension[];
  issueCount: { errors: number; warns: number; infos: number };
  hotProcesses: number;
  unownedProcesses: number;
  processCount: number;
  avgHeat: number;
  customized: boolean;
}

/**
 * Composite 0–100 map health score from graph snapshots and validation
 * issues. Higher is better. It bands on the shared HEALTH_SCALE, so the map,
 * COSO and segregation indices use the same cutoffs, and the summary names
 * the dimension that scored lowest. A map with no processes has nothing to
 * score and says so.
 */
export function computeMapHealth(
  snapshots: ProcessMapSnapshot[],
  validationIssues: MapValidationIssue[],
  opts: { customized?: boolean } = {},
): MapHealthReport {
  const errors = validationIssues.filter((i) => i.severity === "error").length;
  const warns = validationIssues.filter((i) => i.severity === "warn").length;
  const infos = validationIssues.filter((i) => i.severity === "info").length;
  const issueCount = { errors, warns, infos };
  const customized = opts.customized ?? false;
  const integrity: MapHealthDimension = {
    id: "integrity",
    label: "Integrity",
    score: Math.max(0, 100 - errors * 35 - warns * 8),
    weight: 0.2,
    hint: integrityHint(validationIssues),
  };
  if (snapshots.length === 0) return emptyMapHealth(integrity, issueCount, customized);

  const total = snapshots.length;
  const owned = snapshots.filter((s) => s.owners.length > 0).length;
  const ownership = Math.round((owned / total) * 100);
  const withControls = snapshots.filter((s) => s.process.controlIds.length > 0).length;
  const controls = Math.round((withControls / total) * 100);
  const avgHeat = Math.round(snapshots.reduce((sum, s) => sum + s.heat, 0) / total);
  const calm = Math.max(0, 100 - avgHeat);
  const hotProcesses = snapshots.filter((s) => s.heat >= HEAT_BANDS.hot).length;
  const unownedProcesses = total - owned;
  const record = processRecordReport(snapshots.map((s) => s.process));

  const dimensions: MapHealthDimension[] = [
    integrity,
    {
      id: "ownership",
      label: "Ownership",
      score: ownership,
      weight: 0.2,
      hint: unownedProcesses
        ? `${count(unownedProcesses, "process", "processes")} without an owner`
        : "Every process has an owner",
    },
    {
      id: "controls",
      label: "Controls",
      score: controls,
      weight: 0.2,
      hint:
        withControls < total
          ? `${count(total - withControls, "process", "processes")} without controls`
          : "Controls mapped across the stream",
    },
    {
      // The same rule as the process record: a procedure counts once a
      // stand-in can find it.
      id: "documentation",
      label: "Written down",
      score: record.documentedIndex,
      weight: 0.1,
      hint:
        record.counts.none > 0
          ? `${record.counts.none} with nothing written down${record.counts.unlocated ? `, ${record.counts.unlocated} written but unlocated` : ""}`
          : record.counts.unlocated > 0
            ? `${record.counts.unlocated} written but location not recorded`
            : "Every process has a findable procedure",
    },
    {
      id: "calm",
      label: "Heat",
      score: calm,
      weight: 0.3,
      hint: hotProcesses
        ? `${count(hotProcesses, "hot process", "hot processes")} · average heat ${avgHeat}`
        : `Average heat ${avgHeat}`,
    },
  ];

  const score = Math.round(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0));
  const band = MAP_HEALTH_BANDS[healthLevel(score)];

  return {
    score,
    band: band.band,
    bandLabel: band.label,
    summary: bandSummary(band.opening, dimensions),
    dimensions,
    issueCount,
    hotProcesses,
    unownedProcesses,
    processCount: total,
    avgHeat,
    customized,
  };
}

/**
 * What lowered the Integrity score, in the terms the score counts: every
 * error and every warning costs points, so the hint names each kind that is
 * present rather than saying there are no broken dependencies.
 */
export function integrityHint(issues: readonly MapValidationIssue[]): string {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warn");
  const kind = (test: (id: string) => boolean) => warns.filter((i) => test(i.id)).length;
  const noOwner = kind((id) => id.startsWith("owner-") && !id.startsWith("owner-left-"));
  const ownerLeft = kind((id) => id.startsWith("owner-left-"));
  const unknownControl = kind((id) => id.startsWith("ctrl-"));
  const riskNoControl = kind((id) => id.startsWith("fraud-nocontrol-"));
  const other = warns.length - noOwner - ownerLeft - unknownControl - riskNoControl;
  const parts = [
    errors ? count(errors, "broken link or cycle", "broken links or cycles") : "",
    noOwner ? count(noOwner, "process without an owner", "processes without an owner") : "",
    ownerLeft ? count(ownerLeft, "process whose owner left", "processes whose owners left") : "",
    riskNoControl
      ? count(
          riskNoControl,
          "process with fraud risks and no control",
          "processes with fraud risks and no control",
        )
      : "",
    unknownControl
      ? count(unknownControl, "reference to an unknown control", "references to unknown controls")
      : "",
    other ? count(other, "other warning", "other warnings") : "",
  ].filter(Boolean);
  if (parts.length === 0) return "No broken dependencies or cycles";
  return `Lowered by ${joinWithAnd(parts)}`;
}

/** The band's opening, then the dimension that scored lowest and why, when any scored below 100. */
function bandSummary(opening: string, dimensions: readonly MapHealthDimension[]): string {
  const lowest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  if (!lowest || lowest.score >= 100) return opening;
  return `${opening} Lowest: ${lowest.label.toLowerCase()} (${lowest.score}), ${lowest.hint.charAt(0).toLowerCase()}${lowest.hint.slice(1)}.`;
}

/** A map with no processes: nothing to score beyond the validation issues. */
function emptyMapHealth(
  integrity: MapHealthDimension,
  issueCount: MapHealthReport["issueCount"],
  customized: boolean,
): MapHealthReport {
  const nothing = (id: string, label: string, weight: number): MapHealthDimension => ({
    id,
    label,
    score: 0,
    weight,
    hint: "No processes to score yet",
  });
  return {
    score: 0,
    band: "critical",
    bandLabel: "Nothing to score",
    summary: "The map has no processes yet. Add the work the business runs to score its health.",
    dimensions: [
      integrity,
      nothing("ownership", "Ownership", 0.2),
      nothing("controls", "Controls", 0.2),
      nothing("documentation", "Written down", 0.1),
      nothing("calm", "Heat", 0.3),
    ],
    issueCount,
    hotProcesses: 0,
    unownedProcesses: 0,
    processCount: 0,
    avgHeat: 0,
    customized,
  };
}

/** The map's name, label and opening sentence for each shared health level. */
const MAP_HEALTH_BANDS: Record<
  HealthLevel,
  { band: MapHealthBand; label: string; opening: string }
> = {
  strong: { band: "healthy", label: "Healthy", opening: "Well owned and controlled." },
  adequate: { band: "fair", label: "Fair", opening: "Fixable gaps." },
  weak: { band: "at_risk", label: "At risk", opening: "Several processes need attention." },
  critical: { band: "critical", label: "Critical", opening: "Act this week." },
};
