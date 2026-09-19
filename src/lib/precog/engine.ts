import type { IndustryTemplate } from "./templates";
import type {
  KnowledgeLevel,
  KnowledgeRisk,
  PrecogResult,
  ScenarioTemplate,
  StaffComposition,
} from "./types";
import {
  DEFAULT_RISK_VARIABLES,
  evaluateDynamicRisk,
  mergeStaffIntoVariables,
  scenarioFlags,
  type RiskVariableState,
} from "./scoring/dynamic-variables";

const STRONG: KnowledgeLevel[] = ["expert", "proficient"];

export function findKnowledgeRisks(tpl: IndustryTemplate): KnowledgeRisk[] {
  const { knowledge, people, relations } = tpl;
  const byK = new Map<string, typeof relations>();
  for (const r of relations) {
    if (!byK.has(r.knowledgeId)) byK.set(r.knowledgeId, []);
    byK.get(r.knowledgeId)!.push(r);
  }

  return knowledge
    .filter((k) => k.criticality === "critical" || k.criticality === "important")
    .map((k) => {
      const holders = (byK.get(k.id) || []).filter((r) => STRONG.includes(r.level));
      const owners = holders
        .map((h) => people.find((p) => p.id === h.personId))
        .filter(Boolean) as typeof people;
      const ownerCount = owners.length;
      const soleOwner = ownerCount === 1;
      const riskScore =
        ownerCount === 0
          ? KNOWLEDGE_RISK_INDEX.unowned
          : soleOwner
            ? k.criticality === "critical"
              ? KNOWLEDGE_RISK_INDEX.soleCritical
              : KNOWLEDGE_RISK_INDEX.soleImportant
            : KNOWLEDGE_RISK_INDEX.shared;
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

/**
 * Index values for knowledge held by too few people. This app's own scale:
 * the numbers order attention on the same 0–100 scale as the residual index
 * and were not derived from any data.
 */
const KNOWLEDGE_RISK_INDEX = { unowned: 100, soleCritical: 85, soleImportant: 65, shared: 20 };

/**
 * Multipliers applied to a scenario's assumed loss and timeline for staffing
 * conditions. Every value is an assumption this app makes about direction and
 * rough size; none is measured. They are listed to the owner as assumptions.
 */
const ASSUMED_STAFF_UPLIFT = {
  smallTeam: 1.15, // six people or fewer
  severalSoleOwners: 1.2, // two or more sole-owner knowledge items
  weakSegregation: 1.25, // segregation score under 50
  noDualControl: 1.08, // dual control also flows through the variables; mild here
  noIndependentBankRec: 1.06,
  lowTenure: 1.05, // average tenure under three years
} as const;

/** Share of an assumed impact reduction that this app also credits to the timeline. An assumption. */
const ASSUMED_TIMELINE_RELIEF_SHARE = 0.4;

function staffRiskMultiplier(staff: StaffComposition): number {
  let m = 1;
  if (staff.teamSize <= 6) m *= ASSUMED_STAFF_UPLIFT.smallTeam;
  if (staff.soleOwnerKnowledgeCount >= 2) m *= ASSUMED_STAFF_UPLIFT.severalSoleOwners;
  if (staff.segregationScore < 50) m *= ASSUMED_STAFF_UPLIFT.weakSegregation;
  if (!staff.dualControlPayments) m *= ASSUMED_STAFF_UPLIFT.noDualControl;
  if (!staff.independentBankRec) m *= ASSUMED_STAFF_UPLIFT.noIndependentBankRec;
  if (staff.avgTenureYears < 3) m *= ASSUMED_STAFF_UPLIFT.lowTenure;
  return m;
}

function fraudMultiplier(tpl: IndustryTemplate, scenario: ScenarioTemplate): number {
  const { crimeFraudStats } = tpl;
  const fraudRelated =
    scenario.id.includes("cash") ||
    scenario.id.includes("writeoff") ||
    scenario.id.includes("vendor") ||
    scenario.controlId?.includes("sod");
  if (!fraudRelated) return 1;
  // Small organizations carry a higher median loss than the study population
  // as a whole ($126,000 against $104,000), so a fraud-related scenario's
  // assumed loss is scaled by that observed ratio. Applying the square root of
  // the same ratio to the timeline (below) is this app's assumption, not the
  // study's. The previous multiplier was derived from an invented annual
  // embezzlement rate and had no source behind it.
  return crimeFraudStats.medianLossSmallOrgUsd / crimeFraudStats.medianLossAllUsd;
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
  const { scenarios, staffComposition, crimeFraudStats } = tpl;
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return null;

  const staff = options?.staff ?? staffComposition;
  let vars = options?.riskVariables ? { ...options.riskVariables } : { ...DEFAULT_RISK_VARIABLES };

  // Keep staff toggles and variable booleans aligned when staff is provided
  vars = mergeStaffIntoVariables(vars, staff);

  const sMult = staffRiskMultiplier(staff);
  const fMult = fraudMultiplier(tpl, scenario);
  const flags = scenarioFlags(scenarioId);

  let timelineMult = sMult * Math.sqrt(fMult);
  let impactMult = sMult * fMult;

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

  const staffModifiers: string[] = [];
  if (staff.teamSize <= 6)
    staffModifiers.push(
      `Assumed uplift: with ${staff.teamSize} people, duties are harder to separate.`,
    );
  if (staff.soleOwnerKnowledgeCount >= 1)
    staffModifiers.push(
      `Assumed uplift: ${staff.soleOwnerKnowledgeCount} critical knowledge item(s) held by one person.`,
    );
  if (staff.segregationScore < 50)
    staffModifiers.push(
      `Assumed uplift: segregation index ${staff.segregationScore}/100 is below this app's weak line.`,
    );
  if (!staff.dualControlPayments)
    staffModifiers.push(
      "Assumed uplift: no dual control on payments, so one person can release money alone.",
    );
  if (!staff.independentBankRec)
    staffModifiers.push(
      "Assumed uplift: the bank is reconciled by the person who posts, so detection takes longer.",
    );

  for (const d of dynamic.likelihoodSeverity.drivers.slice(0, 4)) {
    staffModifiers.push(`${d.label}: ${d.effect}`);
  }

  const crimeModifiers: string[] = [];
  if (fMult > 1) {
    crimeModifiers.push(
      `Small organizations carry the higher median loss: $${crimeFraudStats.medianLossSmallOrgUsd.toLocaleString()} against $${crimeFraudStats.medianLossAllUsd.toLocaleString()} across all cases studied.`,
    );
    crimeModifiers.push(
      `Median time from a scheme starting to being found: ${crimeFraudStats.medianDetectionMonths} months. Found inside six months the median loss is $${crimeFraudStats.lossIfCaughtEarlyUsd.toLocaleString()}; past five years it is more than $${crimeFraudStats.lossIfRunsLongUsd.toLocaleString()}.`,
    );
    crimeModifiers.push(
      `These are medians among organizations that suffered an investigated fraud, not a prediction for this business.`,
    );
  } else {
    crimeModifiers.push("Not a fraud scenario, so the fraud figures are not applied to it.");
  }
  crimeModifiers.push(
    `Assumed multipliers from your settings: likelihood ×${dynamic.likelihoodSeverity.likelihoodMultiplier.toFixed(2)} · severity ×${dynamic.likelihoodSeverity.grossSeverityMultiplier.toFixed(2)} · detection lag ×${dynamic.likelihoodSeverity.detectionLagMultiplier.toFixed(2)}.`,
  );
  crimeModifiers.push(
    `Insurance arithmetic on your premium and the assumed loss: premium ${dynamic.transfer.premiumAnnualNet.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} net (−${dynamic.transfer.discountPctApplied}% assumed credits) · assumed retained loss ${dynamic.transfer.retainedExpected.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} · annual cost-of-risk figure ~${dynamic.transfer.expectedAnnualCostOfRisk.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`,
  );

  const cascade = scenario.cascadeLayers.map((layer) => {
    const effects: Record<string, string> = {
      knowledge: "Critical know-how concentrated or lost; training lag begins.",
      process: "Workflow throughput drops; workarounds and errors rise.",
      surface: "Patients feel delays; schedule and cash flow noise increase.",
      control: "Control design fails open; residual risk becomes default state.",
      source: "System access or vendor configuration becomes single-threaded.",
      continuity: "Exit or failure path exposes uninsured fragility.",
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
      "If you accept residual risk, Continuity layer fragility remains elevated until staff composition, insurance transfer terms, or controls change. Re-run Precog after any variable change.",
    sources: [crimeFraudStats.source],
    assumptions: [
      "The base timeline and loss figures are assumptions the scenario author wrote; they were not drawn from a study or from any business.",
      "Staffing and control multipliers are this app's assumptions about direction and rough size.",
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

export function getScenario(tpl: IndustryTemplate, id: string): ScenarioTemplate | undefined {
  return tpl.scenarios.find((s) => s.id === id);
}

export function rankDangerousScenarios(
  tpl: IndustryTemplate,
  options?: {
    staff?: StaffComposition;
    riskVariables?: RiskVariableState;
  },
): {
  scenario: ScenarioTemplate;
  score: number;
  result: PrecogResult;
}[] {
  const { scenarios, staffComposition } = tpl;
  return scenarios
    .map((scenario) => {
      const result = runPrecogScenario(tpl, scenario.id, options)!;
      const retained = result.retainedImpact?.expected ?? result.financialImpact.expected;
      const annualCor = result.dynamic?.expectedAnnualCostOfRisk ?? retained;
      const score =
        (retained * 0.65 + annualCor * 0.35) *
        (1 / Math.max(14, result.timelineDays.p50)) *
        ((options?.staff ?? staffComposition).segregationScore < 50 ? 1.3 : 1);
      return { scenario, score, result };
    })
    .sort((a, b) => b.score - a.score);
}
