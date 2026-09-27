/**
 * Leading indicators — early signals before loss materializes.
 * Weighted composite used by forecast drift and coach critique.
 *
 * Every threshold, weight and band here is this app's assumption, listed in
 * the report's `assumptions`; none is measured or taken from a study.
 */
import type { StaffComposition } from "../types";
import type { IndustryTemplate } from "../templates";
import type { RiskVariableState } from "../scoring/dynamic-variables";
import { findKnowledgeRisks } from "../engine";
import { portfolioSummary } from "../scoring/residual-engine";
import { assessCoso } from "../coso";
import { RISK_SCALE } from "../scoring/bands";
import { formatUsd } from "../../utils";

type IndicatorStatus = "ok" | "watch" | "breach";

interface LeadingIndicator {
  id: string;
  label: string;
  value: number;
  threshold: number;
  status: IndicatorStatus;
  weight: number;
  why: string;
  linkedTab?: string;
}

interface LeadingIndicatorReport {
  pressureIndex: number; // 0–100
  band: "calm" | "watch" | "heat" | "red";
  indicators: LeadingIndicator[];
  topActions: string[];
  method: string;
  /** Each threshold, weight and band cutoff, stated as this app's assumption. */
  assumptions: string[];
}

export function scoreLeadingIndicators(
  tpl: IndustryTemplate,
  staff: StaffComposition,
  riskVars: RiskVariableState,
): LeadingIndicatorReport {
  const { controls } = tpl;
  const portfolio = portfolioSummary(tpl, staff);
  const coso = assessCoso(tpl, staff, { riskVariables: riskVars });
  const spofs = findKnowledgeRisks(tpl).filter(
    (r) => r.soleOwner && r.riskScore >= RISK_SCALE.actNow,
  );
  const openSod = controls.filter((c) => !c.segregated && !c.residualRiskAccepted).length;
  const { weights, lines } = INDICATOR_ASSUMPTIONS;

  const indicators: LeadingIndicator[] = [
    {
      id: "li_spof",
      label: "Critical know-how held by one person",
      value: spofs.length,
      threshold: lines.soleHeld.watch,
      status: status(spofs.length, lines.soleHeld),
      weight: weights.soleHeld,
      why: "When the only person who can do this is away, the work and the check on it both stop",
      linkedTab: "knowledge",
    },
    {
      id: "li_open_sod",
      label: "Open duty conflicts not accepted",
      value: openSod,
      threshold: lines.openConflicts.watch,
      status: status(openSod, lines.openConflicts),
      weight: weights.openConflicts,
      why: "Open duty conflicts on cash and vendor payments that nobody has fixed or accepted",
      linkedTab: "sod",
    },
    {
      id: "li_bank_rec",
      label: "Independent bank reconciliation",
      value: staff.independentBankRec ? 1 : 0,
      threshold: 1,
      status: staff.independentBankRec ? "ok" : "breach",
      weight: weights.bankRec,
      why: "Without an independent reconciliation, fraud takes longer to find",
      linkedTab: "precog",
    },
    {
      id: "li_dual",
      label: "Dual release on payments",
      value: staff.dualControlPayments ? 1 : 0,
      threshold: 1,
      status: staff.dualControlPayments ? "ok" : "breach",
      weight: weights.dualControl,
      why: "One person can still move money alone, and there is nothing to show a carrier",
      linkedTab: "precog",
    },
    {
      id: "li_residual",
      label: "Average residual risk",
      value: portfolio.averageResidual,
      threshold: lines.averageResidual.watch,
      status: status(portfolio.averageResidual, lines.averageResidual),
      weight: weights.averageResidual,
      why: "The average residual risk is already high",
      linkedTab: "residual",
    },
    {
      id: "li_coso_monitor",
      label: "COSO overall",
      value: coso.overall,
      threshold: lines.coso.watchBelow,
      status:
        coso.overall < lines.coso.breachBelow
          ? "breach"
          : coso.overall < lines.coso.watchBelow
            ? "watch"
            : "ok",
      weight: weights.coso,
      why: "A weak control system makes other failures harder to notice",
      linkedTab: "coso",
    },
    {
      id: "li_claims",
      label: "Claims load factor",
      value: riskVars.claimsLoadFactor,
      threshold: lines.claimsLoad.watch,
      status: status(riskVars.claimsLoadFactor, lines.claimsLoad),
      weight: weights.claimsLoad,
      why: "Past claims raise the modeled chance of dishonesty loss",
      linkedTab: "precog",
    },
    {
      id: "li_cash",
      label: "Daily cash exposure",
      value: riskVars.dailyCashExposure,
      threshold: lines.dailyCash.watch,
      status: status(riskVars.dailyCashExposure, lines.dailyCash),
      weight: weights.dailyCash,
      why: "More cash through the business makes a scheme larger",
      linkedTab: "precog",
    },
    {
      id: "li_seg",
      label: "Segregation score",
      value: staff.segregationScore,
      threshold: lines.segregation.watchBelow,
      status:
        staff.segregationScore < lines.segregation.breachBelow
          ? "breach"
          : staff.segregationScore < lines.segregation.watchBelow
            ? "watch"
            : "ok",
      weight: weights.segregation,
      why: "Weak separation of duties raises the risk on every cash path",
      linkedTab: "residual",
    },
  ];

  // Pressure: breaches count in full, watches at WATCH_SHARE of their weight.
  let pressure = 0;
  let maxW = 0;
  for (const ind of indicators) {
    maxW += ind.weight;
    if (ind.status === "breach") pressure += ind.weight;
    else if (ind.status === "watch") pressure += ind.weight * WATCH_SHARE;
  }
  const pressureIndex = Math.round((pressure / maxW) * 100);
  const band: LeadingIndicatorReport["band"] =
    pressureIndex >= PRESSURE_BANDS.red
      ? "red"
      : pressureIndex >= PRESSURE_BANDS.heat
        ? "heat"
        : pressureIndex >= PRESSURE_BANDS.watch
          ? "watch"
          : "calm";

  const topActions = indicators
    .filter((i) => i.status !== "ok")
    .sort((a, b) => statusRank(b.status) * b.weight - statusRank(a.status) * a.weight)
    .slice(0, 4)
    .map((i) => `${i.label}: ${i.why}`);

  return {
    pressureIndex,
    band,
    indicators,
    topActions,
    method: "Weighted count of the indicators past this app's watch and breach lines",
    assumptions: ASSUMPTION_LINES,
  };
}

/** Breach first, then watch, then clear: the order the Signals list and the actions use. */
export function statusRank(status: IndicatorStatus): number {
  return status === "breach" ? 2 : status === "watch" ? 1 : 0;
}

function status(value: number, line: { watch: number; breach: number }): IndicatorStatus {
  return value >= line.breach ? "breach" : value >= line.watch ? "watch" : "ok";
}

/** This app's choices, not measured: where each indicator turns watch or breach, and its weight. */
const INDICATOR_ASSUMPTIONS = {
  lines: {
    soleHeld: { watch: 1, breach: 2 },
    openConflicts: { watch: 1, breach: 2 },
    averageResidual: { watch: 50, breach: 65 },
    coso: { watchBelow: 65, breachBelow: 50 },
    claimsLoad: { watch: 1.15, breach: 1.3 },
    dailyCash: { watch: 4000, breach: 6000 },
    segregation: { watchBelow: 55, breachBelow: 40 },
  },
  weights: {
    soleHeld: 1.2,
    openConflicts: 1.3,
    bankRec: 1.4,
    dualControl: 1.2,
    averageResidual: 1.1,
    coso: 0.9,
    claimsLoad: 0.7,
    dailyCash: 0.6,
    segregation: 1.0,
  },
} as const;

/** A watch counts for this share of its weight in the pressure index; a breach counts in full. */
const WATCH_SHARE = 0.45;

/** Pressure index cutoffs for the calm / watch / heat / red bands. */
const PRESSURE_BANDS = { watch: 25, heat: 45, red: 70 } as const;

const { lines: L, weights: W } = INDICATOR_ASSUMPTIONS;

const ASSUMPTION_LINES: string[] = [
  "Every threshold, weight and band below is this app's assumption about what to watch first, not a measured or published figure.",
  `Critical know-how held by one person: watch at ${L.soleHeld.watch} item, breach at ${L.soleHeld.breach}; weight ${W.soleHeld}.`,
  `Open duty conflicts not accepted: watch at ${L.openConflicts.watch}, breach at ${L.openConflicts.breach}; weight ${W.openConflicts}.`,
  `No independent bank reconciliation is a breach; weight ${W.bankRec}. No dual control on payments is a breach; weight ${W.dualControl}.`,
  `Average residual risk: watch at ${L.averageResidual.watch}, breach at ${L.averageResidual.breach}; weight ${W.averageResidual}.`,
  `COSO overall: watch below ${L.coso.watchBelow}, breach below ${L.coso.breachBelow}; weight ${W.coso}.`,
  `Claims load factor: watch at ${L.claimsLoad.watch}, breach at ${L.claimsLoad.breach}; weight ${W.claimsLoad}.`,
  `Daily cash exposure: watch at ${formatUsd(L.dailyCash.watch)}, breach at ${formatUsd(L.dailyCash.breach)}; weight ${W.dailyCash}.`,
  `Segregation score: watch below ${L.segregation.watchBelow}, breach below ${L.segregation.breachBelow}; weight ${W.segregation}.`,
  `Pressure counts a breach at its full weight and a watch at ${Math.round(WATCH_SHARE * 100)}%, as a share of all weights; bands start at ${PRESSURE_BANDS.watch} (watch), ${PRESSURE_BANDS.heat} (heat) and ${PRESSURE_BANDS.red} (red).`,
];
