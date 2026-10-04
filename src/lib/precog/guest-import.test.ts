import { describe, expect, it } from "vitest";
import {
  copyGuestBusinesses,
  declineGuestBusinesses,
  importableGuestBusinesses,
} from "./guest-import";
import { clearLocalCopies } from "./local-data";
import {
  ACTIVE_PROFILE_KEY,
  loadPortfolio,
  normalizeProfile,
  savePortfolioEntry,
} from "./practice-profile";
import { ScopedStorage } from "./workspace-storage";
import { readValueProof, writeValueProof } from "./value-proof-store";
import { newProcedure, newStep, verifyProcedure } from "./procedures/lifecycle";
import { assertVerificationsAllowed } from "./procedures/verify-guard";

/** One browser's localStorage; guest and accounts are ScopedStorage views over it. */
class MemoryStorage {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

function business(id: string, name: string, extra: Record<string, unknown> = {}) {
  return normalizeProfile({ businessId: id, practiceName: name, industry: "dental", ...extra });
}

function browser() {
  const raw = new MemoryStorage();
  return {
    raw,
    guest: new ScopedStorage(raw, null),
    account: new ScopedStorage(raw, "A"),
    other: new ScopedStorage(raw, "B"),
  };
}

describe("guest work copied into an account", () => {
  it("offers finished guest businesses with real work, including the open one", () => {
    const { guest, account } = browser();
    savePortfolioEntry(business("biz_1", "Riverside Dental"), guest);
    savePortfolioEntry(business("biz_2", "Unfinished", { onboardingComplete: false }), guest);
    guest.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(business("biz_3", "Hillcrest Vet")));

    const names = importableGuestBusinesses(guest, account).map((p) => p.practiceName);
    expect(names.sort()).toEqual(["Hillcrest Vet", "Riverside Dental"]);
  });

  it("copies each business once under a new id and keeps the guest original", () => {
    const { guest, account } = browser();
    savePortfolioEntry(business("biz_1", "Riverside Dental"), guest);

    const ids = copyGuestBusinesses(guest, account);
    expect(ids).toHaveLength(1);
    const copies = Object.values(loadPortfolio(account));
    expect(copies).toHaveLength(1);
    expect(copies[0].practiceName).toBe("Riverside Dental");
    expect(copies[0].businessId).toBe(ids[0]);
    expect(ids[0]).not.toBe("biz_1");
    expect(loadPortfolio(guest).biz_1?.practiceName).toBe("Riverside Dental");

    expect(importableGuestBusinesses(guest, account)).toEqual([]);
    expect(copyGuestBusinesses(guest, account)).toHaveLength(0);
    expect(Object.keys(loadPortfolio(account))).toHaveLength(1);
  });

  it("keeps a procedure verified while signed out as last verified, so the account's first save goes through", () => {
    const { guest, account } = browser();
    const verified = verifyProcedure(
      newProcedure(
        {
          industry: "dental",
          title: "Make the deposit",
          purpose: "Gets the day's cash to the bank. Done when the bank shows the deposit.",
          trigger: "Every day at close",
          module: "Front-office safe",
          steps: [newStep("Count the drawer.")],
        },
        "2026-09-01",
      ),
      "owner",
      "2026-09-10",
    );
    savePortfolioEntry(business("biz_1", "Riverside Dental", { procedures: [verified] }), guest);

    expect(copyGuestBusinesses(guest, account)).toHaveLength(1);
    const [copy] = Object.values(loadPortfolio(account));
    expect(copy.procedures?.[0]?.verifiedAt).toBeUndefined();
    expect(copy.procedures?.[0]?.lastVerifiedAt).toBe("2026-09-10");
    expect(() =>
      assertVerificationsAllowed({
        previousProfile: null,
        nextProfile: copy,
        saverId: "user-a",
        saverRole: "preparer",
        saverNames: ["A"],
        latestDay: "2026-09-29",
      }),
    ).not.toThrow();
    // The guest original keeps its verification.
    expect(loadPortfolio(guest).biz_1?.procedures?.[0]?.verifiedAt).toBe("2026-09-10");
  });

  it("brings the business's value case and evidence along to the copy", () => {
    const { guest, account } = browser();
    savePortfolioEntry(business("biz_1", "Riverside Dental"), guest);
    writeValueProof("biz_1", { valueCase: { hourlyRate: 90 }, evidence: undefined }, guest);

    expect(copyGuestBusinesses(guest, account)).toHaveLength(1);
    const [copy] = Object.values(loadPortfolio(account));
    expect(readValueProof(copy.businessId as string, account, { claimLegacy: false })).toEqual({
      valueCase: { hourlyRate: 90 },
      evidence: undefined,
    });
  });

  it("remembers the copy per account, so another account may still copy", () => {
    const { guest, account, other } = browser();
    savePortfolioEntry(business("biz_1", "Riverside Dental"), guest);
    copyGuestBusinesses(guest, account);
    expect(importableGuestBusinesses(guest, other)).toHaveLength(1);
  });

  it("remembers 'Not now' per account and guest business; the recovery panel still sees them", () => {
    const { guest, account, other } = browser();
    savePortfolioEntry(business("biz_1", "Riverside Dental"), guest);
    declineGuestBusinesses(guest, account);
    savePortfolioEntry(business("biz_2", "Hillcrest Vet"), guest);

    const prompt = importableGuestBusinesses(guest, account, { includeDeclined: false });
    expect(prompt.map((p) => p.practiceName)).toEqual(["Hillcrest Vet"]);
    expect(importableGuestBusinesses(guest, account)).toHaveLength(2);
    expect(importableGuestBusinesses(guest, other, { includeDeclined: false })).toHaveLength(2);

    // The prompt's Save copies only what it offered; the panel copies the rest.
    expect(copyGuestBusinesses(guest, account, { includeDeclined: false })).toHaveLength(1);
    expect(Object.values(loadPortfolio(account)).map((p) => p.practiceName)).toEqual([
      "Hillcrest Vet",
    ]);
    expect(copyGuestBusinesses(guest, account)).toHaveLength(1);
    expect(importableGuestBusinesses(guest, account)).toEqual([]);
  });
});

describe("clearLocalCopies over an account's ScopedStorage", () => {
  it("clears that account's keys and leaves the guest and other accounts alone", () => {
    const { raw, guest, account, other } = browser();
    savePortfolioEntry(business("biz_1", "Guest Dental"), guest);
    savePortfolioEntry(business("biz_2", "A Dental"), account);
    account.setItem("precog-value.v1", "{}");
    savePortfolioEntry(business("biz_3", "B Dental"), other);
    raw.setItem("unrelated", "keep");

    clearLocalCopies(account);

    expect(account.entries()).toEqual({});
    expect(loadPortfolio(guest).biz_1).toBeDefined();
    expect(loadPortfolio(other).biz_3).toBeDefined();
    expect(raw.getItem("unrelated")).toBe("keep");
  });
});
