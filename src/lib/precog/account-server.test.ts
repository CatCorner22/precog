import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "@/lib/request-errors";

/**
 * deleteAccount: a recent sign-in first, then the deletion, then the notice
 * email. The rows, the session and the mailer are stand-ins; the store's own
 * tests cover what the deletion removes.
 */
const calls = vi.hoisted(() => [] as string[]);
const state = vi.hoisted(() => ({
  fresh: true,
  sendFails: false,
  mailConfigured: true,
  email: "owner@example.com" as string | null,
  /** Whether the stored address passes TRUSTED_EMAIL (not X-only, confirmed). */
  trusted: true,
}));
const spies = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  report: vi.fn(async (_error: unknown, _at?: string) => {}),
  fresh: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (input: unknown) => input;
    const chain = {
      middleware: () => chain,
      validator: (fn: (input: unknown) => unknown) => {
        validate = fn;
        return chain;
      },
      handler:
        (fn: (args: { context: unknown; data: unknown }) => unknown) =>
        (args: { context: unknown; data: unknown }) =>
          fn({ context: args.context, data: validate(args.data) }),
    };
    return chain;
  },
}));
vi.mock("@/lib/auth/middleware", () => ({ authMiddleware: {} }));
vi.mock("@/lib/db", () => ({ getSql: async () => ({}) }));
vi.mock("@/lib/auth/fresh-session", () => ({
  requireFreshSession: async (options: { userId: string; message: string }) => {
    spies.fresh(options);
    calls.push("fresh-session");
    if (!state.fresh) throw new RequestError(403, options.message);
    return { email: state.email };
  },
}));
vi.mock("./account-store", () => ({
  deleteAccountRows: async () => {
    calls.push("delete-committed");
    return { quickBooksRefreshTokens: [], stripeCustomerId: null };
  },
  encodeHistoryPage: () => "",
  exportAccountRows: async () => ({}),
  exportBusinessHistoryPage: async () => ({ rows: [], nextBeforeRevision: null }),
  listAccountHistoryBusinesses: async () => [],
}));
vi.mock("./firm/store", () => ({
  loadFirmFor: async () => null,
  trustedEmailAddress: async () => {
    calls.push("trusted-address");
    return state.trusted ? "owner@example.com" : null;
  },
}));
vi.mock("./firm/audit.server", () => ({ recordAuditForAccount: async () => {} }));
vi.mock("./integrations/qbo/client.server", () => ({
  decryptSecret: (s: string) => s,
  qboConfigured: () => false,
  revokeToken: async () => {},
}));
vi.mock("./reminders/mailer.server", () => ({
  mailConfigured: () => state.mailConfigured,
  sendEmail: async (to: string, message: unknown) => {
    calls.push("email");
    spies.sendEmail(to, message);
    if (state.sendFails) throw new Error("Email provider answered 500");
  },
}));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: spies.report }));

const account = await import("./account-server");

function deleteAs(userId: string) {
  const run = account.deleteAccount as unknown as (args: {
    context: { userId: string; bearerToken?: string };
    data: { confirm: string };
  }) => Promise<{ ok: true }>;
  return run({ context: { userId, bearerToken: "tok" }, data: { confirm: "DELETE" } });
}

beforeEach(() => {
  calls.length = 0;
  state.fresh = true;
  state.sendFails = false;
  state.mailConfigured = true;
  state.email = "owner@example.com";
  state.trusted = true;
  spies.sendEmail.mockClear();
  spies.report.mockClear();
  spies.fresh.mockClear();
});

describe("account deletion", () => {
  it("refuses an old sign-in with the sign-in-again message and deletes nothing", async () => {
    state.fresh = false;
    await expect(deleteAs("u1")).rejects.toMatchObject({
      status: 403,
      message: "For your safety, sign in again, then delete your account.",
    });
    expect(account.SIGN_IN_AGAIN_TO_DELETE).toBe(
      "For your safety, sign in again, then delete your account.",
    );
    expect(spies.fresh).toHaveBeenCalledWith({
      userId: "u1",
      bearerToken: "tok",
      message: account.SIGN_IN_AGAIN_TO_DELETE,
    });
    expect(calls).toEqual(["fresh-session"]);
  });

  it("emails the account's address after the deletion commits", async () => {
    await expect(deleteAs("u1")).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["fresh-session", "trusted-address", "delete-committed", "email"]);
    const [to, message] = spies.sendEmail.mock.calls[0] as [
      string,
      { subject: string; text: string },
    ];
    expect(to).toBe("owner@example.com");
    expect(message.subject).toBe("Your Precog account was deleted");
    expect(message.text).toMatch(
      /^Your Precog account was deleted on [A-Z][a-z]{2} \d{1,2}, \d{4}\. If you did not do this, write to .+\.$/,
    );
  });

  it("keeps the deletion when the email fails to send, and reports the failure", async () => {
    state.sendFails = true;
    await expect(deleteAs("u1")).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["fresh-session", "trusted-address", "delete-committed", "email"]);
    expect(spies.report).toHaveBeenCalledTimes(1);
    expect(spies.report.mock.calls[0]?.[1]).toBe("account-deleted-email");
  });

  it("sends nothing without an address or without email set up", async () => {
    state.email = null;
    await expect(deleteAs("u1")).resolves.toEqual({ ok: true });
    state.email = "owner@example.com";
    state.mailConfigured = false;
    await expect(deleteAs("u1")).resolves.toEqual({ ok: true });
    expect(spies.sendEmail).not.toHaveBeenCalled();
    expect(spies.report).not.toHaveBeenCalled();
  });

  it("sends nothing to an address Precog cannot vouch for (X-only or unconfirmed)", async () => {
    state.trusted = false;
    await expect(deleteAs("u1")).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["fresh-session", "trusted-address", "delete-committed"]);
    expect(spies.sendEmail).not.toHaveBeenCalled();
    expect(spies.report).not.toHaveBeenCalled();
  });
});

describe("the deletion notice", () => {
  it("names the day of the deletion and the support address", async () => {
    const { SUPPORT_EMAIL } = await import("./legal/operator");
    const email = account.renderAccountDeletedEmail(new Date("2026-10-06T23:30:00Z"));
    expect(email.text).toBe(
      `Your Precog account was deleted on Oct 6, 2026. If you did not do this, write to ${SUPPORT_EMAIL}.`,
    );
    expect(email.html).toContain("Your Precog account was deleted on Oct 6, 2026.");
  });
});
