import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalProfileStore, quarantineKey } from "./save-conflict";
import { ACTIVE_PROFILE_KEY, defaultProfile, readStoredProfile } from "./practice-profile";
import type { StorageLike } from "./local-data";

const broken = vi.hoisted(() => ({ on: false }));
const reported = vi.hoisted(() => [] as { error: unknown; at: unknown }[]);

// A bug in one of the normalisers profile loading calls, switched on per test.
vi.mock("./firm/reviews", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./firm/reviews")>();
  return {
    ...actual,
    normalizeReviewRecords: (...args: Parameters<typeof actual.normalizeReviewRecords>) => {
      if (broken.on) throw new Error("normaliser bug");
      return actual.normalizeReviewRecords(...args);
    },
  };
});
vi.mock("@/lib/observability/report-browser", () => ({
  reportClientError: (error: unknown, at?: string | null) => void reported.push({ error, at }),
}));

afterEach(() => {
  broken.on = false;
  reported.length = 0;
});

function browser(raw: string, key = ACTIVE_PROFILE_KEY) {
  const data = new Map<string, string>([[key, raw]]);
  const storage: StorageLike = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
  return { data, storage };
}

const ownCopy = () =>
  JSON.stringify({
    ...defaultProfile("general"),
    businessId: "biz_kept",
    practiceName: "Kept Plumbing",
  });

describe("a stored business the normaliser throws on", () => {
  it("tells a normaliser exception apart from text that is not JSON", () => {
    broken.on = true;
    expect(readStoredProfile("{not json").unreadable).toBeNull();
    expect(readStoredProfile(ownCopy()).unreadable).toBeInstanceOf(Error);
  });

  it("is quarantined, reported, and never replaced by the setup sample", () => {
    const raw = ownCopy();
    const { data, storage } = browser(raw);
    const offered: string[] = [];
    broken.on = true;
    const store = new LocalProfileStore(
      () => storage,
      () => "r1",
      (copy) => void offered.push(copy.raw),
    );

    const loaded = store.load();
    expect(loaded.profile.onboardingComplete).toBe(false);
    expect(loaded.profile.practiceName).not.toBe("Kept Plumbing");
    expect(loaded.unreadable?.key).toBe(quarantineKey(raw));
    expect(data.get(quarantineKey(raw))).toBe(raw);
    expect(offered).toEqual([raw]);
    expect(reported).toHaveLength(1);
    expect(reported[0].at).toBe("normalize-local");

    // The setup dialog's steps, and finishing it, write nothing over the copy.
    expect(store.write(loaded.profile).kind).toBe("failed");
    expect(store.write({ ...loaded.profile, onboardingComplete: true }).kind).toBe("failed");
    expect(data.get(ACTIVE_PROFILE_KEY)).toBe(raw);

    // A reload keeps one quarantined copy, not one per load.
    store.load();
    expect([...data.keys()].filter((k) => k.startsWith("precog.quarantine."))).toHaveLength(1);
  });

  it("under the legacy key is not hidden by a setup sample saved to the active key", () => {
    const raw = ownCopy();
    const { data, storage } = browser(raw, "precog.practiceProfile.v1");
    const offered: string[] = [];
    broken.on = true;
    const store = new LocalProfileStore(
      () => storage,
      () => "r3",
      (copy) => void offered.push(copy.raw),
    );

    const loaded = store.load();
    expect(loaded.unreadable?.raw).toBe(raw);
    expect(store.write({ ...loaded.profile, onboardingComplete: true }).kind).toBe("failed");
    expect(data.has(ACTIVE_PROFILE_KEY)).toBe(false);

    // A reload offers the copy again.
    store.load();
    expect(offered).toEqual([raw, raw]);
  });

  it("opens the stored copy again, and saves on top of it, once the normaliser reads it", () => {
    const raw = ownCopy();
    const { data, storage } = browser(raw);
    const store = new LocalProfileStore(
      () => storage,
      () => "r2",
    );
    broken.on = true;
    store.load();
    broken.on = false;

    const loaded = store.load();
    expect(loaded.unreadable).toBeNull();
    expect(loaded.profile.practiceName).toBe("Kept Plumbing");
    expect(store.write({ ...loaded.profile, practiceName: "Renamed" }).kind).toBe("saved");
    expect(data.get(ACTIVE_PROFILE_KEY)).toContain("Renamed");
  });
});
