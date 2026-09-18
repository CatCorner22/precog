import { assessCoso } from "../coso";
import { getActiveTemplate } from "../active-template";
import { industryMeta } from "../industry";
import { portfolioSummary, tornadoSensitivity } from "../scoring/residual-engine";
import { rankDangerousScenarios, findKnowledgeRisks } from "../engine";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap } from "../process-graph";

/** Dense, structured context for the Pioneer LLM coach — token-efficient. */
export function buildPioneerContextPack() {
  const tpl = getActiveTemplate();
  const { businessName, staffComposition, crimeFraudStats } = tpl;
  const portfolio = portfolioSummary();
  const coso = assessCoso();
  const ranked = rankDangerousScenarios().slice(0, 3);
  const spofs = findKnowledgeRisks().filter((r) => r.soleOwner && r.riskScore >= 65);
  const tornado = tornadoSensitivity();
  const { snapshots } = buildProcessMapGraph(staffComposition);
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
        .filter((s) => s.heat >= 68)
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
    crimePrior: {
      annualExposureClass: crimeFraudStats.industryEmbezzlementRate,
      medianDetectionDays: crimeFraudStats.medianDetectionDays,
      midLossRef: crimeFraudStats.typicalLossMid,
      note: "Educational industry-oriented priors, not actuarial quotes.",
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
    topScenarios: ranked.map((r) => ({
      id: r.scenario.id,
      title: r.scenario.title,
      expected: r.result.financialImpact.expected,
      p50: r.result.timelineDays.p50,
      p95: [r.result.timelineDays.p95Low, r.result.timelineDays.p95High],
    })),
    highestLeverageLevers: tornado.levers.slice(0, 4),
  };
}

export function pioneerSystemPrompt(): string {
  const meta = industryMeta(getActiveTemplate().id);
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
- Quantify when the pack has numbers; show uncertainty (p50 / 95% ranges).
- End with a short "Frontier next move" — one primary action for the next 7 days.
- Output structured markdown with sections: Situation, Highest residual risks, Tradeoffs, Recommended moves, Frontier next move.`;
}
