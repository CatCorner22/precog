import { afterEach, describe, expect, it, vi } from "vitest";

/** requireUserId: the dev user only without auth and without a real database. */
afterEach(() => {
  vi.doUnmock("./server");
  vi.doUnmock("../db");
  vi.restoreAllMocks();
});

async function load(opts: { authConfigured: boolean; databaseConfigured: boolean }) {
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.doMock("./server", () => ({ auth: {}, authConfigured: opts.authConfigured }));
  vi.doMock("../db", () => ({ databaseConfigured: opts.databaseConfigured }));
  return import("./verify.server");
}

describe("requireUserId with auth disabled", () => {
  it("refuses the shared dev user when a real database is configured", async () => {
    const { requireUserId } = await load({ authConfigured: false, databaseConfigured: true });
    await expect(requireUserId()).rejects.toThrow(/refusing to fall back to the shared dev user/);
  });

  it("uses the dev user when there is no database either", async () => {
    const { requireUserId, DEV_USER_ID } = await load({
      authConfigured: false,
      databaseConfigured: false,
    });
    await expect(requireUserId()).resolves.toBe(DEV_USER_ID);
  });
});
