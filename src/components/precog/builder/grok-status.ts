import type { GrokAccess } from "@/lib/precog/llm/types";

/**
 * Why a suggestion or review came from the built-in rules rather than
 * Grok, in one sentence for the owner; null when Grok answered.
 */
export function ruleBasedReason(source: "grok" | "local", status?: GrokAccess): string | null {
  if (source === "grok") return null;
  switch (status) {
    case "no_api_key":
      return "This copy of Precog has no AI suggestions set up, so these come from built-in rules.";
    case "unauthenticated":
      return "Sign in to get AI suggestions; these come from built-in rules.";
    case "rate_limited":
      return "Precog has reached its AI limit for now, so these come from built-in rules. Try again later.";
    case "daily_limit":
      return "Precog has reached today's AI limit, so these come from built-in rules. Try again tomorrow.";
    default:
      return "The AI service did not answer, so these come from built-in rules.";
  }
}
