import { HEALTH_SCALE } from "./scoring/bands";
import { processRecordReport } from "./process-record";
import { joinWithAnd } from "./text";
import type { MapValidationIssue } from "./process-validation";
import { HEAT_BANDS, type ProcessMapSnapshot } from "./process-graph";

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

// Reads against the shared HEALTH_SCALE so the map, COSO, and segregation
// indices band on the same cutoffs.
const HEALTH_BANDS: { min: number; band: MapHealthBand; label: string; summary: string }[] = [
  {
    min: HEALTH_SCALE.strong,
    band: "healthy",
    label: "Healthy",
    summary: "Well-owned and controlled — a few targeted fixes will sharpen scoring.",
  },
  {
    min: HEALTH_SCALE.adequate,
    band: "fair",
    label: "Fair",
    summary: "Fixable gaps — assign owners and wire controls on hot processes.",
  },
  {
    min: HEALTH_SCALE.weak,
    band: "at_risk",
    label: "At risk",
    summary: "Several processes need attention before residual risk stabilizes.",
  },
  {
    min: 0,
    band: "critical",
    label: "Critical",
    summary: "Act this week — broken links or unowned hot processes dominate risk.",
  },
];

function healthBand(score: number) {
  return HEALTH_BANDS.find((b) => score >= b.min) ?? HEALTH_BANDS[HEALTH_BANDS.length - 1];
}

/** Composite 0–100 map health score from graph snapshots + validation. Higher is better. */
function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
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
    errors ? counted(errors, "broken link or cycle", "broken links or cycles") : "",
    noOwner ? counted(noOwner, "process without an owner", "processes without an owner") : "",
    ownerLeft ? counted(ownerLeft, "process whose owner left", "processes whose owners left") : "",
    riskNoControl
      ? counted(
          riskNoControl,
          "process with fraud risks and no control",
          "processes with fraud risks and no control",
        )
      : "",
    unknownControl
      ? counted(unknownControl, "reference to an unknown control", "references to unknown controls")
      : "",
    other ? counted(other, "other warning", "other warnings") : "",
  ].filter(Boolean);
  if (parts.length === 0) return "No broken dependencies or cycles";
  return `Lowered by ${joinWithAnd(parts)}`;
}

export function computeMapHealth(
  snapshots: ProcessMapSnapshot[],
  validationIssues: MapValidationIssue[],
  opts: { customized?: boolean } = {},
): MapHealthReport {
  const total = Math.max(1, snapshots.length);
  const errors = validationIssues.filter((i) => i.severity === "error").length;
  const warns = validationIssues.filter((i) => i.severity === "warn").length;
  const infos = validationIssues.filter((i) => i.severity === "info").length;

  const integrity = Math.max(0, 100 - errors * 35 - warns * 8);
  const owned = snapshots.filter((s) => s.owners.length > 0).length;
  const ownership = Math.round((owned / total) * 100);
  const withControls = snapshots.filter((s) => s.process.controlIds.length > 0).length;
  const controls = Math.round((withControls / total) * 100);
  const avgHeat = Math.round(snapshots.reduce((sum, s) => sum + s.heat, 0) / total);
  const calm = Math.max(0, 100 - avgHeat);
  const hotProcesses = snapshots.filter((s) => s.heat >= HEAT_BANDS.hot).length;
  const unownedProcesses = total - owned;
  const record = processRecordReport(snapshots.map((s) => s.process));
  // Half credit for "written but nobody knows where": the procedure exists, a stand-in still has to hunt for it.
  const documentation =
    snapshots.length === 0
      ? 100
      : Math.round(((record.counts.located + record.counts.unlocated * 0.5) / total) * 100);

  const dimensions: MapHealthDimension[] = [
    {
      id: "integrity",
      label: "Integrity",
      score: integrity,
      weight: 0.2,
      hint: integrityHint(validationIssues),
    },
    {
      id: "ownership",
      label: "Ownership",
      score: ownership,
      weight: 0.2,
      hint: unownedProcesses
        ? `${unownedProcesses} process(es) unowned`
        : "Every process has an owner",
    },
    {
      id: "controls",
      label: "Controls",
      score: controls,
      weight: 0.2,
      hint:
        withControls < total
          ? `${total - withControls} without controls`
          : "Controls mapped across the stream",
    },
    {
      id: "documentation",
      label: "Written down",
      score: documentation,
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
        ? `${hotProcesses} hot process(es) · avg ${avgHeat}`
        : `Average heat ${avgHeat}`,
    },
  ];

  const score = Math.round(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0));
  const band = healthBand(score);

  return {
    score,
    band: band.band,
    bandLabel: band.label,
    summary: band.summary,
    dimensions,
    issueCount: { errors, warns, infos },
    hotProcesses,
    unownedProcesses,
    processCount: total,
    avgHeat,
    customized: opts.customized ?? false,
  };
}
