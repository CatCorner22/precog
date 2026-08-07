/**
 * Precog LLM stack types — tool-grounded multi-step reasoning.
 * This is the product differentiator vs static GRC dashboards.
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
  | "simulate_variable_cascades";

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
  /** Deep-link hints for UI */
  links?: { tab: string; id?: string; label: string }[];
}

export type ReasoningPhase =
  | "plan"
  | "retrieve"
  | "analyze"
  | "critique"
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
    | "cascade";
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
  /** What else moves if this decision is taken */
  cascadeEffects?: string[];
}

export interface StructuredBrief {
  situation: string;
  highestRisks: string[];
  tradeoffs: string[];
  decisions: PioneerDecision[];
  frontierNextMove: string;
  chickenLittleWarnings: string[];
  /** Cross-variable ripple effects the coach must explain */
  variableCascades: string[];
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
