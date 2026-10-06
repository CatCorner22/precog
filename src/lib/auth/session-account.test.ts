import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  enabled: true,
  getSession: vi.fn(),
}));

vi.mock("./client", () => ({
  get authEnabled() {
    return auth.enabled;
  },
  authClient: { getSession: auth.getSession },
}));

const { currentAccountId } = await import("./session-account");

describe("currentAccountId", () => {
  it("answers the signed-in account's id", async () => {
    auth.enabled = true;
    auth.getSession.mockResolvedValueOnce({ data: { user: { id: "user_1" } } });
    await expect(currentAccountId()).resolves.toBe("user_1");
  });

  it("answers null for a signed-out visitor", async () => {
    auth.enabled = true;
    auth.getSession.mockResolvedValueOnce({ data: null });
    await expect(currentAccountId()).resolves.toBeNull();
  });

  it("answers the fallback account's id when auth is turned off", async () => {
    auth.enabled = false;
    await expect(currentAccountId()).resolves.toBe("dev-user");
    expect(auth.getSession).toHaveBeenCalledTimes(2);
  });
});
