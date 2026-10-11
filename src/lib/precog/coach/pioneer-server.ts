import { createServerFn } from "@tanstack/react-start";
import { heavyLlmMiddleware } from "../llm/middleware";
import {
  answerPioneerRules,
  readPioneerRequest,
  selectPioneerHighlights,
  type PioneerCoachInput,
} from "./pioneer-answer";

/**
 * Rules brief, with no model call, so it spends no daily model unit. It runs
 * the whole local analysis, so it takes the heavy allowance: signed-out
 * callers the small per-address gate, signed-in callers the per-user limit.
 */
export const runPioneerRules = createServerFn({ method: "POST" })
  .middleware([heavyLlmMiddleware])
  .validator((input: PioneerCoachInput) => readPioneerRequest(input))
  .handler(({ data }) => answerPioneerRules(data));

/**
 * Statement ids only. A second heavy allowance: the brief is rebuilt on the
 * server and the model may only select ids. The screen drops the ids when
 * the fingerprint does not match the brief it already painted.
 */
export const runPioneerHighlights = createServerFn({ method: "POST" })
  .middleware([heavyLlmMiddleware])
  .validator((input: PioneerCoachInput) => readPioneerRequest(input))
  .handler(({ data, context }) => selectPioneerHighlights(data, context.llm));
