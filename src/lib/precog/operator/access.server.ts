import { env } from "@/lib/env.server";
import { RequestError } from "@/lib/request-errors";

/**
 * Precog's operators: the user ids in PRECOG_OPERATOR_IDS (comma-separated,
 * server-only, never a VITE_ name). Unset or blank means nobody. Read on
 * every call, so a change takes effect at the next request.
 */
export function operatorIds(): Set<string> {
  const raw = env("PRECOG_OPERATOR_IDS") ?? "";
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

/**
 * Throws the 404 every unknown address gets unless `userId` is an operator,
 * so the operator's functions do not exist for anyone else. Each operator
 * server function calls this before it reads its input.
 */
export function requireOperator(userId: string): void {
  if (!operatorIds().has(userId)) throw new RequestError(404, "Not found");
}
