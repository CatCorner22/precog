export const GROK_MODEL = "grok-4.5";
export const GROK_TIMEOUT_MS = 20_000;

export interface GrokChatOptions {
  messages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[];
  maxTokens: number;
  temperature: number;
  jsonObject?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface GrokChatResult {
  text: string;
  model: string;
}

/** Return null on any upstream failure so callers can use their local fallback. */
export async function grokChat(
  apiKey: string,
  opts: GrokChatOptions,
): Promise<GrokChatResult | null> {
  if (!apiKey.trim()) return null;

  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs ?? GROK_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal;
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
      signal,
    });
    if (!response.ok) return null;
    const result = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
    };
    const text = result.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return { text, model: result.model?.trim() || GROK_MODEL };
  } catch {
    return null;
  }
}
