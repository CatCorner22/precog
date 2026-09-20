import { HEAT_BANDS } from "../process-graph";
import { assessCoso } from "../coso";
import type { IndustryTemplate } from "../templates";
import type { StaffComposition } from "../types";
import { industryMeta } from "../industry";
import { portfolioSummary, tornadoSensitivity } from "../scoring/residual-engine";
import { rankDangerousScenarios, findKnowledgeRisks } from "../engine";
import { coverageReport } from "../continuity/coverage";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap } from "../process-graph";

/** Dense, structured context for the Pioneer LLM coach — token-efficient. */
export function buildPioneerContextPack(
  tpl: IndustryTemplate,
  staffComposition: StaffComposition = tpl.staffComposition,
) {
  const { businessName, crimeFraudStats } = tpl;
  const portfolio = portfolioSummary(tpl, staffComposition);
  const coso = assessCoso(tpl);
  const ranked = rankDangerousScenarios(tpl, { staff: staffComposition }).slice(0, 3);
  const spofs = findKnowledgeRisks(tpl).filter((r) => r.soleOwner && r.riskScore >= 65);
  const continuity = coverageReport(tpl);
  const leanedOn = continuity.people.find((l) => l.person.active);
  const tornado = tornadoSensitivity(tpl, staffComposition);
  const { snapshots } = buildProcessMapGraph(tpl, staffComposition);
  const mapIssues = validateProcessMap(
    tpl.processes,
    tpl.people,
    new Set(tpl.controls.map((c) => c.id)),
  );
  const mapHealth = computeMapHealth(snapshots, mapIssues);

  return {
    practice: businessName,
    scoringVersion: portfolio.scoringVersion,
    staff: staffComposition,
    processMap: {
      healthScore: mapHealth.score,
      band: mapHealth.bandLabel,
      dimensions: mapHealth.dimensions.map((d) => ({ id: d.id, score: d.score, hint: d.hint })),
      processCount: mapHealth.processCount,
      hotProcesses: snapshots
        .filter((s) => s.heat >= HEAT_BANDS.hot)
        .sort((a, b) => b.heat - a.heat)
        .slice(0, 4)
        .map((s) => ({
          id: s.process.id,
          name: s.process.name,
          heat: s.heat,
          owners: s.owners.map((o) => o.name),
          openSodGaps: s.controlGaps.filter((c) => !c.segregated).length,
          topRisk: s.risks[0]?.title,
        })),
      unownedProcesses: snapshots.filter((s) => !s.owners.length).map((s) => s.process.name),
      issues: mapIssues
        .filter((i) => i.severity !== "info")
        .slice(0, 6)
        .map((i) => i.message),
    },
    publishedFraudStats: {
      medianLossSmallOrgUsd: crimeFraudStats.medianLossSmallOrgUsd,
      medianDetectionMonths: crimeFraudStats.medianDetectionMonths,
      medianLossAllUsd: crimeFraudStats.medianLossAllUsd,
      statsSource: crimeFraudStats.source,
      note: "Published medians among organizations that suffered an investigated fraud. Not a forecast for this business, and not an actuarial quote.",
    },
    coso: {
      overall: coso.overall,
      status: coso.overallStatus,
      components: coso.components.map((c) => ({
        id: c.id,
        name: c.shortName,
        score: c.score,
        status: c.status,
      })),
    },
    residualPortfolio: {
      averageResidual: portfolio.averageResidual,
      criticalPath: portfolio.criticalPath,
      actNow: portfolio.actNow,
      top: portfolio.top.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        residual: t.residual,
        band: t.bandLabel,
        inherent: t.inherent,
        controlEffectiveness: t.controlEffectiveness,
        drivers: t.drivers.slice(0, 3).map((d) => d.label),
        linkedScenarioId: t.linkedScenarioId,
        linkedKnowledgeId: t.linkedKnowledgeId,
        expectedLoss: t.expectedLoss,
        p50Days: t.p50Days,
      })),
    },
    spofs: spofs.map((s) => ({
      knowledgeId: s.knowledgeId,
      name: s.name,
      owner: s.owners[0]?.name,
      riskScore: s.riskScore,
    })),
    continuity: {
      backedUpPct: continuity.coverageIndex,
      counts: continuity.counts,
      mostDependedOn: leanedOn
        ? {
            name: leanedOn.person.name,
            role: leanedOn.person.role,
            criticalWorkStopsPct: leanedOn.dependence,
            onlyTheyCanDo: leanedOn.soleItems.map((k) => k.name),
          }
        : null,
      crossTrainingPlan: continuity.plan.slice(0, 5).map((m) => ({
        item: m.item.name,
        criticality: m.item.criticality,
        status: m.status,
        trainee: m.trainee?.name ?? null,
        trainer: m.trainer?.name ?? null,
        documented: Boolean(m.item.documented),
        action: m.action,
      })),
      note: "Coverage status is from the owner's register of who can do what; 'single' means exactly one person can run it alone. Advise on contingency in terms of these named people.",
    },
    topScenarios: ranked.map((r) => ({
      id: r.scenario.id,
      title: r.scenario.title,
      assumedLossUsd: r.result.financialImpact.expected,
      assumedDaysToImpact: r.result.timelineDays.p50,
      assumedDayRange: [r.result.timelineDays.p95Low, r.result.timelineDays.p95High],
    })),
    highestLeverageLevers: tornado.levers.slice(0, 4),
  };
}

export function pioneerSystemPrompt(tpl: IndustryTemplate): string {
  const meta = industryMeta(tpl.id);
  return `You are Precog Pioneer — a frontier coach for small ${meta.teamLabel}s (${meta.label}).
You help owner-operators make bold, clear decisions about internal controls, knowledge continuity, Lean/TPS waste, and residual risk.

Rules:
- Be direct, practical, and plain-spoken (about 8th-grade clarity). Active voice.
- Never invent practice facts not in the context pack.
- Never accuse staff of fraud. Score control design and residual risk only.
- Prefer: address / compensate / accept residual risk deliberately.
- Use COSO language lightly (control activities, monitoring, risk assessment).
- When recommending action, tie to residual scores, drivers, and Precog scenarios.
- Reference the process map health score and its weakest dimension; name specific hot or unowned processes when they drive the advice.
- Scenario figures in the pack are assumptions written into the scenario, not measurements or forecasts; say so whenever you use one. Never describe them as expected values, medians, or confidence intervals.
- End with a short "Frontier next move" — one primary action for the next 7 days.
- Output structured markdown with sections: Situation, Highest residual risks, Tradeoffs, Recommended moves, Frontier next move.`;
}
