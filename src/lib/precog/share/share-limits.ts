/**
 * The passcode-guess limits as figures, with no server code behind them, so
 * the pages that quote them (the share page's refusal text, the Privacy
 * page's retention table) do not pull `share-attempts.ts` and its scrypt
 * import into the browser bundle.
 */

/** Passcode guesses allowed per share within one window before the link locks. */
export const PASSCODE_ATTEMPT_LIMIT = 10;
/** Length, in minutes, of the window the guesses are counted over. */
export const PASSCODE_ATTEMPT_WINDOW_MINUTES = 15;
/** Failed-guess log rows (which carry an IP hash) are kept this many days. */
export const PASSCODE_ATTEMPT_RETENTION_DAYS = 30;
