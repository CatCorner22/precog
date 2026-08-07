/**
 * Multi-agent specialist passes for Pioneer.
 * Operator (Lean/ops), Shield (controls/legal-lite), Precog (scenarios),
 * Critic (Chicken Little) — each produces structured notes from tools.
 */
import type { ToolResult } from "./types";

export type SpecialistId = "operator" | "shield" | "precog" | "critic";

export interface SpecialistNote {
  agent: SpecialistId;
  title: string;
  bullets: string[];
}

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function runSpecialistAgents(tools: ToolResult[]): SpecialistNote[] {
  const notes: SpecialistNote[] = [];

  const residual = tools.find((t) => t.tool === "get_residual_portfolio")?.data as
    | { averageResidual: number; top: { name: string; residual: number }[] }
    | undefined;
  const sod = tools.find((t) => t.tool === "get_sod_conflicts")?.data as
    | { name: string; residualRiskAccepted: boolean }[]
    | undefined;
  const scenario = tools.find((t) => t.tool === "run_precog_scenario")?.data as
    | {
        title: string;
        retained: { expected: number };
        timelineDays: { p50: number };
        dynamic: { expectedAnnualCostOfRisk: number } | null;
      }
    | undefined;
  const cascade = tools.find((t) => t.tool === "simulate_variable_cascades")
    ?.data as
    | {
        topByCostOfRisk?: {
          label: string;
          deltaCor: number;
          secondOrderNotes: string[];
        }[];
      }
    | undefined;
  const leading = tools.find((t) => t.tool === "get_leading_indicators")?.data as
    | { pressureIndex: number; band: string; topActions: string[] }
    | undefined;
  const anomaly = tools.find((t) => t.tool === "score_anomalies")?.data as
    | { overallScore: number; band: string; findings: { message: string }[] }
    | undefined;
  const forecast = tools.find((t) => t.tool === "forecast_residual")?.data as
    | {
        planLabel: string;
        points: { week: number; residualDoNothing: number; residualWithPlan: number }[];
        p50CrossingWeek: number | null;
        narrative: string[];
      }
    | undefined;
  const rag = tools.find((t) => t.tool === "retrieve_guidance")?.data as
    | { hits: { title: string; domain: string; text: string }[] }
    | undefined;
  const spofs = tools.find((t) => t.tool === "get_knowledge_spofs")?.data as
    | { name: string }[]
    | undefined;

  // Operator — Lean / bottlenecks
  notes.push({
    agent: "operator",
    title: "The Operator (Lean / unit economics)",
    bullets: [
      residual
        ? `Portfolio residual ${residual.averageResidual}; top bottleneck: ${residual.top[0]?.name ?? "n/a"} (${residual.top[0]?.residual ?? "?"}).`
        : "No residual portfolio in tools.",
      spofs && spofs.length
        ? `Knowledge muda/mura: ${spofs.length} SPOF(s) — cross-train is capacity, not paperwork.`
        : "No critical SPOFs flagged.",
      leading
        ? `Leading pressure ${leading.pressureIndex}/100 (${leading.band}). ${leading.topActions[0] ?? ""}`
        : "Run leading indicators for early heat.",
      forecast
        ? `12-week path: neglect → residual ${forecast.points[forecast.points.length - 1]?.residualDoNothing} vs plan ${forecast.points[forecast.points.length - 1]?.residualWithPlan} (${forecast.planLabel}).`
        : "Forecast residual under plan vs neglect.",
    ],
  });

  // Shield — controls / residual acceptance
  notes.push({
    agent: "shield",
    title: "The Shield (controls & residual acceptance)",
    bullets: [
      sod
        ? `${sod.length} SoD gap(s); ${sod.filter((s) => !s.residualRiskAccepted).length} without acceptance — write decisions down.`
        : "Pull SoD conflicts for control design.",
      anomaly
        ? `Anomaly band ${anomaly.band} (${anomaly.overallScore}/100). ${anomaly.findings[0]?.message ?? ""}`
        : "Score anomalies vs healthy prior.",
      rag?.hits?.[0]
        ? `Guidance: ${rag.hits[0].title} — ${rag.hits[0].text.slice(0, 160)}…`
        : "Retrieve COSO/SoD guidance for language of acceptance.",
      "Never invent fraud accusations; score design effectiveness only.",
    ],
  });

  // Precog — scenarios & transfer
  notes.push({
    agent: "precog",
    title: "Precog (timeline & transfer)",
    bullets: [
      scenario
        ? `${scenario.title}: retained ${usd(scenario.retained.expected)}, p50 ${scenario.timelineDays.p50}d, CoR ${usd(scenario.dynamic?.expectedAnnualCostOfRisk ?? 0)}.`
        : "Run top Precog scenario.",
      cascade?.topByCostOfRisk?.[0]
        ? `Best cascade: ${cascade.topByCostOfRisk[0].label} (ΔCoR ${usd(cascade.topByCostOfRisk[0].deltaCor)}). ${cascade.topByCostOfRisk[0].secondOrderNotes[0] ?? ""}`
        : "Simulate variable cascades before changing deductible.",
      forecast?.p50CrossingWeek != null
        ? `Neglect may hit Act-now residual around week ${forecast.p50CrossingWeek}.`
        : "No Act-now crossing forecast under current drift.",
      "Premium, deductible, and controls are coupled — re-measure CoR after each lever.",
    ],
  });

  // Critic
  const criticBullets: string[] = [];
  if ((residual?.averageResidual ?? 0) >= 55) {
    criticBullets.push("Residual already elevated — delay is a choice with a price.");
  }
  if (leading && leading.pressureIndex >= 45) {
    criticBullets.push(
      `Leading indicators in ${leading.band} — loss may not have landed yet, but pressure is live.`,
    );
  }
  if (anomaly && (anomaly.band === "stressed" || anomaly.band === "critical")) {
    criticBullets.push(`Configuration anomaly ${anomaly.band} vs healthy practice prior.`);
  }
  if (!criticBullets.length) {
    criticBullets.push("No red-alert composite — still re-score after staff or insurance change.");
  }
  criticBullets.push(
    "Second-order: fixing one control can unlock premium credits and change residual appetite — update the journal.",
  );

  notes.push({
    agent: "critic",
    title: "Chicken Little (critic)",
    bullets: criticBullets,
  });

  return notes;
}
