import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * signIn against a fake Better Auth client and a stubbed window: failures
 * reach the caller as a message the customer can read, and a failed attempt
 * never ends the current session.
 */
const fakeClient = {
  signOut: vi.fn(async () => ({ data: { success: true }, error: null })),
  getSession: vi.fn(async () => ({ data: null, error: null })),
  signIn: {
    oauth2: vi.fn(
      async (): Promise<{
        data: { url?: string } | null;
        error: { code?: string; message?: string } | null;
      }> => ({ data: { url: "https://broker.example/authorize" }, error: null }),
    ),
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("better-auth/react");
  vi.clearAllMocks();
});

type Listener = (event: { origin: string; data: unknown }) => void;

async function load(hostname: string, popup: { closed: boolean } | null = null) {
  vi.resetModules();
  vi.doMock("better-auth/react", () => ({ createAuthClient: () => fakeClient }));
  const messages = new Set<Listener>();
  const location = {
    hostname,
    origin: `https://${hostname}`,
    href: "",
    pathname: "/login",
    search: "",
  };
  vi.stubGlobal("window", {
    location,
    open: vi.fn(() => popup),
    localStorage: { setItem: vi.fn() },
    sessionStorage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
    addEventListener: (type: string, fn: Listener) => type === "message" && messages.add(fn),
    removeEventListener: (type: string, fn: Listener) => messages.delete(fn),
    setInterval: () => 0,
    clearInterval: () => undefined,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
  });
  const client = await import("./client");
  const barrier = await import("./identity-change");
  const post = (data: unknown) => {
    for (const fn of messages) fn({ origin: location.origin, data });
  };
  return { client, barrier, location, post, messages };
}

describe("signIn in the live preview", () => {
  it("rejects with a readable message when the browser blocks the pop-up", async () => {
    const { client, barrier } = await load("app.grok-sandbox.com", null);
    await expect(client.signIn("grok-google")).rejects.toThrow(/blocked the sign-in window/);
    expect(barrier.identityLockReason()).toBeNull();
  });

  it("surfaces the reason the pop-up reports and unlocks the tab", async () => {
    const { client, barrier, post, messages } = await load("app.grok-sandbox.com", {
      closed: false,
    });
    const attempt = client.signIn("grok-google");
    await vi.waitFor(() => expect(messages.size).toBe(1));
    expect(barrier.identityLockReason()).toBe("signing-in");
    post({ source: "grok-auth-popup", token: null, error: "account_not_linked" });
    await expect(attempt).rejects.toThrow(/Sign in with your password instead/);
    expect(barrier.identityLockReason()).toBeNull();
    expect(fakeClient.signOut).not.toHaveBeenCalled();
  });
});

describe("signIn on a deployed site", () => {
  it("keeps the current session until the provider sends the customer back", async () => {
    const { client, location } = await load("precog.example.com");
    await client.signIn("grok-google");
    expect(fakeClient.signOut).not.toHaveBeenCalled();
    expect(fakeClient.signIn.oauth2).toHaveBeenCalledWith(
      expect.objectContaining({ errorCallbackURL: "/login" }),
    );
    expect(location.href).toBe("https://broker.example/authorize");
  });

  it("rejects with a readable message and unlocks when the broker refuses to start", async () => {
    fakeClient.signIn.oauth2.mockResolvedValueOnce({
      data: null,
      error: { code: "oauth_init_failed_401" },
    });
    const { client, barrier } = await load("precog.example.com");
    await expect(client.signIn("grok-google")).rejects.toThrow(/oauth_init_failed_401/);
    expect(barrier.identityLockReason()).toBeNull();
  });
});

describe("signInErrorMessage", () => {
  it("tells a password account holder to use the password", async () => {
    const { client } = await load("precog.example.com");
    expect(client.signInErrorMessage("account_not_linked")).toMatch(/password/);
    expect(client.signInErrorMessage("account not linked")).toMatch(/password/);
  });

  it("names the code for anything else", async () => {
    const { client } = await load("precog.example.com");
    expect(client.signInErrorMessage("state_mismatch")).toBe(
      'Sign-in did not finish. Try again; if it keeps failing, tell support the code "state_mismatch".',
    );
  });
});
