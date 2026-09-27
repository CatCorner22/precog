import { createServerFn } from "@tanstack/react-start";
import { heavyLlmMiddleware } from "../llm/middleware";
import { answerPioneer, readPioneerRequest, type PioneerCoachInput } from "./pioneer-answer";

/**
 * The coach's server function: the heavy allowance decides who may run it and
 * whether the model may write the brief; pioneer-answer.ts does the rest.
 */
export const runPioneerCoach = createServerFn({ method: "POST" })
  .middleware([heavyLlmMiddleware])
  .validator((input: PioneerCoachInput) => readPioneerRequest(input))
  .handler(({ data, context }) => answerPioneer(data, context.llm));
