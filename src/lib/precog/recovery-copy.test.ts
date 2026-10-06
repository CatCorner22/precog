import { describe, expect, it, vi } from "vitest";
import { memoryStorage } from "@/test/memory-storage";
import { defaultProfile, type PracticeProfile } from "./practice-profile";
import {
  RestoreError,
  recoveryCopyText,
  restoreFromRecoveryText,
  restoreMessage,
} from "./recovery-copy";
import { ACTIVE_PROFILE_KEY, PORTFOLIO_KEY } from "./storage-keys";
import { ScopedStorage } from "./workspace-storage";

// A business named "Normaliser throws" stands for one this build cannot read.
vi.mock("./practice-profile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./practice-profile")>();
  return {
    ...actual,
    normalizeProfile: (input: Partial<PracticeProfile>, options?: { today?: string }) => {
      if (input.practiceName === "Normaliser throws") throw new Error("unreadable");
      return actual.normalizeProfile(input, options);
    },
  };
});

function business(id: string, name: string): PracticeProfile {
  return { ...defaultProfile("dental"), businessId: id, practiceName: name };
}

function workspaceWith(local: Record<string, string>, accountId: string | null = "A") {
  const raw = memoryStorage();
  const storage = new ScopedStorage(raw, accountId);
  for (const [key, value] of Object.entries(local)) storage.setItem(key, value);
  return { accountId, local: storage, session: new ScopedStorage(memoryStorage(), accountId) };
}

function portfolioOf(storage: ScopedStorage): Record<string, PracticeProfile> {
  return JSON.parse(storage.getItem(PORTFOLIO_KEY) ?? "{}") as Record<string, PracticeProfile>;
}

describe("restoring a recovery copy", () => {
  it("writes back every business a recovery copy holds", async () => {
    const plumbing = business("biz_plumbing", "Kept Plumbing");
    const bakery = business("biz_bakery", "Corner Bakery");
    const open = business("biz_open", "Open Dental");
    const source = workspaceWith({
      [PORTFOLIO_KEY]: JSON.stringify({ biz_plumbing: plumbing, biz_bakery: bakery }),
      [ACTIVE_PROFILE_KEY]: `{"localRev":"r1","localBase":null,${JSON.stringify(open).slice(1)}`,
    });
    const text = recoveryCopyText(source, null);

    const target = workspaceWith({}, "B");
    const result = await restoreFromRecoveryText(text, target.local);

    expect(result).toEqual({ restored: 3, skipped: 0 });
    const restored = portfolioOf(target.local);
    expect(Object.keys(restored).sort()).toEqual(["biz_bakery", "biz_open", "biz_plumbing"]);
    expect(restored.biz_plumbing.practiceName).toBe("Kept Plumbing");
    expect(restored.biz_bakery.practiceName).toBe("Corner Bakery");
    expect(restored.biz_open.practiceName).toBe("Open Dental");
    expect(restored.biz_open).not.toHaveProperty("localRev");
    expect(restoreMessage(result)).toBe("Restored 3 businesses. Reload the page to open them.");
  });

  it("skips and counts a business it cannot read, and restores the rest", async () => {
    const kept = business("biz_kept", "Kept Plumbing");
    const throws = business("biz_throws", "Normaliser throws");
    const text = JSON.stringify({
      version: 1,
      accountId: "A",
      profile: null,
      local: {
        [PORTFOLIO_KEY]: JSON.stringify({
          biz_kept: kept,
          biz_null: null,
          biz_text: "not a business",
          biz_throws: throws,
        }),
      },
      session: {},
    });
    const target = workspaceWith({});
    const result = await restoreFromRecoveryText(text, target.local);

    expect(result).toEqual({ restored: 1, skipped: 3 });
    expect(Object.keys(portfolioOf(target.local))).toEqual(["biz_kept"]);
    expect(restoreMessage(result)).toBe(
      "Restored 1 business. Reload the page to open it. Precog could not read 3 businesses in the file.",
    );
  });

  it("keeps the businesses already listed; the copy's version replaces the same business", async () => {
    const target = workspaceWith({
      [PORTFOLIO_KEY]: JSON.stringify({
        biz_other: business("biz_other", "Other Shop"),
        biz_same: business("biz_same", "Old Name"),
        biz_null: null,
      }),
    });
    const text = recoveryCopyText(workspaceWith({}), business("biz_same", "New Name"));
    expect(await restoreFromRecoveryText(text, target.local)).toEqual({ restored: 1, skipped: 0 });
    const portfolio = portfolioOf(target.local);
    expect(portfolio.biz_other.practiceName).toBe("Other Shop");
    expect(portfolio.biz_same.practiceName).toBe("New Name");
    // The null entry, which stops the list of businesses from opening, is gone.
    expect(Object.keys(portfolio).sort()).toEqual(["biz_other", "biz_same"]);
  });

  it("refuses a file that is not a recovery copy and writes nothing", async () => {
    const target = workspaceWith({});
    await expect(restoreFromRecoveryText("{not json", target.local)).rejects.toThrow(RestoreError);
    await expect(
      restoreFromRecoveryText(JSON.stringify({ version: 2 }), target.local),
    ).rejects.toThrow("This file is not a Precog recovery copy.");
    expect(target.local.getItem(PORTFOLIO_KEY)).toBeNull();
  });

  it("says when the file holds nothing to restore", async () => {
    const target = workspaceWith({});
    const result = await restoreFromRecoveryText(recoveryCopyText(target, null), target.local);
    expect(result).toEqual({ restored: 0, skipped: 0 });
    expect(target.local.getItem(PORTFOLIO_KEY)).toBeNull();
    expect(restoreMessage(result)).toBe("The file holds no business Precog can restore.");
  });

  it("says so when the browser refuses the write", async () => {
    const text = recoveryCopyText(workspaceWith({}), business("biz_one", "One"));
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    await expect(restoreFromRecoveryText(text, refusing)).rejects.toThrow(
      "This browser refused to save the restored businesses.",
    );
  });
});
