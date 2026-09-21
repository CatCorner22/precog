import { portfolioSummary, tornadoSensitivity } from "@/lib/precog/scoring/residual-engine";
import { detectSodConflicts } from "@/lib/precog/sod/detect";
import { mitigatedSodRuleIds, type DualReleasePolicy } from "@/lib/precog/controls/dual-release";
import {
  checkInPlan,
  coverageReport,
  documentationDebt,
  DOCUMENTATION_LABEL,
  STATUS_LABEL,
} from "@/lib/precog/continuity/coverage";
import {
  continuityCommitments,
  continuityStepKey,
  localDateKey,
  type ContinuityCommitment,
} from "@/lib/precog/decisions/follow-through";
import type { DecisionEntry } from "@/lib/precog/practice-profile";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import { HEAT_BANDS, type ProcessMapSnapshot } from "@/lib/precog/process-graph";
import {
  casesForControl,
  casesForSodRules,
  type CaseStudy,
  type ControlId,
} from "@/lib/precog/evidence";
import type { StaffComposition } from "@/lib/precog/types";

export interface WeeklyAction {
  id: string;
  title: string;
  why: string;
  effort: "low" | "medium" | "high";
  tab: string;
  priority: number;
  /** Deep-link to a process on the map tab. */
  processId?: string;
  /** The prosecuted cases this action rests on, where the library has any. */
  evidence?: ActionEvidence;
}

export interface ActionEvidence {
  caseCount: number;
  /** The largest recorded loss among those cases. */
  worst: { title: string; lossUsd: number; lossIsFloor: boolean } | null;
}

function evidenceFor(cases: readonly CaseStudy[]): ActionEvidence | undefined {
  if (cases.length === 0) return undefined;
  const withLoss = cases.filter((c) => c.lossUsd > 0);
  const worst = withLoss.reduce<CaseStudy | null>(
    (best, c) => (best === null || c.lossUsd > best.lossUsd ? c : best),
    null,
  );
  return {
    caseCount: cases.length,
    worst: worst
      ? { title: worst.title, lossUsd: worst.lossUsd, lossIsFloor: worst.lossIsFloor }
      : null,
  };
}

const STEP_VERB: Record<ContinuityCommitment["step"], string> = {
  cover: "training",
  handoff: "handing off",
  document: "writing down",
  locate: "locating the procedure for",
};

/**
 * A step the owner already logged in the Journal is not fresh advice. Until
 * the review date it is a low-priority "in progress" reminder; once the date
 * passes it becomes the week's question — did it happen? — pointing at the
 * Journal, where closing it as done also updates the register.
 */
function committedAction(
  c: ContinuityCommitment,
  priority: number,
  stillSays: string,
): WeeklyAction {
  const first = c.person?.name.split(" ")[0];
  const what =
    c.step === "cover" && first
      ? `${first} on ${c.item.name}`
      : `${STEP_VERB[c.step]} ${c.item.name}`;
  const logged = `You logged "${c.decision.subject}" on ${c.decision.createdAt.slice(0, 10)}${c.reviewBy ? ` with a review on ${c.reviewBy}` : ""}; the register still says ${stillSays}.`;
  if (c.overdue) {
    return {
      id: `commit-${c.decision.id}`,
      title:
        c.step === "cover"
          ? first
            ? `Review overdue: can ${first} run ${c.item.name} alone yet?`
            : `Review overdue: is ${c.item.name} backed up yet?`
          : c.step === "document"
            ? `Review overdue: is ${c.item.name} written down yet?`
            : c.step === "locate"
              ? `Review overdue: where does the ${c.item.name} procedure live?`
              : `Review overdue: ${c.item.name} hand-off`,
      why: `${logged} Close it in the Journal as done, which updates the register, or push the review date if it is still in progress.`,
      effort: "low",
      tab: "journal",
      priority,
    };
  }
  return {
    id: `commit-${c.decision.id}`,
    title: `In progress: ${what}${c.reviewBy ? ` — review ${c.reviewBy}` : ""}`,
    why: `${logged} Nothing new to start; if it has already happened, close it as done in the Journal.`,
    effort: "low",
    tab: "journal",
    priority: 40,
  };
}

function casesForControls(ids: readonly ControlId[]): CaseStudy[] {
  const seen = new Map<string, CaseStudy>();
  for (const id of ids) for (const c of casesForControl(id)) seen.set(c.id, c);
  return [...seen.values()];
}

export function buildWeeklyActions(input: {
  tpl: IndustryTemplate;
  staff: StaffComposition;
  dualRelease: DualReleasePolicy;
  mapSnapshots?: ProcessMapSnapshot[];
  today?: string;
  trackFreshness?: boolean;
  /** The Journal, so steps already logged are reported as in progress rather than recommended again. */
  decisions?: readonly DecisionEntry[];
}): WeeklyAction[] {
  const { tpl } = input;
  const today = input.today ?? localDateKey(new Date());
  const committed = continuityCommitments(input.decisions ?? [], tpl, today);
  const portfolio = portfolioSummary(tpl, input.staff);
  const sod = detectSodConflicts(tpl, input.staff, {
    dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(input.dualRelease),
  });
  const continuity = coverageReport(tpl);
  const tornado = tornadoSensitivity(tpl, input.staff);
  const actions: WeeklyAction[] = [];

  if (!input.staff.independentBankRec) {
    actions.push({
      id: "bank-rec",
      title: "Start owner weekly bank reconciliation",
      why: "Owner sees the bank's record without going through the person who posts payments — catches errors and diverted payments early.",
      effort: "low",
      tab: "sod",
      priority: 95,
      evidence: evidenceFor(
        casesForControls(["owner-opens-bank-statement", "independent-bank-reconciliation"]),
      ),
    });
  }

  if (!input.staff.dualControlPayments) {
    actions.push({
      id: "dual-control",
      title: "Enable dual control on payments",
      why: "Separates payment release from vendor setup, so an invented supplier needs a second person to get paid. Narrows the path above the threshold; does not close it below.",
      effort: "medium",
      tab: "sod",
      priority: 90,
      evidence: evidenceFor(
        casesForControls(["dual-release-above-threshold", "new-payee-second-approval"]),
      ),
    });
  }

  for (const c of sod.conflicts.filter((x) => x.severity === "critical").slice(0, 2)) {
    actions.push({
      id: `sod-${c.ruleId}`,
      title: `Split ${c.labelA.toLowerCase()} from ${c.labelB.toLowerCase()}`,
      why: c.why || "Incompatible duties are concentrated on one role.",
      effort: "medium",
      tab: "sod",
      priority: 88,
      evidence: evidenceFor(casesForSodRules([c.ruleId])),
    });
  }

  for (const m of continuity.plan
    .filter((x) => x.item.criticality === "critical" && x.status !== "thin")
    .slice(0, 2)) {
    const priority = m.status === "uncovered" ? 86 : 82;
    const c = committed.get(continuityStepKey(m.item.id, "cover"));
    if (c) {
      actions.push(committedAction(c, priority, STATUS_LABEL[m.status].toLowerCase()));
      continue;
    }
    actions.push({
      id: `spof-${m.item.id}`,
      title:
        m.status === "uncovered"
          ? `Find someone to own ${m.item.name}`
          : m.trainee
            ? `Cross-train ${m.trainee.name.split(" ")[0]} on ${m.item.name}`
            : `Cross-train a backup for ${m.item.name}`,
      why: `${m.action} One person holding critical work is both a continuity gap and a fraud-detection blind spot.`,
      effort: m.item.documented ? "low" : "medium",
      tab: "knowledge",
      priority,
    });
  }

  for (const g of documentationDebt(tpl)
    .gaps.filter((x) => x.item.criticality === "critical")
    .slice(0, 2)) {
    const priority =
      g.state === "none" ? (g.coverage === "single" || g.coverage === "uncovered" ? 84 : 78) : 72;
    const c = committed.get(
      continuityStepKey(g.item.id, g.state === "none" ? "document" : "locate"),
    );
    if (c) {
      actions.push(committedAction(c, priority, DOCUMENTATION_LABEL[g.state].toLowerCase()));
      continue;
    }
    actions.push({
      id: `docs-${g.item.id}`,
      title:
        g.state === "none"
          ? `Write down ${g.item.name}`
          : `Record where ${g.item.name}'s procedure lives`,
      why: `${g.action} A stand-in cannot follow steps that exist only in someone's head, and an unwritten process is one nobody else can check.`,
      effort: g.state === "none" ? "medium" : "low",
      tab: "knowledge",
      priority,
    });
  }

  if (input.trackFreshness) {
    const plan = checkInPlan(tpl, today);
    const first = plan.checkIns[0];
    if (first) {
      const others = plan.checkIns.length - 1;
      const soleNote =
        first.soleCount > 0 ? `${first.soleCount} of them nobody else can run alone. ` : "";
      actions.push({
        id: `check-in-${first.person.id}`,
        title: `Check in with ${first.person.name.split(" ")[0]}: ${first.items.length} register ${first.items.length === 1 ? "entry" : "entries"}`,
        why: `The register says ${first.person.name} can do ${first.items
          .slice(0, 3)
          .map((entry) => entry.item.name)
          .join(
            ", ",
          )}${first.items.length > 3 ? ` and ${first.items.length - 3} more` : ""}, but nobody has confirmed it in 90+ days. ${soleNote}Ask, then mark each still does it / level changed / no longer.${
          others > 0
            ? ` ${others} more ${others === 1 ? "person" : "people"} to check in with after that.`
            : ""
        }${plan.unheld.length > 0 ? ` ${plan.unheld.length} stale item(s) nobody active holds.` : ""}`,
        effort: "low",
        tab: "knowledge",
        priority: first.soleCount > 0 ? 64 : 60,
      });
    } else if (plan.unheld.length > 0) {
      actions.push({
        id: "confirm-register",
        title: `Re-confirm ${plan.unheld.length} register item(s) nobody holds`,
        why: `${plan.unheld[0].action} ${
          plan.unheld.length > 1 ? `${plan.unheld.length - 1} more item(s) also need a check.` : ""
        }`.trim(),
        effort: "low",
        tab: "knowledge",
        priority: 60,
      });
    }
  }

  const leanedOn = continuity.people.find((l) => l.person.active);
  if (leanedOn && leanedOn.dependence >= 50 && leanedOn.soleItems.length >= 2) {
    actions.push({
      id: `dependence-${leanedOn.person.id}`,
      title: `Spread ${leanedOn.person.name.split(" ")[0]}'s sole duties`,
      why: `${leanedOn.dependence}% of critical work stops if ${leanedOn.person.name} is out — ${leanedOn.soleItems.length} items nobody else can run. Run the absence check on the Who-knows-what tab.`,
      effort: "medium",
      tab: "knowledge",
      priority: 80,
    });
  }

  const topRisk = portfolio.top[0];
  if (topRisk && topRisk.residual >= 60) {
    actions.push({
      id: `residual-${topRisk.id}`,
      title: `Review ${topRisk.name}`,
      why: topRisk.bandGuidance,
      effort: topRisk.band === "critical_path" ? "high" : "medium",
      tab: "residual",
      priority: topRisk.residual,
    });
  }

  const bestLever = tornado.levers[0];
  if (bestLever && bestLever.delta >= 3) {
    actions.push({
      id: `tornado-${bestLever.id}`,
      title: bestLever.label,
      why: `Could lower average residual by ~${Math.round(bestLever.delta)} points.`,
      effort: bestLever.id === "bank" || bestLever.id === "dual" ? "low" : "medium",
      tab: "residual",
      priority: 70 + Math.min(20, bestLever.delta),
    });
  }

  if (input.mapSnapshots?.length) {
    for (const snap of input.mapSnapshots.filter((s) => s.heat >= HEAT_BANDS.hot).slice(0, 2)) {
      const gaps = snap.controlGaps.filter((c) => !c.segregated).length;
      actions.push({
        id: `map-heat-${snap.process.id}`,
        title: `Review hot process: ${snap.process.name}`,
        why: `Heat ${snap.heat} — ${snap.risks.length} risk(s)${gaps ? `, ${gaps} SoD gap(s)` : ""}. Open the map builder to assign owners and controls.`,
        effort: gaps > 0 ? "medium" : "low",
        tab: "map",
        processId: snap.process.id,
        priority: Math.min(92, snap.heat + 5),
      });
    }

    const unowned = input.mapSnapshots.filter((s) => !s.owners.length).slice(0, 1);
    for (const snap of unowned) {
      actions.push({
        id: `map-owner-${snap.process.id}`,
        title: `Assign owner: ${snap.process.name}`,
        why: "Processes without owners don't get SoD or continuity scoring — assign someone on your team.",
        effort: "low",
        tab: "map",
        processId: snap.process.id,
        priority: 75,
      });
    }
  }

  const seen = new Set<string>();
  const unique = actions
    .filter((a) => {
      const key = a.title.toLowerCase().slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
  return unique;
}
