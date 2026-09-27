import type { GrokAccess } from "@/lib/precog/llm/types";

/**
 * Why a suggestion or review came from the built-in rules rather than
 * Grok, in one sentence for the owner; null when Grok answered.
 */
export function ruleBasedReason(source: "grok" | "local", status?: GrokAccess): string | null {
  if (source === "grok") return null;
  switch (status) {
    case "no_api_key":
      return "AI suggestions are not set up for this app, so these come from built-in rules.";
    case "unauthenticated":
      return "Sign in to get AI suggestions; these come from built-in rules.";
    case "rate_limited":
      return "The AI limit is reached for now, so these come from built-in rules. Try again later.";
    default:
      return "The AI service did not answer, so these come from built-in rules.";
  }
}
