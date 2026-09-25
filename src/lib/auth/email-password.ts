/**
 * Local email/password sign-in (this app's Better Auth DB — not the broker).
 *
 * On, so a firm that does not standardize on Google or X can still sign in.
 * The forms live on /login (`authClient.signUp.email` / `signIn.email`).
 *
 * Do NOT edit `server.ts` for this — that file is frozen pre-wired config.
 */
export const emailAndPasswordEnabled = true;

export const PASSWORD_MIN_LENGTH = 10;
