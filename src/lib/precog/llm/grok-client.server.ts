export interface GrokChatOptions {
  messages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[];
  maxTokens: number;
  temperature: number;
  jsonObject?: boolean;
  /** Which feature made the call, for the usage log line only; never sent upstream. */
  feature?: string;
}

export interface GrokChatResult {
  text: string;
  model: string;
}

/** One structured log line per model call: no prompt text, no key. */
export interface GrokUsageLine {
  feature: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number;
  outcome: "ok" | "empty" | "timeout" | "error" | `http_${number}`;
}

/**
 * One chat call to the model. Returns null on any upstream failure so callers
 * can use their local fallback, and logs why (status, timeout or network
 * error) without the request body or the key. Every attempted call also logs
 * one `[grok] usage` line with the tokens the API reports, so spend per
 * feature can be read from the logs.
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

  const started = Date.now();
  const usage = (
    outcome: GrokUsageLine["outcome"],
    model: string,
    tokens?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown },
  ) =>
    logUsage({
      feature: opts.feature ?? "unknown",
      model,
      promptTokens: tokenCount(tokens?.prompt_tokens),
      completionTokens: tokenCount(tokens?.completion_tokens),
      totalTokens: tokenCount(tokens?.total_tokens),
      latencyMs: Date.now() - started,
      outcome,
    });

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
      usage(`http_${response.status}`, GROK_MODEL);
      return null;
    }
    const result = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
    };
    const model = result.model?.trim() || GROK_MODEL;
    const text = result.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.error("[grok] upstream returned no text");
      usage("empty", model, result.usage);
      return null;
    }
    usage("ok", model, result.usage);
    return { text, model };
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    usage(timedOut ? "timeout" : "error", GROK_MODEL);
    console.error(
      timedOut
        ? `[grok] no answer within ${GROK_TIMEOUT_MS / 1000}s`
        : `[grok] request failed: ${name}: ${redact(error instanceof Error ? error.message : String(error))}`,
    );
    return null;
  }
}

const GROK_MODEL = "grok-4.5";
const GROK_TIMEOUT_MS = 20_000;

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function logUsage(line: GrokUsageLine): void {
  console.info(`[grok] usage ${JSON.stringify(line)}`);
}

/** Masks anything shaped like an API key, in case an upstream error echoes one. */
function redact(text: string): string {
  return text.replace(/xai-[A-Za-z0-9_-]+/g, "xai-…");
}
