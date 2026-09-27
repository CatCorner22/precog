import { RequestError } from "../request-errors";

/**
 * What the customer reads when the signed-in account changed under an open
 * page: the locked screen and a response that arrived for the old account.
 */
export const ACCOUNT_CHANGED_MESSAGE =
  "The signed-in account changed. Reload this page to continue.";

/** The same event when the app refused the request before it saved anything. */
export const ACCOUNT_CHANGED_NOTHING_SAVED = `${ACCOUNT_CHANGED_MESSAGE} This request saved nothing.`;

/** A client expectation is a guard, never an authorization credential. */
export function assertExpectedAccount(expected: unknown, actual: string): void {
  if (typeof expected !== "string" || !expected || expected !== actual)
    throw new RequestError(409, ACCOUNT_CHANGED_NOTHING_SAVED);
}
