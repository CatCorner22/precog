/**
 * Precog LLM stack types — tool-grounded multi-step reasoning.
 */
import type { ContinuityStep } from "../decisions/follow-through";

export type ToolName =
  | "get_practice_snapshot"
  | "get_coso_assessment"
  | "get_residual_portfolio"
  | "get_knowledge_spofs"
  | "get_register_checkins"
  | "get_planned_absences"
  | "get_knowledge_graph"
  | "get_process_records"
  | "run_precog_scenario"
  | "compare_scenario_futures"
  | "get_tornado_levers"
  | "get_insurance_cost_of_risk"
  | "get_sod_conflicts"
  | "simulate_variable_cascades"
  | "retrieve_guidance"
  | "get_leading_indicators"
  | "get_case_evidence"
  | "run_advanced_reasoning"
  | "run_meta_analysis";

/** Whether a model call may be made for this request, and if not, why. */
export type GrokAccess = "allowed" | "unauthenticated" | "rate_limited" | "no_api_key";

export interface ToolResult {
  tool: ToolName;
  ok: boolean;
  summary: string;
  data: unknown;
}

/** What a tool returns before the runner stamps its name on it. */
export type ToolOutput = Omit<ToolResult, "tool">;

type ReasoningPhase =
  "plan" | "retrieve" | "analyze" | "reason" | "critique" | "specialize" | "synthesize" | "meta";

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
    | "cascade"
    | "rag"
    | "ml"
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
  /** What a Journal entry logged from this decision links to, so the next brief follows it up. */
  link?: DecisionLink;
}

/** The Journal link fields a coach decision carries (DecisionInput's linked* fields). */
export interface DecisionLink {
  tab: string;
  id?: string;
  step?: ContinuityStep;
  personId?: string;
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
  source: "grok-agent" | "local-agent";
  model?: string;
  question: string;
  steps: ReasoningStep[];
  toolsUsed: ToolName[];
  brief: StructuredBrief;
  contextFingerprint: string;
  latencyMs: number;
}
