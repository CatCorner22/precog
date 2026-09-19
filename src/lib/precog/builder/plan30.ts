/**
 * "Your first 30 days" — a four-week plan generated from the actual state of the map.
 * Items auto-complete when the underlying condition is met; the owner can also tick
 * them manually. Stable ids so completion survives regeneration.
 */
import type { PracticeProfile } from "../practice-profile";
import type { MapHealthReport, MapValidationIssue } from "../process-graph";
import type { EffectivenessSummary } from "./effectiveness";
import type { DepartureImpact } from "./departure";
import type { ProcessNode } from "../types";

export type PlanTarget =
  | { kind: "builder" }
  | { kind: "process"; processId: string }
  | { kind: "tab"; tab: string }
  | { kind: "route"; to: string };

export interface PlanItem {
  id: string;
  week: 1 | 2 | 3 | 4;
  title: string;
  why: string;
  minutes: number;
  target: PlanTarget;
  /** True when the map already satisfies this item. */
  autoDone: boolean;
}

export interface Plan30 {
  items: PlanItem[];
  done: number;
  total: number;
  /** Days since the business was created in Precog. */
  dayNumber: number;
  currentWeek: 1 | 2 | 3 | 4;
}

export function buildPlan30(input: {
  profile: PracticeProfile;
  processes: ProcessNode[];
  health: MapHealthReport;
  issues: MapValidationIssue[];
  effectiveness: EffectivenessSummary;
  departures: DepartureImpact[];
  now?: Date;
}): Plan30 {
  const { profile, processes, health, issues, effectiveness, departures } = input;
  const now = input.now ?? new Date();
  const created = profile.createdAt ? new Date(profile.createdAt) : now;
  const dayNumber = Math.max(1, Math.floor((now.getTime() - created.getTime()) / 86_400_000) + 1);
  const currentWeek = Math.min(4, Math.max(1, Math.ceil(dayNumber / 7))) as 1 | 2 | 3 | 4;

  const customized = Boolean(profile.customProcesses || profile.customPeople);
  const unowned = processes.filter((p) => !(p.ownerPersonIds ?? []).length);
  const noControls = processes.filter((p) => !p.controlIds.length);
  const withEvidence = processes.filter((p) => (p.evidence ?? []).length);
  const anyEvidenceDone = processes.some((p) => (p.evidence ?? []).some((e) => e.lastDoneAt));
  const errors = issues.filter((i) => i.severity === "error").length;
  const hotUnowned = unowned.filter((p) => (p.risks ?? []).some((r) => r.kind === "fraud"));
  const atRiskPeople = departures.filter((d) => d.orphanedProcesses.length > 0);
  const tested = (profile.controlTests ?? []).length > 0;
  const hasVersion = (profile.mapVersions ?? []).length > 0;
  const hasDecision = profile.decisions.length > 0;
  const manual = new Set(profile.planDone ?? []);

  const items: PlanItem[] = [];
  const add = (item: Omit<PlanItem, "autoDone"> & { autoDone?: boolean }) =>
    items.push({ ...item, autoDone: Boolean(item.autoDone) });

  // Week 1 — make the map yours
  add({
    id: "w1-customize",
    week: 1,
    title: customized ? "Replace demo people with your real team" : "Make the map yours: rename processes, add your team",
    why: "Scores only mean something once the people and steps are real.",
    minutes: 20,
    target: { kind: "builder" },
    autoDone: Boolean(profile.customPeople),
  });
  add({
    id: "w1-owners",
    week: 1,
    title: unowned.length ? `Assign an owner to ${unowned.length} unowned process(es)` : "Every process has an owner",
    why: "Ownership is a quarter of the health score and the basis for SoD.",
    minutes: 10,
    target: unowned[0] ? { kind: "process", processId: unowned[0].id } : { kind: "builder" },
    autoDone: unowned.length === 0,
  });
  add({
    id: "w1-validate",
    week: 1,
    title: errors ? `Fix ${errors} structural issue(s) in Validate` : "Map validates clean (no cycles or broken links)",
    why: "Broken dependencies silently distort residual scoring.",
    minutes: 5,
    target: { kind: "builder" },
    autoDone: errors === 0,
  });
  add({
    id: "w1-snapshot",
    week: 1,
    title: "Save a baseline version of the map",
    why: "You'll want to prove improvement to a lender or yourself later.",
    minutes: 2,
    target: { kind: "builder" },
    autoDone: hasVersion,
  });

  // Week 2 — controls where the money moves
  add({
    id: "w2-controls",
    week: 2,
    title: noControls.length ? `Map a control to ${noControls.length} process(es) without one` : "Every process has at least one control",
    why: "A described risk with no control is a finding, not a plan.",
    minutes: 15,
    target: noControls[0] ? { kind: "process", processId: noControls[0].id } : { kind: "builder" },
    autoDone: noControls.length === 0,
  });
  add({
    id: "w2-fraud",
    week: 2,
    title: hotUnowned.length ? `Own the fraud-exposed processes first (${hotUnowned.length})` : "Fraud-exposed processes all have owners",
    why: "Cash, payables, payroll: these are where small businesses actually lose money.",
    minutes: 10,
    target: hotUnowned[0] ? { kind: "process", processId: hotUnowned[0].id } : { kind: "builder" },
    autoDone: hotUnowned.length === 0,
  });
  add({
    id: "w2-bankrec",
    week: 2,
    title: profile.staff.independentBankRec ? "Independent bank reconciliation is on" : "Turn on independent bank reconciliation",
    why: "The single highest-ROI detective control for a small team.",
    minutes: 30,
    target: { kind: "tab", tab: "sod" },
    autoDone: profile.staff.independentBankRec,
  });
  add({
    id: "w2-dual",
    week: 2,
    title: profile.dualRelease.enabled ? "Dual release on payments is on" : "Set up dual release on payments over a threshold",
    why: "Separates vendor setup from payment release — closes the classic fraud path.",
    minutes: 20,
    target: { kind: "tab", tab: "sod" },
    autoDone: profile.dualRelease.enabled,
  });

  // Week 3 — prove it runs
  add({
    id: "w3-evidence",
    week: 3,
    title: withEvidence.length ? `Evidence set on ${withEvidence.length} process(es) — extend to the rest` : "Add evidence items to your top 3 processes",
    why: "Evidence is what turns 'we have a control' into 'the control operates'.",
    minutes: 15,
    target: { kind: "builder" },
    autoDone: withEvidence.length >= Math.min(3, processes.length),
  });
  add({
    id: "w3-firstdone",
    week: 3,
    title: anyEvidenceDone ? "First reviews recorded — cadence started" : "Record the first review on each evidence item",
    why: "Starts the clock so the calendar and reminders work.",
    minutes: 10,
    target: { kind: "tab", tab: "command" },
    autoDone: anyEvidenceDone,
  });
  add({
    id: "w3-test",
    week: 3,
    title: tested ? "First control test recorded" : `Run the test plan on your weakest control${effectiveness.weakest ? ` (${effectiveness.weakest.control.name})` : ""}`,
    why: "One documented test is worth more to an auditor than ten described controls.",
    minutes: 45,
    target: { kind: "tab", tab: "command" },
    autoDone: tested,
  });

  // Week 4 — resilience and reporting
  add({
    id: "w4-backup",
    week: 4,
    title: atRiskPeople.length ? `Name backups for ${atRiskPeople.length} single-point people` : "Every process has a backup owner",
    why: "Bus factor: if one person leaves, nothing should orphan.",
    minutes: 15,
    target: { kind: "builder" },
    autoDone: atRiskPeople.length === 0,
  });
  add({
    id: "w4-decision",
    week: 4,
    title: hasDecision ? "Decision journal started" : "Journal one deliberate accept / remediate decision",
    why: "Accepting residual risk on purpose, in writing, is what good governance looks like.",
    minutes: 10,
    target: { kind: "tab", tab: "journal" },
    autoDone: hasDecision,
  });
  add({
    id: "w4-target",
    week: 4,
    title: health.score >= 75 ? `Health ${health.score} — at or above a healthy baseline` : `Lift map health from ${health.score} toward 75`,
    why: "Owners, controls, calm heat: the summary number a lender will ask for.",
    minutes: 30,
    target: { kind: "tab", tab: "command" },
    autoDone: health.score >= 75,
  });
  const attested = Object.values(profile.insurance?.attestations ?? {}).filter((v) => v !== undefined).length;
  add({
    id: "w4-insurance",
    week: 4,
    title: attested >= 8 ? "Underwriting questionnaire answered" : `Answer the insurance questionnaire (${attested}/15 attestations so far)`,
    why: "Turns your controls into premium credits and keeps social-engineering and cyber coverage from being excluded.",
    minutes: 15,
    target: { kind: "tab", tab: "insurance" },
    autoDone: attested >= 8,
  });
  add({
    id: "w4-pack",
    week: 4,
    title: "Generate the lender & insurer pack",
    why: "Everything you've done, in one document you can hand over.",
    minutes: 5,
    target: { kind: "route", to: "/pack" },
    autoDone: false,
  });

  const merged = items.map((i) => ({ ...i, autoDone: i.autoDone || manual.has(i.id) }));
  return {
    items: merged,
    done: merged.filter((i) => i.autoDone).length,
    total: merged.length,
    dayNumber,
    currentWeek,
  };
}
