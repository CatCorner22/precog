import {
  crimeFraudStats,
  knowledge,
  people,
  relations,
  scenarios,
  staffComposition,
} from "./demo-data";
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

export function findKnowledgeRisks(): KnowledgeRisk[] {
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
        ownerCount === 0 ? 100 : soleOwner ? (k.criticality === "critical" ? 85 : 65) : 20;
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

function staffRiskMultiplier(staff: StaffComposition): number {
  let m = 1;
  if (staff.teamSize <= 6) m *= 1.15;
  if (staff.soleOwnerKnowledgeCount >= 2) m *= 1.2;
  if (staff.segregationScore < 50) m *= 1.25;
  // Dual control / bank rec also flow through dynamic variables; keep mild staff uplift when off
  if (!staff.dualControlPayments) m *= 1.08;
  if (!staff.independentBankRec) m *= 1.06;
  if (staff.avgTenureYears < 3) m *= 1.05;
  return m;
}

function fraudMultiplier(scenario: ScenarioTemplate): number {
  const fraudRelated =
    scenario.id.includes("cash") ||
    scenario.id.includes("writeoff") ||
    scenario.id.includes("vendor") ||
    scenario.controlId?.includes("sod");
  return fraudRelated ? 1 + crimeFraudStats.industryEmbezzlementRate * 0.5 : 1;
}

export function runPrecogScenario(
  scenarioId: string,
  options?: {
    mitigationIds?: string[];
    staff?: StaffComposition;
    riskVariables?: RiskVariableState;
  },
): PrecogResult | null {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return null;

  const staff = options?.staff ?? staffComposition;
  let vars = options?.riskVariables
    ? { ...options.riskVariables }
    : { ...DEFAULT_RISK_VARIABLES };

  // Keep staff toggles and variable booleans aligned when staff is provided
  vars = mergeStaffIntoVariables(vars, staff);

  const sMult = staffRiskMultiplier(staff);
  const fMult = fraudMultiplier(scenario);
  const flags = scenarioFlags(scenarioId);

  let timelineMult = sMult * Math.sqrt(fMult);
  let impactMult = sMult * fMult;

  const selected = new Set(options?.mitigationIds ?? []);
  let reduction = 0;
  for (const m of scenario.mitigations) {
    if (selected.has(m.id)) reduction = Math.max(reduction, m.riskReduction);
  }
  if (reduction > 0) {
    timelineMult *= 1 - reduction * 0.4;
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
  const p95High = Math.max(
    p50 + 5,
    Math.round(scenario.baseTimelineDays.p95High * timelineMult),
  );

  const expected = Math.round(dynamic.transfer.grossLossExpected);
  const low = Math.round(dynamic.transfer.grossLossLow);
  const high = Math.round(dynamic.transfer.grossLossHigh);

  const staffModifiers: string[] = [];
  if (staff.teamSize <= 6)
    staffModifiers.push(`Small team (n=${staff.teamSize}) reduces natural SoD — risk uplift applied.`);
  if (staff.soleOwnerKnowledgeCount >= 1)
    staffModifiers.push(
      `${staff.soleOwnerKnowledgeCount} critical knowledge item(s) with sole strong owner.`,
    );
  if (staff.segregationScore < 50)
    staffModifiers.push(
      `Segregation score ${staff.segregationScore}/100 (weak) increases cascade probability.`,
    );
  if (!staff.dualControlPayments)
    staffModifiers.push("No dual control on payments — custody/authorization conflict elevated.");
  if (!staff.independentBankRec)
    staffModifiers.push("Bank reconciliation not independent of posting — detection lag rises.");

  for (const d of dynamic.likelihoodSeverity.drivers.slice(0, 4)) {
    staffModifiers.push(`[Dynamic] ${d.label}: ${d.effect}`);
  }

  const crimeModifiers: string[] = [];
  if (fMult > 1) {
    crimeModifiers.push(
      `Industry-oriented small-entity fraud base rate ~${Math.round(crimeFraudStats.industryEmbezzlementRate * 100)}% annual exposure class (illustrative).`,
    );
    crimeModifiers.push(
      `Literature median detection lag ~${crimeFraudStats.medianDetectionDays} days; p95 ~${crimeFraudStats.detectionDaysP95} days when controls are weak.`,
    );
    crimeModifiers.push(
      `Typical mid-case loss reference ~$${crimeFraudStats.typicalLossMid.toLocaleString()} (demo calibration, not a prediction of this practice).`,
    );
  } else {
    crimeModifiers.push(
      "Scenario is primarily operational/knowledge risk; fraud base rates lightly applied.",
    );
  }
  crimeModifiers.push(
    `Likelihood ×${dynamic.likelihoodSeverity.likelihoodMultiplier.toFixed(2)} · gross severity ×${dynamic.likelihoodSeverity.grossSeverityMultiplier.toFixed(2)} · detection lag ×${dynamic.likelihoodSeverity.detectionLagMultiplier.toFixed(2)}.`,
  );
  crimeModifiers.push(
    `Insurance: premium ${dynamic.transfer.premiumAnnualNet.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} net (−${dynamic.transfer.discountPctApplied}% credits) · retained EL ${dynamic.transfer.retainedExpected.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} · annualized cost-of-risk ~${dynamic.transfer.expectedAnnualCostOfRisk.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`,
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

  const confidenceLabel =
    reduction > 0.5
      ? "95% CI after mitigations + dynamic variables (wider if base rates sparse)"
      : "95% CI on time-to-material-impact (dynamic likelihood/severity model)";

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
    sources: [...scenario.statSources, crimeFraudStats.source],
    assumptions: [
      "Base rates are educational illustrations from published small-entity / dental ops patterns — not actuarial quotes.",
      "Insurance premium discounts and retention math are illustrative decision tools — not carrier quotes or policy interpretations.",
      "Likelihood and severity recompute when premium, deductible, limits, discounts, or control variables change.",
      "95% interval reflects model uncertainty under stated assumptions; sparse data widens true uncertainty further.",
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

export function getScenario(id: string): ScenarioTemplate | undefined {
  return scenarios.find((s) => s.id === id);
}

export function rankDangerousScenarios(options?: {
  staff?: StaffComposition;
  riskVariables?: RiskVariableState;
}): {
  scenario: ScenarioTemplate;
  score: number;
  result: PrecogResult;
}[] {
  return scenarios
    .map((scenario) => {
      const result = runPrecogScenario(scenario.id, options)!;
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
