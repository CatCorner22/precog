import { RequestError } from "../request-errors";
/** A client expectation is a guard, never an authorization credential. */
export function assertExpectedAccount(expected: unknown, actual: string): void {
  if (typeof expected !== "string" || !expected || expected !== actual)
    throw new RequestError(
      409,
      "The signed-in account changed. Reload before continuing; no changes were saved by this request.",
    );
}
