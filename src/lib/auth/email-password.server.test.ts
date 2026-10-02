import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import type { RenderedEmail } from "@/lib/precog/reminders/email";

/**
 * Email/password sign-in with email connected, against the app's real Better
 * Auth instance (PGlite-backed): a new address confirms before it signs in,
 * a password resets by email, and a stale unconfirmed sign-up stops holding
 * its address.
 */
const mail = vi.hoisted(() => ({ sent: [] as { to: string; message: RenderedEmail }[] }));
vi.mock("@/lib/precog/reminders/mailer.server", () => ({
  mailConfigured: () => true,
  sendEmail: async (to: string, message: RenderedEmail) => {
    mail.sent.push({ to, message });
  },
}));

const report = vi.hoisted(() => ({
  error: vi.fn(async (_err: unknown, _at?: string | null) => {}),
}));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: report.error }));

type Auth = (typeof import("./server"))["auth"];
let auth: Auth;
let sql: import("@/lib/db").Sql;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("VITE_AUTH_ENABLED", "true");
  ({ auth } = await import("./server"));
  sql = await (await import("@/lib/db")).getSql();
}, 60_000);

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  mail.sent.length = 0;
});

function linkIn(message: RenderedEmail): URL {
  const line = message.text.split("\n").find((l) => l.startsWith("http"));
  if (!line) throw new Error("no link in the email");
  return new URL(line);
}

async function signInError(email: string, password: string): Promise<string | null> {
  try {
    await auth.api.signInEmail({ body: { email, password } });
    return null;
  } catch (err) {
    return (err as { body?: { code?: string } }).body?.code ?? String(err);
  }
}

async function makeStale(email: string) {
  await sql`update "user" set "createdAt" = now() - interval '25 hours' where email = ${email}`;
}

describe("email confirmation", () => {
  it(
    "sends a link on sign-up, refuses sign-in until it is opened, then signs in",
    { timeout: 60_000 },
    async () => {
      const email = "new@firm.example";
      const created = await auth.api.signUpEmail({
        body: { email, password: "long-password-1", name: "New" },
      });
      expect(created.token).toBeNull();
      expect(mail.sent.map((m) => [m.to, m.message.subject])).toEqual([
        [email, "Confirm your email for Precog"],
      ]);
      const link = linkIn(mail.sent[0].message);
      expect(link.searchParams.get("callbackURL")).toBe("/login?verified=1");

      expect(await signInError(email, "long-password-1")).toBe("EMAIL_NOT_VERIFIED");
      expect(mail.sent).toHaveLength(2);

      await auth.api.verifyEmail({ query: { token: link.searchParams.get("token")! } });
      expect(await signInError(email, "long-password-1")).toBeNull();
    },
  );

  it(
    "keeps an account made before confirmation began and sends it a link at sign-in",
    { timeout: 60_000 },
    async () => {
      const email = "legacy@firm.example";
      await auth.api.signUpEmail({ body: { email, password: "long-password-1", name: "Old" } });
      const [user] = await sql<{ id: string }>`select id from "user" where email = ${email}`;
      await sql`insert into unverified_sign_up_kept (user_id) values (${user.id})`;
      await makeStale(email);
      mail.sent.length = 0;

      await auth.api.signUpEmail({
        body: { email: "other@firm.example", password: "long-password-2", name: "Other" },
      });
      expect(await sql`select 1 from "user" where email = ${email}`).toHaveLength(1);
      expect(await signInError(email, "long-password-1")).toBe("EMAIL_NOT_VERIFIED");
      expect(mail.sent.at(-1)?.to).toBe(email);
    },
  );
});

describe("password reset", () => {
  it(
    "emails a link that sets a new password and confirms the address",
    { timeout: 60_000 },
    async () => {
      const email = "forgot@firm.example";
      await auth.api.signUpEmail({ body: { email, password: "long-password-1", name: "F" } });
      mail.sent.length = 0;

      await auth.api.requestPasswordReset({ body: { email } });
      expect(mail.sent.map((m) => m.message.subject)).toEqual(["Set a new Precog password"]);
      const token = linkIn(mail.sent[0].message).pathname.split("/").at(-1)!;
      await auth.api.resetPassword({ body: { newPassword: "new-password-22", token } });

      expect(await signInError(email, "new-password-22")).toBeNull();
      expect(await signInError(email, "long-password-1")).toBe("INVALID_EMAIL_OR_PASSWORD");
    },
  );
});

describe("stale unconfirmed sign-ups", () => {
  it(
    "frees the address a day later for a new sign-up or a Google sign-in",
    { timeout: 60_000 },
    async () => {
      const email = "owner@dental.example";
      await auth.api.signUpEmail({
        body: { email, password: "attacker-password", name: "Someone else" },
      });
      await makeStale(email);

      const context = await auth.$context;
      const { releaseStaleSignUps } = await import("./email-password.server");
      expect(await releaseStaleSignUps(sql)).toBe(1);
      const result = await handleOAuthUserInfo({ context } as never, {
        userInfo: { id: "g-1", email, emailVerified: true, name: "Owner" },
        account: { providerId: "grok-google", accountId: "g-1" },
      });
      expect(result.error).toBeNull();
      const accounts = await context.internalAdapter.findAccounts(result.data!.user.id);
      expect(accounts.map((a) => a.providerId)).toEqual(["grok-google"]);

      const again = "again@dental.example";
      await auth.api.signUpEmail({
        body: { email: again, password: "attacker-password", name: "A" },
      });
      await makeStale(again);
      mail.sent.length = 0;
      await auth.api.signUpEmail({
        body: { email: again, password: "owner-password-1", name: "B" },
      });
      expect(mail.sent.map((m) => m.to)).toEqual([again]);
    },
  );

  it("leaves a fresh one, and one with a Google sign-in, alone", { timeout: 60_000 }, async () => {
    const { releaseStaleSignUps } = await import("./email-password.server");
    await auth.api.signUpEmail({
      body: { email: "fresh@firm.example", password: "long-password-1", name: "Fresh" },
    });
    const context = await auth.$context;
    const linked = await context.internalAdapter.createUser({
      email: "linked@firm.example",
      name: "Linked",
      emailVerified: false,
    });
    await context.internalAdapter.linkAccount({
      userId: linked.id,
      providerId: "credential",
      accountId: linked.id,
    });
    await context.internalAdapter.linkAccount({
      userId: linked.id,
      providerId: "grok-x",
      accountId: "x-1",
    });
    await makeStale("linked@firm.example");
    expect(await releaseStaleSignUps(sql)).toBe(0);
  });

  it(
    "keeps an unconfirmed account that signed in or holds a business",
    { timeout: 60_000 },
    async () => {
      const { releaseStaleSignUps } = await import("./email-password.server");
      const context = await auth.$context;
      const ids: string[] = [];
      for (const email of ["worked@firm.example", "signed-in@firm.example"]) {
        await auth.api.signUpEmail({ body: { email, password: "long-password-1", name: "W" } });
        const [row] = await sql<{ id: string }>`select id from "user" where email = ${email}`;
        ids.push(row.id);
      }
      await sql`insert into businesses (id, user_id) values ('biz-kept', ${ids[0]})`;
      await context.internalAdapter.createSession(ids[1]);
      await makeStale("worked@firm.example");
      await makeStale("signed-in@firm.example");
      expect(await releaseStaleSignUps(sql)).toBe(0);
    },
  );
});

describe("auth email limit", () => {
  it("sends at most three of a kind per account an hour", { timeout: 60_000 }, async () => {
    const { sendAuthEmail } = await import("./email-password.server");
    const context = await auth.$context;
    const user = await context.internalAdapter.createUser({
      email: "flood@firm.example",
      name: "Flood",
      emailVerified: false,
    });
    const send = vi.fn(async () => undefined);
    const message = { subject: "s", text: "t", html: "h" };
    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(
        await sendAuthEmail(sql, send, { userId: user.id, kind: "reset", to: "x", message }),
      );
    }
    expect(results).toEqual([true, true, true, false]);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("reports a failed send and answers false", { timeout: 60_000 }, async () => {
    const { sendAuthEmail } = await import("./email-password.server");
    const context = await auth.$context;
    const user = await context.internalAdapter.createUser({
      email: "bounce@firm.example",
      name: "Bounce",
      emailVerified: false,
    });
    const failure = new Error("Resend refused the request");
    const send = vi.fn(async () => {
      throw failure;
    });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const message = { subject: "s", text: "t", html: "h" };
    expect(
      await sendAuthEmail(sql, send, { userId: user.id, kind: "verify", to: "x", message }),
    ).toBe(false);
    expect(report.error).toHaveBeenCalledWith(failure, "auth-verify-email");
    quiet.mockRestore();
  });
});
