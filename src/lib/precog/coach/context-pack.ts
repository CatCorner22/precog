import { PRACTICE_NAME, staffComposition, crimeFraudStats } from "../demo-data";
import { assessCoso } from "../coso";
import { portfolioSummary, tornadoSensitivity } from "../scoring/residual-engine";
import { rankDangerousScenarios, findKnowledgeRisks } from "../engine";

/** Dense, structured context for the Pioneer LLM coach — token-efficient. */
export function buildPioneerContextPack() {
  const portfolio = portfolioSummary();
  const coso = assessCoso();
  const ranked = rankDangerousScenarios().slice(0, 3);
  const spofs = findKnowledgeRisks().filter((r) => r.soleOwner && r.riskScore >= 65);
  const tornado = tornadoSensitivity();

  return {
    practice: PRACTICE_NAME,
    scoringVersion: portfolio.scoringVersion,
    staff: staffComposition,
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
  return `You are Precog Pioneer — a Davy Crockett–style frontier coach for small dental practices.
You help owner-operators make bold, clear decisions about internal controls, knowledge continuity, Lean/TPS waste, and residual risk.

Rules:
- Be direct, practical, and plain-spoken (about 8th-grade clarity). Active voice.
- Never invent practice facts not in the context pack.
- Never accuse staff of fraud. Score control design and residual risk only.
- Prefer: address / compensate / accept residual risk deliberately.
- Use COSO language lightly (control activities, monitoring, risk assessment).
- When recommending action, tie to residual scores, drivers, and Precog scenarios.
- Quantify when the pack has numbers; show uncertainty (p50 / 95% ranges).
- End with a short "Frontier next move" — one primary action for the next 7 days.
- Output structured markdown with sections: Situation, Highest residual risks, Tradeoffs, Recommended moves, Frontier next move.`;
}
