/**
 * The words of a client invitation that both the server (grant-store.ts)
 * and the browser (the `/join/client/{token}` page and the "Your
 * accountant" card) print. No imports, so a page can load it without
 * pulling in server code.
 */

export const GRANT_CONFIRM =
  "Sign in with Google or with the email address the invitation was sent to.";
export const GRANT_CLOSED =
  "This invitation has expired or was already used. Ask the business owner for a new one.";

/** The client invitation page's tab title. */
export const CLIENT_INVITE_TITLE = "Client invitation · Precog";
/** The heading when the link does not open, or acceptance is refused. */
export const CLIENT_INVITE_UNAVAILABLE = "Client invitation unavailable";
/** The button that accepts. */
export const ADD_TO_CLIENTS = "Add to our clients";

/** What the invitation asks of the firm, on the page before anyone accepts. */
export function clientInviteSentence(owner: string, business: string): string {
  return `${owner} invites your firm to work on ${business} in Precog. Accept to add it to your firm's client list; the business stays its owner's.`;
}

/** The toast after the firm owner accepts. */
export function clientJoinedToast(business: string): string {
  return `${business} joined your client list.`;
}
