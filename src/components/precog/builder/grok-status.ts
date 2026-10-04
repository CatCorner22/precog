import type { DailyLimitInfo, GrokAccess } from "@/lib/precog/llm/types";

/**
 * Why a suggestion or review came from the built-in rules rather than
 * Grok, in one sentence for the owner; null when Grok answered. When today's
 * AI limit is the reason, `dailyLimit` says which ceiling was met and the
 * figures in force, so the sentence names the plan.
 */
export function ruleBasedReason(
  source: "grok" | "local",
  status?: GrokAccess,
  dailyLimit?: DailyLimitInfo,
): string | null {
  if (source === "grok") return null;
  switch (status) {
    case "no_api_key":
      return "This copy of Precog has no AI suggestions set up, so these come from built-in rules.";
    case "unauthenticated":
      return "Sign in to get AI suggestions; these come from built-in rules.";
    case "rate_limited":
      return "Precog has reached its AI limit for now, so these come from built-in rules. Try again later.";
    case "daily_limit":
      return dailyLimitReason(dailyLimit);
    default:
      return "The AI service did not answer, so these come from built-in rules.";
  }
}

function dailyLimitReason(l?: DailyLimitInfo): string {
  if (!l) {
    return "Precog has reached today's AI limit, so these come from built-in rules. Try again tomorrow.";
  }
  if (l.scope === "global") {
    return "Precog has reached its AI limit for today across every account, so these come from built-in rules. Try again tomorrow.";
  }
  if (l.scope === "pool") {
    return "Precog has reached today's AI limit shared by your account and others, so these come from built-in rules. Try again tomorrow.";
  }
  if (l.plan === "paid") {
    return `Precog has reached today's AI limit for your plan (${l.limit} calls), so these come from built-in rules. Try again tomorrow.`;
  }
  return `Precog has reached today's AI limit for the free plan (${l.limit} calls), so these come from built-in rules. Try again tomorrow, or start the Firm plan for ${l.paidLimit} a day.`;
}
