import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleOAuthUserInfo } from "better-auth/oauth2";

/**
 * Account linking against the app's real Better Auth instance (PGlite-backed):
 * a Google or X sign-in may attach to an existing user only when that user's
 * own email is verified.
 */
type Auth = (typeof import("./server"))["auth"];
let auth: Auth;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("VITE_AUTH_ENABLED", "true");
  ({ auth } = await import("./server"));
}, 60_000);

afterAll(() => {
  vi.unstubAllEnvs();
});

async function providerSignIn(email: string, subject: string) {
  const context = await auth.$context;
  const result = await handleOAuthUserInfo({ context } as never, {
    userInfo: { id: subject, email, emailVerified: true, name: "Owner" },
    account: { providerId: "grok-google", accountId: subject },
  });
  return { context, result };
}

describe("account linking", () => {
  it(
    "refuses to attach a Google sign-in to an unverified email/password account",
    { timeout: 60_000 },
    async () => {
      const email = "owner@dental.example";
      const { user } = await auth.api.signUpEmail({
        body: { email, password: "attacker-password-1", name: "Someone else" },
      });
      expect(user.emailVerified).toBe(false);

      const { context, result } = await providerSignIn(email, "google-subject-1");

      expect(result.error).toBe("account not linked");
      const accounts = await context.internalAdapter.findAccounts(user.id);
      expect(accounts.map((a) => a.providerId)).toEqual(["credential"]);
    },
  );

  it(
    "keeps an unconfirmed sign-up made while Precog cannot send email",
    { timeout: 60_000 },
    async () => {
      const { user, token } = await auth.api.signUpEmail({
        body: { email: "nomail@dental.example", password: "long-password-1", name: "No mail" },
      });
      expect(token).toBeTruthy();
      const { getSql } = await import("@/lib/db");
      const sql = await getSql();
      const kept = await sql`select 1 from unverified_sign_up_kept where user_id = ${user.id}`;
      expect(kept).toHaveLength(1);
    },
  );

  it(
    "still links a Google sign-in to a verified account with the same email",
    {
      timeout: 60_000,
    },
    async () => {
      const email = "verified@dental.example";
      const context = await auth.$context;
      const user = await context.internalAdapter.createUser({
        email,
        name: "Verified owner",
        emailVerified: true,
      });

      const { result } = await providerSignIn(email, "google-subject-2");

      expect(result.error).toBeNull();
      expect(result.data?.user.id).toBe(user.id);
    },
  );
});
