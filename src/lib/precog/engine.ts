import type { IndustryTemplate } from "./templates";
import { DEFAULT_FRAUD_STATS } from "./templates/shared-controls";
import { industryMeta } from "./industry";
import type {
  KnowledgeRisk,
  Person,
  PrecogResult,
  ScenarioTemplate,
  StaffComposition,
} from "./types";
import {
  DEFAULT_RISK_VARIABLES,
  effectiveRiskVariables,
  evaluateDynamicRisk,
  insuranceFigureNote,
  mergeStaffIntoVariables,
  NOT_INSURED_FIGURE_NOTE,
  type RiskVariableState,
} from "./scoring/dynamic-variables";
import { scenarioFlags } from "./scoring/scenario-kind";
import { registerAssessed } from "./continuity/register-state";
import { isOwnBusiness, scenariosInScope } from "./scoring/scope";
import { STRONG_LEVELS } from "./continuity/coverage";
import { scenarioLevels, STAFF_CONDITIONS } from "./scoring/scenario-level";
import { DEFAULT_WEIGHTS } from "./scoring/weights";
import { formatEstimateUsd, formatUsd } from "../utils";
import { count } from "./text";
import { normalizeKnowledgeRelations } from "./knowledge-relations";

/**
 * Index values for knowledge held by too few people. This app's own scale
 * (weights.knowledgeIndex): the numbers order attention on the same 0–100
 * scale as the residual index and were not derived from any data.
 */
const KNOWLEDGE_RISK_INDEX = DEFAULT_WEIGHTS.knowledgeIndex;

/**
 * The sentence the owner reads for each staffing uplift on a scenario's
 * assumed loss and timeline. The conditions and factors are the ones the
 * residual index reads (scoring/scenario-level, weights.scenarioStaff), so
 * the owner reads exactly the uplifts that were applied. Every factor is an
 * assumption this app makes about direction and rough size; none is measured.
 */
const UPLIFT_SENTENCE: Record<
  (typeof STAFF_CONDITIONS)[number]["key"],
  (staff: StaffComposition) => string
> = {
  smallTeamFactor: (s) =>
    `Assumed uplift: with ${s.teamSize} people, duties are harder to separate.`,
  soleHolderFactor: (s) =>
    `Assumed uplift: ${count(s.soleOwnerKnowledgeCount, "critical knowledge item")} that only one person holds.`,
  weakSegregationFactor: (s) =>
    `Assumed uplift: segregation index ${s.segregationScore}/100 is below Precog's weak line.`,
  noDualReleaseFactor: () =>
    "Assumed uplift: no dual release on payments, so one person can release money alone.",
  noBankRecFactor: () =>
    "Assumed uplift: the person who posts also reconciles the bank, so detection takes longer.",
  lowTenureFactor: (s) =>
    `Assumed uplift: average tenure of ${s.avgTenureYears} years is under three, so habits and checks are newer.`,
};

/** Share of an assumed impact reduction that this app also credits to the timeline. An assumption. */
const ASSUMED_TIMELINE_RELIEF_SHARE = DEFAULT_WEIGHTS.scenarioStaff.timelineReliefShare;

/**
 * Knowledge held by too few people, from the business's register.
 *
 * A register nobody has filled in (the industry's starter list with nobody
 * marked, or an empty list) says nothing about the business, so it yields no
 * risks: every index that reads this list skips knowledge until the owner
 * marks who can do each item (registerAssessed in continuity/register-state).
 */
export function findKnowledgeRisks(tpl: IndustryTemplate): KnowledgeRisk[] {
  if (!registerAssessed(tpl)) return [];
  const { knowledge, people } = tpl;
  // Hand-built templates can bypass resolveTemplate, so enforce the same
  // person/item uniqueness at this figure boundary too.
  const relations = normalizeKnowledgeRelations(tpl.relations);
  const byK = new Map<string, typeof relations>();
  for (const r of relations) {
    if (!byK.has(r.knowledgeId)) byK.set(r.knowledgeId, []);
    byK.get(r.knowledgeId)!.push(r);
  }
  // The first person with each id, as people.find returns, without a scan per holder.
  const personById = new Map<string, Person>();
  for (const p of people) if (!personById.has(p.id)) personById.set(p.id, p);

  return knowledge
    .filter((k) => k.criticality === "critical" || k.criticality === "important")
    .map((k) => {
      const holders = (byK.get(k.id) || []).filter((r) => STRONG_LEVELS.has(r.level));
      const owners = holders
        .map((h) => personById.get(h.personId))
        .filter((p): p is Person => Boolean(p?.active));
      const ownerCount = owners.length;
      const soleOwner = ownerCount === 1;
      const riskScore =
        ownerCount === 0
          ? KNOWLEDGE_RISK_INDEX.unheldIndex
          : soleOwner
            ? k.criticality === "critical"
              ? KNOWLEDGE_RISK_INDEX.soleCriticalIndex
              : KNOWLEDGE_RISK_INDEX.soleImportantIndex
            : KNOWLEDGE_RISK_INDEX.sharedIndex;
      return {
        knowledgeId: k.id,
        name: k.name,
        soleOwner,
        ownerCount,
        owners,
        riskScore,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

export function runPrecogScenario(
  tpl: IndustryTemplate,
  scenarioId: string,
  options?: {
    mitigationIds?: string[];
    staff?: StaffComposition;
    riskVariables?: RiskVariableState;
  },
): PrecogResult | null {
  const { scenarios, staffComposition } = tpl;
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return null;

  const staff = options?.staff ?? staffComposition;
  // Keep staff toggles and variable booleans aligned when staff is provided
  const entered = mergeStaffIntoVariables(
    options?.riskVariables ? { ...options.riskVariables } : { ...DEFAULT_RISK_VARIABLES },
    staff,
  );
  // An owner's own business with no policy entered has no crime policy in the
  // arithmetic; the sample business keeps the app's default policy.
  const ownBusiness = isOwnBusiness(tpl);
  const vars = effectiveRiskVariables(entered, ownBusiness, scenarioId);

  const uplifts = staffUplifts(staff);
  const sMult = uplifts.multiplier;
  const flags = scenarioFlags(scenarioId);

  let timelineMult = sMult;
  let impactMult = sMult;

  const selected = new Set(options?.mitigationIds ?? []);
  let reduction = 0;
  for (const m of scenario.mitigations) {
    if (selected.has(m.id)) reduction = Math.max(reduction, m.riskReduction);
  }
  if (reduction > 0) {
    timelineMult *= 1 - reduction * ASSUMED_TIMELINE_RELIEF_SHARE;
    impactMult *= 1 - reduction;
  }

  // Staff+mitigation base gross impact
  const baseExpected = scenario.baseFinancialImpact.expected * impactMult;
  const baseLow = scenario.baseFinancialImpact.low * impactMult;
  const baseHigh = scenario.baseFinancialImpact.high * impactMult;

  const dynamic = evaluateDynamicRisk(
    vars,
    { expected: baseExpected, low: baseLow, high: baseHigh },
    {
      fraudRelated: flags.fraudRelated,
      cashRelated: flags.cashRelated,
      staffImpactMult: 1, // already in baseExpected
    },
  );

  // Apply dynamic timeline (detection lag / likelihood)
  timelineMult *= dynamic.timelineMultiplier;

  const p50 = Math.round(scenario.baseTimelineDays.p50 * timelineMult);
  const p95Low = Math.round(scenario.baseTimelineDays.p95Low * timelineMult);
  const p95High = Math.max(p50 + 5, Math.round(scenario.baseTimelineDays.p95High * timelineMult));

  const expected = Math.round(dynamic.transfer.grossLossExpected);
  const low = Math.round(dynamic.transfer.grossLossLow);
  const high = Math.round(dynamic.transfer.grossLossHigh);

  const staffModifiers: string[] = [...uplifts.sentences];

  for (const d of dynamic.likelihoodSeverity.drivers.slice(0, 4)) {
    staffModifiers.push(`${d.label}: ${d.effect}`);
  }

  // The ACFE medians describe two sub-populations of investigated frauds; the
  // ratio between them is not a multiplier for any one business's assumed
  // loss, so they are shown for reference and never scale the arithmetic.
  const crimeModifiers: string[] = [];
  if (flags.fraudRelated) {
    crimeModifiers.push(
      `For reference only, not applied to the figures above: small organizations in the ACFE study carried a median loss of ${formatUsd(DEFAULT_FRAUD_STATS.medianLossSmallOrgUsd)} against ${formatUsd(DEFAULT_FRAUD_STATS.medianLossAllUsd)} across all cases studied.`,
    );
    crimeModifiers.push(
      `Median time from a scheme starting to someone finding it: ${DEFAULT_FRAUD_STATS.medianDetectionMonths} months. Found inside six months the median loss is ${formatUsd(DEFAULT_FRAUD_STATS.lossIfCaughtEarlyUsd)}; past five years it is more than ${formatUsd(DEFAULT_FRAUD_STATS.lossIfRunsLongUsd)}.`,
    );
    crimeModifiers.push(
      `These are medians among organizations that suffered an investigated fraud, not a prediction for this business.`,
    );
  } else {
    crimeModifiers.push("Not a fraud scenario, so Precog does not apply the fraud figures to it.");
  }
  crimeModifiers.push(
    `Assumed multipliers from your settings: likelihood ×${dynamic.likelihoodSeverity.likelihoodMultiplier.toFixed(2)} · severity ×${dynamic.likelihoodSeverity.grossSeverityMultiplier.toFixed(2)} · detection lag ×${dynamic.likelihoodSeverity.detectionLagMultiplier.toFixed(2)}.`,
  );
  // A crime policy pays only for theft and fraud: evaluateDynamicRisk models no
  // recovery for any other scenario, and the line says why.
  const insuranceBasisLine = flags.fraudRelated
    ? (insuranceFigureNote(entered, ownBusiness, scenarioId) ?? "Conditional scenario calculation.")
    : NOT_INSURED_FIGURE_NOTE;
  crimeModifiers.push(
    `Insurance: ${insuranceBasisLine} Modeled retained loss ${formatEstimateUsd(dynamic.transfer.retainedExpected)}; modeled annual premium ${formatUsd(dynamic.transfer.premiumAnnualNet)}.`,
  );

  const served = industryMeta(tpl.id).customerLabel;
  const cascade = scenario.cascadeLayers.map((layer) => {
    const effects: Record<string, string> = {
      knowledge: "The know-how sits with one person; training lag begins.",
      process: "Work slows; workarounds and errors rise.",
      surface: `${served[0].toUpperCase()}${served.slice(1)} feel delays, and cash flow gets less predictable.`,
      control: "The control stops working and nobody notices, so the exposure becomes normal.",
      source: "Only one person can change system access or vendor settings.",
      continuity: "If that person leaves or the system fails, no insurance covers the loss.",
    };
    return { layer, effect: effects[layer] ?? "Downstream impact." };
  });

  // Not a statistical statement. The timeline and loss figures are the
  // scenario template's assumptions, scaled by the multipliers above.
  const confidenceLabel =
    reduction > 0
      ? "written into the scenario, scaled by your settings and the mitigations you switched on"
      : "written into the scenario, scaled by your staffing, detection, and insurance settings";

  return {
    scenarioId: scenario.id,
    timelineDays: { p50, p95Low, p95High },
    confidenceLabel,
    financialImpact: { expected, low, high },
    retainedImpact: {
      expected: dynamic.transfer.retainedExpected,
      low: dynamic.transfer.retainedLow,
      high: dynamic.transfer.retainedHigh,
    },
    staffModifiers,
    crimeModifiers,
    cascade,
    mitigations: scenario.mitigations,
    residualIfNothing:
      "If you accept this risk as it is, the exposure stays until your staffing, your insurance terms, or your controls change. The figures update when you change any setting.",
    sources: [DEFAULT_FRAUD_STATS.source],
    assumptions: [
      "The base timeline and loss figures are assumptions the scenario author wrote; they do not come from a study or from any business.",
      "Staffing and control multipliers are Precog's assumptions about direction and rough size.",
      "Insurance credits and retention arithmetic are illustrative decision tools, not carrier quotes or policy interpretations.",
      "The day range and loss range are the scenario's assumptions scaled by your settings; they are not confidence intervals.",
    ],
    dynamic: {
      likelihoodMultiplier: dynamic.likelihoodSeverity.likelihoodMultiplier,
      grossSeverityMultiplier: dynamic.likelihoodSeverity.grossSeverityMultiplier,
      detectionLagMultiplier: dynamic.likelihoodSeverity.detectionLagMultiplier,
      grossExpected: dynamic.transfer.grossLossExpected,
      retainedExpected: dynamic.transfer.retainedExpected,
      transferredExpected: dynamic.transfer.transferredExpected,
      premiumAnnualNet: dynamic.transfer.premiumAnnualNet,
      discountPctApplied: dynamic.transfer.discountPctApplied,
      expectedAnnualCostOfRisk: dynamic.transfer.expectedAnnualCostOfRisk,
      eventPlusPremiumExpected: dynamic.transfer.eventPlusPremiumExpected,
      drivers: dynamic.likelihoodSeverity.drivers,
      discountLines: dynamic.transfer.discounts.map((d) => ({
        label: d.label,
        pct: d.pct,
        active: d.active,
        reason: d.reason,
      })),
      notes: dynamic.transfer.notes,
    },
  };
}

/**
 * Scenarios ranked by the app's danger index (an ordering, not a forecast).
 *
 * Only scenarios in scope are ranked: every scenario of the sample business,
 * and for an owner's own people only the starter scenarios they confirmed
 * (`confirmedScenarioIds`, see scoring/scope). With none confirmed the list is
 * empty rather than the industry example's.
 *
 * The index is the scenario's likelihood and severity levels (see
 * scoring/scenario-level), the figure its residual row shows, never its
 * dollars or days: those are illustrative examples, not sized to the
 * business. Scenarios on equal levels keep the template's order.
 */
export function rankDangerousScenarios(
  tpl: IndustryTemplate,
  options?: {
    staff?: StaffComposition;
    riskVariables?: RiskVariableState;
    confirmedScenarioIds?: ReadonlySet<string>;
  },
): {
  scenario: ScenarioTemplate;
  score: number;
  result: PrecogResult;
}[] {
  const staff = options?.staff ?? tpl.staffComposition;
  return scenariosInScope(tpl, options?.confirmedScenarioIds)
    .map((scenario) => {
      const result = runPrecogScenario(tpl, scenario.id, options)!;
      const score = scenarioLevels(scenario.id, scenarioMultipliers(result), staff).index;
      return { scenario, score, result };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * The likelihood model's multipliers a scenario run applied (1 when the run
 * carries none), and whether they include dual release.
 */
export function scenarioMultipliers(result: PrecogResult): {
  likelihoodMultiplier: number;
  grossSeverityMultiplier: number;
  dualReleaseApplied: boolean;
} {
  return {
    likelihoodMultiplier: result.dynamic?.likelihoodMultiplier ?? 1,
    grossSeverityMultiplier: result.dynamic?.grossSeverityMultiplier ?? 1,
    dualReleaseApplied: result.dynamic?.drivers.some((d) => d.id === "dual-l") ?? false,
  };
}

/** The staffing uplifts that apply to `staff`: their product and the sentence for each. */
function staffUplifts(staff: StaffComposition): { multiplier: number; sentences: string[] } {
  const applied = STAFF_CONDITIONS.filter((u) => u.applies(staff));
  return {
    multiplier: applied.reduce((m, u) => m * DEFAULT_WEIGHTS.scenarioStaff[u.key], 1),
    sentences: applied.map((u) => UPLIFT_SENTENCE[u.key](staff)),
  };
}
