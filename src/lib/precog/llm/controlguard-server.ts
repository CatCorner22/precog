import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { deterministicCheckMiddleware, heavyLlmMiddleware } from "./middleware";
import { spendCallerDailyUnit } from "./guard.server";
import { controlguardProvider, extractControlGuardInput } from "./controlguard-provider.server";
import { controlguardTools, type ControlGuardResult } from "./controlguard-tools";
import { controlguardToolNames, type ControlGuardTool } from "./controlguard-tool-info";
import { appendFridayEntry, readFridayLedger, type FridayEntry } from "../sod/controlguard-ledger";
import catalogs from "../controlguard-catalogs.json";

const request = z.strictObject({ prompt: z.string().trim().min(1).max(3000) });

export const extractControlGuardFacts = createServerFn({ method: "POST" })
  .middleware([heavyLlmMiddleware])
  .validator((data: { prompt: string }) => request.parse(data))
  .handler(async ({ data, context }) => {
    const config = controlguardProvider();
    const { userId: user, grok } = context.llm;
    if (!config || !user || grok === "rate_limited") return null;
    try {
      const { budget } = await spendCallerDailyUnit(user);
      if (budget !== "allowed") return null;
      return await extractControlGuardInput(config, data.prompt);
    } catch {
      return null;
    }
  });

const short = z.string().min(1).max(200);
const signoff = z.strictObject({
  subject: short,
  control: short,
  signer: short,
  actor: short,
  cadence: short,
  artifact: short,
});
const entry = signoff.extend({
  seq: z.int().positive(),
  signed_at: short,
  prior_hash: z.string().length(64),
  hash: z.string().length(64),
});
const checkInput = z.strictObject({
  name: z.enum(controlguardToolNames),
  facts: z.string().max(12000),
  entries: z.array(entry).max(100),
});

function displayResult(tool: ControlGuardTool, result: ControlGuardResult) {
  return Object.entries(result).map(
    ([key, value]) =>
      [
        key.replaceAll("_", " "),
        tool === "sod" && key === "score" && typeof value === "number"
          ? value.toFixed(2)
          : value === null
            ? "—"
            : typeof value === "boolean"
              ? value
                ? "Yes"
                : "No"
              : typeof value === "object"
                ? Array.isArray(value) && value.length === 0
                  ? "None"
                  : JSON.stringify(value, null, 2)
                : String(value),
      ] as const,
  );
}

export const runControlGuardCheck = createServerFn({ method: "POST" })
  .middleware([deterministicCheckMiddleware])
  .validator((data: { name: ControlGuardTool; facts: string; entries: FridayEntry[] }) =>
    checkInput.parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const signoff = await readFridayLedger(data.entries, new Date());
      return {
        result: displayResult(
          data.name,
          controlguardTools[data.name].run(JSON.parse(data.facts), signoff),
        ),
      };
    } catch (error) {
      if (
        (data.name === "leave" || data.name === "policy") &&
        error instanceof z.ZodError &&
        error.issues.some(({ path }) => path[0] === "text")
      ) {
        return { error: "Enter text to check." };
      }
      return {
        error:
          error instanceof Error && !(error instanceof z.ZodError || error instanceof SyntaxError)
            ? error.message
            : "Check the input against the example. Enter valid JSON and fill in the required fields.",
      };
    }
  });

const signoffInput = z.strictObject({ entries: z.array(entry).max(99), signoff });

export const recordControlGuardSignoff = createServerFn({ method: "POST" })
  .middleware([deterministicCheckMiddleware])
  .validator((data: z.input<typeof signoffInput>) => signoffInput.parse(data))
  .handler(({ data }) => appendFridayEntry(data.entries, data.signoff, new Date()));

function plainReference(text: string) {
  const symbols: Record<string, string> = {
    ge: "≥",
    le: "≤",
    land: "and",
    rightarrow: "→",
    times: "×",
  };
  return text
    .replace(/\$((?:\\.|[^$\\])+)\$/g, (_, math: string) =>
      math
        .replace(/\\text\{([^{}]*)\}/g, "$1")
        .replace(/\\(ge|le|land|rightarrow|times)\b/g, (_, name: string) => symbols[name])
        .replace(/\\([$%])/g, "$1"),
    )
    .replace(/[*\x60]/g, "");
}

export const readControlGuardReference = createServerFn({ method: "GET" }).handler(() =>
  Object.entries(catalogs).map(([group, items]) => ({
    group,
    items: Object.entries(items).map(([id, item]) => ({
      id,
      text: plainReference(
        typeof item === "string"
          ? id === "TW-01"
            ? "Positive skew and prices near the tolerance ceiling. Precog does not run CUSUM."
            : item.split("\n")[0]
          : item.title.replace("Segregation of Duties (SoD)", "Duty Conflicts"),
      ),
    })),
  })),
);
