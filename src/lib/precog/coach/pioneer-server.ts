import { createServerFn } from "@tanstack/react-start";
import { heavyLlmMiddleware, localLlmMiddleware } from "../llm/middleware";
import {
  answerPioneer,
  answerPioneerRules,
  readPioneerRequest,
  selectPioneerHighlights,
  type PioneerCoachInput,
} from "./pioneer-answer";

/**
 * The coach's server function: the heavy allowance decides who may run it and
 * whether the model may write the brief; pioneer-answer.ts does the rest.
 */
export const runPioneerCoach = createServerFn({ method: "POST" })
  .middleware([heavyLlmMiddleware])
  .validator((input: PioneerCoachInput) => readPioneerRequest(input))
  .handler(({ data, context }) => answerPioneer(data, context.llm));

/** Rules brief, with no model call. It does not spend a model slot; ranking does. */
export const runPioneerRules = createServerFn({ method: "POST" })
  .middleware([localLlmMiddleware])
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
