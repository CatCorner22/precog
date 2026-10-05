import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertExpectedAccount } from "@/lib/auth/expected-account";
import { getSql } from "@/lib/db";
import { RequestError, requireObject } from "@/lib/request-errors";
import { isBusinessId } from "../../profile-input";
import { parseCommand, type ExecutionCommand } from "./model";
import { executeControlCommand, listControlExecutions } from "./store";

function scope(input: unknown) {
  const raw = requireObject(input);
  if (
    !isBusinessId(raw.businessId) ||
    typeof raw.expectedAccountId !== "string" ||
    !raw.expectedAccountId ||
    raw.expectedAccountId.length > 200
  ) {
    throw new RequestError(400, "Reload the account and choose a saved business.");
  }
  return { businessId: raw.businessId, expectedAccountId: raw.expectedAccountId };
}
export const getControlExecutionLog = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      businessId: string;
      expectedAccountId: string;
      period: string;
      cursor: string | null;
    }) => {
      const checked = scope(input);
      if (
        typeof input.period !== "string" ||
        (input.cursor !== null && typeof input.cursor !== "string")
      )
        throw new RequestError(400, "Choose a month and log position.");
      return { ...checked, period: input.period, cursor: input.cursor };
    },
  )
  .handler(async ({ context, data }) => {
    assertExpectedAccount(data.expectedAccountId, context.userId);
    return listControlExecutions(
      await getSql(),
      context.userId,
      data.businessId,
      data.period,
      data.cursor,
    );
  });

export const recordControlExecution = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { businessId: string; expectedAccountId: string; command: ExecutionCommand }) => ({
      ...scope(input),
      command: parseCommand(input.command),
    }),
  )
  .handler(async ({ context, data }) => {
    assertExpectedAccount(data.expectedAccountId, context.userId);
    return executeControlCommand(await getSql(), context.userId, data.businessId, data.command);
  });
