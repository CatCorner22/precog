import { HEAT_BANDS } from "../process-graph";
import { assessCoso } from "../coso";
import type { IndustryTemplate } from "../templates";
import type { StaffComposition } from "../types";
import { industryMeta } from "../industry";
import { pluralTeamLabel } from "../templates/industry-copy";
import { portfolioSummary, tornadoSensitivity } from "../scoring/residual-engine";
import { rankDangerousScenarios, findKnowledgeRisks } from "../engine";
import { coverageReport, documentationDebt } from "../continuity/coverage";
import { registerAssessed } from "../continuity/register-state";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap } from "../process-graph";
import { DEFAULT_WEIGHTS } from "../scoring/weights";
import { starterScenarioNote, templateMapAssessed } from "../scoring/scope";

/** Dense, structured context for the Pioneer LLM coach — token-efficient. */
export function buildPioneerContextPack(
  tpl: IndustryTemplate,
  staffComposition: StaffComposition = tpl.staffComposition,
  opts: {
    /**
     * Whether the process map's figures describe a map the owner has worked on
     * (mapAssessed in builder/map-state). Without a profile it is judged from
     * the template: the owner's people over a map nobody owns is not assessed.
     * Off, the pack carries no map figure and tells the coach so.
     */
    mapAssessed?: boolean;
    /** Starter scenarios the owner confirmed as their own (see scoring/scope). */
    confirmedScenarioIds?: ReadonlySet<string>;
  } = {},
) {
  const { businessName, crimeFraudStats } = tpl;
  const scope = { confirmedScenarioIds: opts.confirmedScenarioIds };
  const portfolio = portfolioSummary(tpl, staffComposition, DEFAULT_WEIGHTS, scope);
  const coso = assessCoso(tpl, staffComposition, scope);
  const ranked = rankDangerousScenarios(tpl, { staff: staffComposition, ...scope }).slice(0, 3);
  const spofs = findKnowledgeRisks(tpl).filter((r) => r.soleOwner && r.riskScore >= 65);
  const continuity = coverageReport(tpl);
  const docs = documentationDebt(tpl);
  const assessed = registerAssessed(tpl);
  const leanedOn = continuity.people.find((l) => l.person.active);
  const tornado = tornadoSensitivity(tpl, staffComposition, scope);
  const { snapshots } = buildProcessMapGraph(tpl, staffComposition);
  const mapIssues = validateProcessMap(
    tpl.processes,
    tpl.people,
    new Set(tpl.controls.map((c) => c.id)),
  );
  const mapHealth = computeMapHealth(snapshots, mapIssues);
  const mapReady = opts.mapAssessed ?? templateMapAssessed(tpl);

  return {
    practice: businessName,
    scoringVersion: portfolio.scoringVersion,
    staff: staffComposition,
    // A starter map nobody owns feeds no ownership, health or hot-process figure.
    processMap: {
      assessed: mapReady,
      healthScore: mapReady ? mapHealth.score : null,
      band: mapReady ? mapHealth.bandLabel : "not assessed",
      dimensions: mapReady
        ? mapHealth.dimensions.map((d) => ({ id: d.id, score: d.score, hint: d.hint }))
        : [],
      processCount: mapHealth.processCount,
      hotProcesses: mapReady
        ? snapshots
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
            }))
        : [],
      unownedProcesses: mapReady
        ? snapshots.filter((s) => !s.owners.length).map((s) => s.process.name)
        : [],
      issues: mapReady
        ? mapIssues
            .filter((i) => i.severity !== "info")
            .slice(0, 6)
            .map((i) => i.message)
        : [],
      note: mapReady
        ? "Map health, its dimensions, hot and unowned processes and issues are scored from the owner's process map; name specific processes when they drive the advice."
        : tpl.processes.length === 0
          ? "Not assessed: the map is empty, so the owner has not yet listed the processes the business runs. Do not quote map figures; advise the owner to add their processes on How work flows."
          : `Not assessed: the map holds ${tpl.processes.length} starter processes from the ${industryMeta(tpl.id).label.toLowerCase()} example with no owner assigned, so no map figure describes the business. Do not quote map figures; advise the owner to assign an owner to each process on How work flows, or to build their own map.`,
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
      assessed,
      backedUpPct: continuity.coverageIndex,
      counts: continuity.counts,
      documentation: {
        writtenAndFindablePct: docs.documentedIndex,
        counts: docs.counts,
        gaps: docs.gaps.slice(0, 5).map((g) => ({
          item: g.item.name,
          criticality: g.item.criticality,
          state: g.state,
          coverage: g.coverage,
          author: g.author?.name ?? null,
          action: g.action,
        })),
      },
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
        procedureLocation: m.item.documented ? m.item.procedureLocation?.trim() || null : null,
        action: m.action,
      })),
      note: assessed
        ? "Coverage status is from the owner's register of who can do what; 'single' means exactly one person can run it alone. 'documentation.gaps' are items with nothing written down or a written procedure whose location is not recorded; advise on writing/locating them in the same breath as cross-training. Advise on contingency in terms of these named people."
        : `Not assessed: the register holds ${tpl.knowledge.length} item(s) with nobody marked on any of them, so the figures above are not facts about the business. Do not quote them; advise the owner to mark who can do each item on Who knows what.`,
    },
    topScenarios: ranked.map((r) => ({
      id: r.scenario.id,
      title: r.scenario.title,
      assumedLossUsd: r.result.financialImpact.expected,
      assumedDaysUntilFound: r.result.timelineDays.p50,
      assumedDayRange: [r.result.timelineDays.p95Low, r.result.timelineDays.p95High],
    })),
    scenarioNote:
      starterScenarioNote(tpl, opts.confirmedScenarioIds) ??
      "Every scenario above describes this business's own settings.",
    highestLeverageLevers: tornado.levers.slice(0, 4),
  };
}

export function pioneerSystemPrompt(tpl: IndustryTemplate): string {
  const meta = industryMeta(tpl.id);
  return `You are Precog Pioneer — a frontier coach for small ${pluralTeamLabel(meta.id)} (${meta.label}).
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
