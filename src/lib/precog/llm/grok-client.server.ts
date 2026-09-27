export interface GrokChatOptions {
  messages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[];
  maxTokens: number;
  temperature: number;
  jsonObject?: boolean;
}

export interface GrokChatResult {
  text: string;
  model: string;
}

/**
 * One chat call to the model. Returns null on any upstream failure so callers
 * can use their local fallback, and logs why (status, timeout or network
 * error) without the request body or the key.
 */
export async function grokChat(
  apiKey: string,
  opts: GrokChatOptions,
): Promise<GrokChatResult | null> {
  if (!apiKey.trim()) return null;

  const body: {
    model: string;
    max_tokens: number;
    temperature: number;
    messages: GrokChatOptions["messages"];
    response_format?: { type: "json_object" };
  } = {
    model: GROK_MODEL,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    messages: opts.messages,
  };
  if (opts.jsonObject) body.response_format = { type: "json_object" };

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GROK_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[grok] upstream ${response.status}: ${redact(detail).slice(0, 300)}`);
      return null;
    }
    const result = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
    };
    const text = result.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.error("[grok] upstream returned no text");
      return null;
    }
    return { text, model: result.model?.trim() || GROK_MODEL };
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    console.error(
      name === "TimeoutError" || name === "AbortError"
        ? `[grok] no answer within ${GROK_TIMEOUT_MS / 1000}s`
        : `[grok] request failed: ${name}: ${redact(error instanceof Error ? error.message : String(error))}`,
    );
    return null;
  }
}

const GROK_MODEL = "grok-4.5";
const GROK_TIMEOUT_MS = 20_000;

/** Masks anything shaped like an API key, in case an upstream error echoes one. */
function redact(text: string): string {
  return text.replace(/xai-[A-Za-z0-9_-]+/g, "xai-…");
}
