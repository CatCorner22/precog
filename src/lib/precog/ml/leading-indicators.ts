/**
 * Leading indicators — early signals before loss materializes.
 * Weighted composite used by forecast drift and coach critique.
 */
import type { StaffComposition } from "../types";
import type { RiskVariableState } from "../scoring/dynamic-variables";
import { controls } from "../demo-data";
import { findKnowledgeRisks } from "../engine";
import { portfolioSummary } from "../scoring/residual-engine";
import { assessCoso } from "../coso";

export interface LeadingIndicator {
  id: string;
  label: string;
  value: number;
  threshold: number;
  status: "ok" | "watch" | "breach";
  weight: number;
  why: string;
  linkedTab?: string;
}

export interface LeadingIndicatorReport {
  pressureIndex: number; // 0–100
  band: "calm" | "watch" | "heat" | "red";
  indicators: LeadingIndicator[];
  topActions: string[];
  method: string;
}

export function scoreLeadingIndicators(
  staff: StaffComposition,
  riskVars: RiskVariableState,
): LeadingIndicatorReport {
  const portfolio = portfolioSummary(staff);
  const coso = assessCoso();
  const spofs = findKnowledgeRisks().filter(
    (r) => r.soleOwner && r.riskScore >= 65,
  );
  const openSod = controls.filter(
    (c) => !c.segregated && !c.residualRiskAccepted,
  ).length;

  const indicators: LeadingIndicator[] = [
    {
      id: "li_spof",
      label: "Critical knowledge SPOFs",
      value: spofs.length,
      threshold: 1,
      status: spofs.length >= 2 ? "breach" : spofs.length >= 1 ? "watch" : "ok",
      weight: 1.2,
      why: "Sole owners create sudden process + control failure on leave",
      linkedTab: "knowledge",
    },
    {
      id: "li_open_sod",
      label: "Open SoD without acceptance",
      value: openSod,
      threshold: 1,
      status: openSod >= 2 ? "breach" : openSod >= 1 ? "watch" : "ok",
      weight: 1.3,
      why: "Unmeasured residual on cash / vendor paths",
      linkedTab: "sod",
    },
    {
      id: "li_bank_rec",
      label: "Independent bank rec",
      value: staff.independentBankRec ? 1 : 0,
      threshold: 1,
      status: staff.independentBankRec ? "ok" : "breach",
      weight: 1.4,
      why: "Missing recon lengthens fraud detection lag",
      linkedTab: "precog",
    },
    {
      id: "li_dual",
      label: "Dual control payments",
      value: staff.dualControlPayments ? 1 : 0,
      threshold: 1,
      status: staff.dualControlPayments ? "ok" : "breach",
      weight: 1.2,
      why: "Opportunity remains open; insurance credit not earned",
      linkedTab: "precog",
    },
    {
      id: "li_residual",
      label: "Avg residual risk",
      value: portfolio.averageResidual,
      threshold: 50,
      status:
        portfolio.averageResidual >= 65
          ? "breach"
          : portfolio.averageResidual >= 50
            ? "watch"
            : "ok",
      weight: 1.1,
      why: "Portfolio residual already elevated",
      linkedTab: "residual",
    },
    {
      id: "li_coso_monitor",
      label: "COSO overall",
      value: coso.overall,
      threshold: 60,
      status:
        coso.overall < 50 ? "breach" : coso.overall < 65 ? "watch" : "ok",
      weight: 0.9,
      why: "Weak control system reduces detection of other failures",
      linkedTab: "coso",
    },
    {
      id: "li_claims",
      label: "Claims load factor",
      value: riskVars.claimsLoadFactor,
      threshold: 1.15,
      status:
        riskVars.claimsLoadFactor >= 1.3
          ? "breach"
          : riskVars.claimsLoadFactor >= 1.15
            ? "watch"
            : "ok",
      weight: 0.7,
      why: "Prior claims load signals elevated dishonesty residual",
      linkedTab: "precog",
    },
    {
      id: "li_cash",
      label: "Daily cash exposure",
      value: riskVars.dailyCashExposure,
      threshold: 4000,
      status:
        riskVars.dailyCashExposure >= 6000
          ? "breach"
          : riskVars.dailyCashExposure >= 4000
            ? "watch"
            : "ok",
      weight: 0.6,
      why: "High cash intensity scales scheme severity",
      linkedTab: "precog",
    },
    {
      id: "li_seg",
      label: "Segregation score",
      value: staff.segregationScore,
      threshold: 55,
      status:
        staff.segregationScore < 40
          ? "breach"
          : staff.segregationScore < 55
            ? "watch"
            : "ok",
      weight: 1.0,
      why: "Low segregation multiplies residual across cash paths",
      linkedTab: "residual",
    },
  ];

  // Pressure: breaches and watches weighted
  let pressure = 0;
  let maxW = 0;
  for (const ind of indicators) {
    maxW += ind.weight;
    if (ind.status === "breach") pressure += ind.weight * 1.0;
    else if (ind.status === "watch") pressure += ind.weight * 0.45;
  }
  const pressureIndex = Math.round((pressure / maxW) * 100);
  const band: LeadingIndicatorReport["band"] =
    pressureIndex >= 70
      ? "red"
      : pressureIndex >= 45
        ? "heat"
        : pressureIndex >= 25
          ? "watch"
          : "calm";

  const topActions = indicators
    .filter((i) => i.status !== "ok")
    .sort((a, b) => {
      const rank = (s: LeadingIndicator["status"]) =>
        s === "breach" ? 2 : s === "watch" ? 1 : 0;
      return rank(b.status) * b.weight - rank(a.status) * a.weight;
    })
    .slice(0, 4)
    .map((i) => `${i.label}: ${i.why}`);

  return {
    pressureIndex,
    band,
    indicators,
    topActions,
    method: "weighted threshold leading-indicator composite",
  };
}
