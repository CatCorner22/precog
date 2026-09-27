/**
 * Helpers every server function that asks Grok shares: fencing owner-typed
 * text, reading the JSON reply, and falling back to the local answer.
 */
import type { GrokAccess } from "./types";

/**
 * Owner-typed text for inside an <owner_text> block, with any opening or
 * closing owner_text tag removed (any case, any spacing) so the text cannot
 * end the block early or open a second one. Run it over the whole block's
 * content, not field by field, so no field is missed.
 */
export function ownerText(value: string): string {
  return value.replace(OWNER_TEXT_TAG, "");
}

/** The model's JSON object, with a Markdown code fence around it tolerated; null when it does not parse to an object. */
export function parseJsonReply(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?/, "")
        .replace(/```$/, ""),
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * The local answer unless Grok is allowed, a key is set and `worthAsking`
 * holds; otherwise Grok's answer, or the local one when Grok returns nothing
 * usable or fails. Either way the result carries the caller's Grok status.
 */
export async function withGrokFallback<T extends object>(
  grok: GrokAccess,
  local: T,
  worthAsking: boolean,
  ask: (apiKey: string) => Promise<T | null>,
): Promise<T & { grokStatus: GrokAccess }> {
  const apiKey = process.env.XAI_API_KEY;
  if (grok !== "allowed" || !apiKey || !worthAsking) return { ...local, grokStatus: grok };
  try {
    const answer = await ask(apiKey);
    return { ...(answer ?? local), grokStatus: grok };
  } catch {
    return { ...local, grokStatus: grok };
  }
}

const OWNER_TEXT_TAG = /<\s*\/?\s*owner_text\s*>/gi;
