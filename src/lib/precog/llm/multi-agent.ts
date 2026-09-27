/**
 * The brief's four review lenses: operations, controls, scenarios and a
 * critic. Each is a fixed template over the tool results, not a model call.
 */
import type { ToolResult } from "./types";
import { readSpofData } from "./spof-data";
import { describeScenarioFigures, type ScenarioRunData } from "./scenario-tools";
import { NO_ALERT_WARNING, WARNING_RULES } from "./agent-brief";
import { formatUsdDelta } from "@/lib/utils";
import { count } from "../text";

type SpecialistId = "operator" | "shield" | "precog" | "critic";

export interface SpecialistNote {
  agent: SpecialistId;
  title: string;
  bullets: string[];
}

export function runSpecialistAgents(tools: ToolResult[]): SpecialistNote[] {
  const notes: SpecialistNote[] = [];

  const residual = tools.find((t) => t.tool === "get_residual_portfolio")?.data as
    { averageResidual: number; top: { name: string; residual: number }[] } | undefined;
  const sod = tools.find((t) => t.tool === "get_sod_conflicts")?.data as
    { name: string; residualRiskAccepted: boolean }[] | undefined;
  const scenario = tools.find((t) => t.tool === "run_precog_scenario")?.data as
    ScenarioRunData | undefined;
  const cascade = tools.find((t) => t.tool === "simulate_variable_cascades")?.data as
    | {
        topByCostOfRisk?: {
          label: string;
          deltaCor: number;
          secondOrderNotes: string[];
        }[];
      }
    | undefined;
  const leading = tools.find((t) => t.tool === "get_leading_indicators")?.data as
    { breached: number; watch: number; topActions: string[] } | undefined;
  const rag = tools.find((t) => t.tool === "retrieve_guidance")?.data as
    { hits: { title: string; domain: string; text: string }[] } | undefined;
  const spofState = readSpofData(tools.find((t) => t.tool === "get_knowledge_spofs")?.data);

  // Operator: who carries the work
  notes.push({
    agent: "operator",
    title: "Operations: who carries the work",
    bullets: [
      residual
        ? `Average risk index ${residual.averageResidual}/100 (this app's own index); most exposed: ${residual.top[0]?.name ?? "nothing listed"} (${residual.top[0]?.residual ?? "?"}/100).`
        : "No risk index in this run.",
      spofState && !spofState.assessed
        ? "Who knows what: not assessed yet. Nobody is marked, so nothing shows who alone can run what."
        : spofState && spofState.rows.length
          ? `${count(spofState.rows.length, "item")} only one person can run; training a second person adds capacity, not paperwork.`
          : "No critical item rests on one person.",
      leading
        ? `Watched conditions: ${leading.breached} breached, ${leading.watch} at watch. ${leading.topActions[0] ?? ""}`.trim()
        : "Check the watched conditions on Patterns.",
    ],
  });

  // Shield: who can do what alone
  notes.push({
    agent: "shield",
    title: "Controls: who can do what alone",
    bullets: [
      sod
        ? `${count(sod.length, "duty conflict")}; ${sod.filter((s) => !s.residualRiskAccepted).length} not yet accepted or fixed. Write each decision down in the Journal.`
        : "No duty-conflict check in this run.",
      rag?.hits?.[0]
        ? `Guidance: ${rag.hits[0].title}: ${rag.hits[0].text.slice(0, 160)}…`
        : "No guidance matched this question.",
    ],
  });

  // Precog: what could happen
  notes.push({
    agent: "precog",
    title: "Scenarios: what could happen",
    bullets: [
      scenario
        ? `${scenario.title}: ${describeScenarioFigures(scenario)}.`
        : "No scenario applies to this business yet.",
      cascade?.topByCostOfRisk?.[0]
        ? `Biggest knock-on effect: ${cascade.topByCostOfRisk[0].label} (yearly cost of risk ${formatUsdDelta(cascade.topByCostOfRisk[0].deltaCor)}). ${cascade.topByCostOfRisk[0].secondOrderNotes[0] ?? ""}`.trim()
        : "Run the what-else-moves check before changing the deductible.",
      "The premium, the deductible and the controls move together; check the yearly cost of risk again after each change.",
    ],
  });

  // Critic: what could go wrong
  const criticBullets: string[] = [];
  if ((residual?.averageResidual ?? 0) >= WARNING_RULES.averageResidual) {
    criticBullets.push(
      `The average risk index is in the "act now" band; waiting is a choice with a price.`,
    );
  }
  if (leading && leading.breached > 0) {
    criticBullets.push(
      `${count(leading.breached, "watched condition")} breached: a loss may not have happened yet, but the conditions for one are present.`,
    );
  }
  if (!criticBullets.length) criticBullets.push(NO_ALERT_WARNING);
  criticBullets.push(
    "Fixing one control can lower the premium and change how much risk you accept; record the change in the Journal.",
  );

  notes.push({
    agent: "critic",
    title: "Critic: what could go wrong",
    bullets: criticBullets,
  });

  return notes;
}
