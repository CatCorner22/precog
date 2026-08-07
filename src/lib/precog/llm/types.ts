/**
 * Precog LLM stack types — tool-grounded multi-step reasoning.
 */

export type ToolName =
  | "get_practice_snapshot"
  | "get_coso_assessment"
  | "get_residual_portfolio"
  | "get_knowledge_spofs"
  | "get_knowledge_graph"
  | "run_precog_scenario"
  | "compare_scenario_futures"
  | "get_tornado_levers"
  | "get_insurance_cost_of_risk"
  | "get_sod_conflicts"
  | "simulate_variable_cascades"
  | "retrieve_guidance"
  | "score_anomalies"
  | "get_leading_indicators"
  | "forecast_residual"
  | "run_advanced_reasoning";

export interface ToolCall {
  tool: ToolName;
  args?: Record<string, unknown>;
}

export interface ToolResult {
  tool: ToolName;
  args?: Record<string, unknown>;
  ok: boolean;
  summary: string;
  data: unknown;
  links?: { tab: string; id?: string; label: string }[];
}

export type ReasoningPhase =
  | "plan"
  | "retrieve"
  | "analyze"
  | "reason"
  | "critique"
  | "specialize"
  | "synthesize";

export interface ReasoningStep {
  phase: ReasoningPhase;
  title: string;
  detail: string;
  toolResults?: ToolResult[];
}

export interface EvidenceRef {
  id: string;
  kind:
    | "residual"
    | "spof"
    | "scenario"
    | "coso"
    | "sod"
    | "insurance"
    | "lever"
    | "cascade"
    | "rag"
    | "ml"
    | "forecast"
    | "reasoning";
  label: string;
  metric?: string;
  link: { tab: string; id?: string };
}

export interface PioneerDecision {
  action: string;
  rationale: string;
  evidenceIds: string[];
  effort: "low" | "medium" | "high";
  horizonDays: number;
  cascadeEffects?: string[];
}

export interface StructuredBrief {
  situation: string;
  highestRisks: string[];
  tradeoffs: string[];
  decisions: PioneerDecision[];
  frontierNextMove: string;
  chickenLittleWarnings: string[];
  variableCascades: string[];
  specialistNotes: { agent: string; title: string; bullets: string[] }[];
  advancedReasoning?: string[];
  markdown: string;
  evidence: EvidenceRef[];
}

export interface AgentRunResult {
  ok: true;
  source: "grok-agent" | "local-agent";
  model?: string;
  question: string;
  steps: ReasoningStep[];
  toolsUsed: ToolName[];
  brief: StructuredBrief;
  contextFingerprint: string;
  latencyMs: number;
}

export interface AgentRunError {
  ok: false;
  error: string;
}
