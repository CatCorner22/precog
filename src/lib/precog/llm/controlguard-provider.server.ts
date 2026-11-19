import { z } from "zod";
import { controlguardModelTools, controlguardTools } from "./controlguard-tools";
import { isControlGuardTool } from "./controlguard-tool-info";

const completion = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          tool_calls: z
            .array(
              z.object({
                function: z.object({ name: z.string(), arguments: z.string().max(12000) }),
              }),
            )
            .length(1),
        }),
      }),
    )
    .length(1),
});

export function controlguardProvider() {
  const endpoint = process.env.CONTROLGUARD_BASE_URL?.trim();
  const model = process.env.CONTROLGUARD_MODEL?.trim();
  if (!endpoint || !model) return null;
  try {
    const url = new URL(endpoint);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return {
      url: url.href.replace(/\/$/, "") + "/chat/completions",
      model,
      apiKey: process.env.CONTROLGUARD_API_KEY?.trim(),
    };
  } catch {
    return null;
  }
}

export async function extractControlGuardInput(
  config: NonNullable<ReturnType<typeof controlguardProvider>>,
  prompt: string,
  request = fetch,
) {
  const safePrompt = prompt
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[email]")
    .replace(/\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g, "[id]");
  try {
    const response = await request(config.url, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: "Bearer " + config.apiKey } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 1000,
        messages: [
          {
            role: "system",
            content:
              "Pick exactly one tool and copy only facts provided by the user. Do not calculate, guess missing inputs, attest to controls, or answer in prose. If facts are missing, return no tool call.",
          },
          { role: "user", content: safePrompt },
        ],
        tools: controlguardModelTools,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const { name, arguments: raw } = completion.parse(await response.json()).choices[0].message
      .tool_calls[0].function;
    if (!isControlGuardTool(name)) return null;
    const args = controlguardTools[name].schema.parse(JSON.parse(raw));
    return { name, args };
  } catch {
    return null;
  }
}
