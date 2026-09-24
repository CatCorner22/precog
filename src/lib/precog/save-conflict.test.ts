import { describe, expect, it } from "vitest";
import { AccountLineage, isStaleSave, LocalProfileStore, storedRevision } from "./save-conflict";
import { ACTIVE_PROFILE_KEY, defaultProfile, type PracticeProfile } from "./practice-profile";
import type { StorageLike } from "./local-data";
import type { KnowledgeItem } from "./types";

describe("isStaleSave", () => {
  it("treats an absent business as fresh", () => {
    expect(isStaleSave(null, null)).toBe(false);
    expect(isStaleSave(null, 3)).toBe(false);
  });

  it("treats a missing or mismatched base revision as stale", () => {
    expect(isStaleSave(0, null)).toBe(true);
    expect(isStaleSave(2, 1)).toBe(true);
  });

  it("accepts a matching revision", () => {
    expect(isStaleSave(2, 2)).toBe(false);
  });
});

/** One browser's local storage, shared by every tab of the app. */
function browser() {
  const data = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
  let n = 0;
  const tab = () =>
    new LocalProfileStore(
      () => storage,
      () => `r${++n}`,
    );
  const stored = () => data.get(ACTIVE_PROFILE_KEY) ?? null;
  return { storage, tab, stored };
}

let clock = Date.parse("2026-09-23T10:00:00Z");
/** An edit, as the provider's reducer makes one: a new object with a new stamp. */
function edit(p: PracticeProfile, patch: Partial<PracticeProfile>): PracticeProfile {
  clock += 1000;
  return { ...p, ...patch, updatedAt: new Date(clock).toISOString() };
}

function item(name: string): KnowledgeItem {
  return {
    id: `k-${name}`,
    name,
    criticality: "important",
    category: "process",
    description: "",
    linkedProcessIds: [],
  };
}

const names = (p: PracticeProfile) => (p.customKnowledge ?? []).map((k) => k.name);

function ownBusiness(): PracticeProfile {
  return { ...defaultProfile("general"), businessId: "biz_two_tab", practiceName: "Two Tab Co" };
}

describe("two tabs of one browser on the same business", () => {
  it("a stale tab cannot overwrite a register item saved from the other tab", () => {
    const b = browser();
    const setup = b.tab();
    setup.write(ownBusiness());
    const A = b.tab();
    const B = b.tab();
    const a0 = A.load().profile;
    const b0 = B.load().profile;

    const bWithItem = edit(b0, { customKnowledge: [item("Item from B")] });
    expect(B.write(bWithItem).kind).toBe("saved");

    // A never heard about B's save (its tab was asleep) and edits its old copy.
    const staleA = edit(a0, { customKnowledge: [item("Item 2 from A")] });
    const result = A.write(staleA);
    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") expect(names(result.theirs)).toEqual(["Item from B"]);
    // B's item is still what this browser holds.
    expect(names(A.load().profile)).toEqual(["Item from B"]);
  });

  it("a stale tab cannot undo a rename saved from the other tab", () => {
    const b = browser();
    b.tab().write(ownBusiness());
    const A = b.tab();
    const B = b.tab();
    const a0 = A.load().profile;
    B.write(edit(B.load().profile, { practiceName: "Renamed In B" }));
    expect(A.write(edit(a0, { customKnowledge: [item("Item 3 from A")] })).kind).toBe("conflict");
    expect(A.load().profile.practiceName).toBe("Renamed In B");
  });

  it("a tab with nothing unsaved takes the other tab's save, then saves on top of it", () => {
    const b = browser();
    b.tab().write(ownBusiness());
    const A = b.tab();
    const B = b.tab();
    const a0 = A.load().profile;
    const bSaved = edit(B.load().profile, { customKnowledge: [item("Item from B")] });
    B.write(bSaved);

    const change = A.receive(b.stored(), a0, true);
    expect(change.kind).toBe("adopt");
    if (change.kind !== "adopt") return;
    expect(names(change.profile)).toEqual(["Item from B"]);
    A.accept(change.rev, change.profile.updatedAt);

    const aNext = edit(change.profile, {
      customKnowledge: [...(change.profile.customKnowledge ?? []), item("Item 2 from A")],
    });
    expect(A.write(aNext).kind).toBe("saved");
    // B, which has nothing unsaved either, takes A's save in turn.
    const back = B.receive(b.stored(), bSaved, true);
    expect(back.kind).toBe("adopt");
    if (back.kind === "adopt")
      expect(names(back.profile)).toEqual(["Item from B", "Item 2 from A"]);
  });

  it("a tab with an unsaved edit asks instead of taking the other tab's save", () => {
    const b = browser();
    b.tab().write(ownBusiness());
    const A = b.tab();
    const B = b.tab();
    const a0 = A.load().profile;
    B.write(edit(B.load().profile, { practiceName: "Renamed In B" }));
    const change = A.receive(b.stored(), edit(a0, { practiceName: "Renamed In A" }), false);
    expect(change.kind).toBe("conflict");
  });

  it("choosing this tab's version replaces the other tab's copy, and the other tab takes it", () => {
    const b = browser();
    b.tab().write(ownBusiness());
    const A = b.tab();
    const B = b.tab();
    const a0 = A.load().profile;
    const bSaved = edit(B.load().profile, { practiceName: "Renamed In B" });
    B.write(bSaved);
    const mine = edit(a0, { customKnowledge: [item("Item from A")] });
    expect(A.write(mine).kind).toBe("conflict");
    expect(A.write(mine, { force: true }).kind).toBe("saved");
    const change = B.receive(b.stored(), bSaved, true);
    expect(change.kind).toBe("adopt");
  });

  it("two tabs writing the same version (one account copy loaded twice) do not conflict", () => {
    const b = browser();
    b.tab().write(ownBusiness());
    const A = b.tab();
    const B = b.tab();
    A.load();
    B.load();
    const accountCopy = edit(ownBusiness(), { practiceName: "From the account" });
    expect(A.write(accountCopy).kind).toBe("saved");
    expect(B.write({ ...accountCopy }).kind).toBe("saved");
    expect(A.receive(b.stored(), accountCopy, true).kind).toBe("ignore");
  });
});

/** The account's copy of one business, refusing a save built on an older revision as the server does. */
function account(first: PracticeProfile) {
  let held = { profile: first, revision: 1 };
  return {
    load: () => ({ ...held }),
    save(profile: PracticeProfile, base: number | null) {
      if (isStaleSave(held.revision, base)) return { ok: false as const, ...held };
      held = { profile, revision: held.revision + 1 };
      return { ok: true as const, revision: held.revision };
    },
    held: () => held.profile,
  };
}

/** One signed-in tab's account save, as the provider makes it: once more on top of a version it builds on. */
function saveToAccount(
  acct: ReturnType<typeof account>,
  tab: { lineage: AccountLineage; revision: number | null },
  profile: PracticeProfile,
): "saved" | "conflict" {
  const id = profile.businessId ?? "biz_default";
  let result = acct.save(profile, tab.revision);
  if (!result.ok && tab.lineage.buildsOn(id, result.profile.updatedAt)) {
    tab.revision = result.revision;
    result = acct.save(profile, tab.revision);
  }
  if (!result.ok) return "conflict";
  tab.revision = result.revision;
  tab.lineage.add(id, profile.updatedAt);
  return "saved";
}

describe("two signed-in tabs of one browser on the same business", () => {
  function signedInTabs() {
    const b = browser();
    const start = edit(ownBusiness(), {});
    b.tab().write(start);
    const acct = account(start);
    const open = () => {
      const local = b.tab();
      const { profile } = local.load();
      const lineage = new AccountLineage();
      lineage.start("biz_two_tab", profile.updatedAt);
      return {
        local,
        profile,
        cloud: { lineage, revision: acct.load().revision as number | null },
      };
    };
    return { b, acct, A: open(), B: open() };
  }

  it("a tab that took the other tab's save can save its own edit without a false 'changed on another device' warning", () => {
    const { b, acct, A, B } = signedInTabs();
    // Tab A adds an item; it lands in this browser, then in the account.
    const aSaved = edit(A.profile, { customKnowledge: [item("Item from tab A")] });
    A.local.write(aSaved);
    // Tab B has nothing unsaved and takes it, as the provider does.
    const change = B.local.receive(b.stored(), B.profile, true);
    expect(change.kind).toBe("adopt");
    if (change.kind !== "adopt") return;
    B.local.accept(change.rev, change.profile.updatedAt);
    B.cloud.lineage.add("biz_two_tab", change.profile.updatedAt);
    expect(saveToAccount(acct, A.cloud, aSaved)).toBe("saved");

    // B edits on top of A's item. B's account revision is behind, yet the
    // account holds exactly the version B took: no warning, both items kept.
    const bNext = edit(change.profile, {
      customKnowledge: [...(change.profile.customKnowledge ?? []), item("Item from tab B")],
    });
    expect(B.local.write(bNext).kind).toBe("saved");
    expect(saveToAccount(acct, B.cloud, bNext)).toBe("saved");
    expect(names(acct.held())).toEqual(["Item from tab A", "Item from tab B"]);
  });

  it("a tab that never heard of the other tab's account save still gets the warning, and overwrites nothing", () => {
    const { acct, A, B } = signedInTabs();
    const aSaved = edit(A.profile, { customKnowledge: [item("Item from tab A")] });
    expect(saveToAccount(acct, A.cloud, aSaved)).toBe("saved");
    // B was asleep: it never took A's version and edits its old copy.
    const staleB = edit(B.profile, { customKnowledge: [item("Item from stale tab B")] });
    expect(saveToAccount(acct, B.cloud, staleB)).toBe("conflict");
    expect(names(acct.held())).toEqual(["Item from tab A"]);
  });

  it("a version the tab held before it opened another copy no longer counts", () => {
    const lineage = new AccountLineage();
    lineage.start("biz_two_tab", "2026-09-23T10:00:00.000Z");
    lineage.add("biz_two_tab", "2026-09-23T10:05:00.000Z");
    expect(lineage.buildsOn("biz_two_tab", "2026-09-23T10:05:00.000Z")).toBe(true);
    // A switch or a reload opens the account's copy as a whole new starting point.
    lineage.start("biz_two_tab", "2026-09-23T11:00:00.000Z");
    expect(lineage.buildsOn("biz_two_tab", "2026-09-23T10:05:00.000Z")).toBe(false);
    expect(lineage.buildsOn("biz_other", "2026-09-23T11:00:00.000Z")).toBe(false);
    expect(lineage.buildsOn("biz_two_tab", undefined)).toBe(false);
  });
});

describe("two tabs on different businesses", () => {
  it("never conflict: the open-business key only says what a reload opens", () => {
    const b = browser();
    const A = b.tab();
    const B = b.tab();
    const first = { ...ownBusiness(), businessId: "biz_first" };
    const second = { ...ownBusiness(), businessId: "biz_second" };
    expect(A.write(first).kind).toBe("saved");
    expect(B.write(second).kind).toBe("saved");
    expect(A.receive(b.stored(), first, true).kind).toBe("ignore");
    expect(A.write(edit(first, { practiceName: "First, renamed" })).kind).toBe("saved");
    expect(B.receive(b.stored(), second, true).kind).toBe("ignore");
  });
});

describe("storage the browser refuses", () => {
  it("reports the write as failed instead of throwing", () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("blocked", "QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    const tab = new LocalProfileStore(() => blocked);
    expect(tab.load().stored).toBe(false);
    expect(tab.write(ownBusiness()).kind).toBe("failed");
    expect(new LocalProfileStore(() => null).write(ownBusiness()).kind).toBe("failed");
  });
});

describe("a copy saved by an older version of the app", () => {
  it("loads, and the next write stamps it with a revision", () => {
    const b = browser();
    b.storage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(ownBusiness()));
    const A = b.tab();
    const { profile, stored } = A.load();
    expect(stored).toBe(true);
    expect(profile.practiceName).toBe("Two Tab Co");
    expect(A.write(edit(profile, { practiceName: "Renamed" })).kind).toBe("saved");
    expect(storedRevision(b.stored()).rev).toBe("r1");
    expect(A.load().profile.practiceName).toBe("Renamed");
  });
});
