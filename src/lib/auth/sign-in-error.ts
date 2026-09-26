/**
 * What the sign-in page says when a Google or X sign-in fails. `signIn`
 * (./client.ts) throws for a blocked pop-up, a closed or cancelled pop-up,
 * and a broker error; each becomes one sentence the visitor can act on.
 */
export function signInErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (/pop-?up blocked/i.test(message)) {
    return "Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.";
  }
  if (/cancelled/i.test(message)) {
    return "Sign-in was cancelled or did not finish. Try again.";
  }
  if (message) return `Sign-in failed (${message}). Try again in a moment.`;
  return "Sign-in failed. Try again in a moment.";
}
