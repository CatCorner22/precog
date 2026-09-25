import { describe, expect, it } from "vitest";
import type { StorageLike } from "../local-data";
import { ownerRow, type OwnTeamRow } from "./own-team";
import {
  SETUP_DRAFT_KEY,
  draftHasTypedWork,
  initialSetup,
  namedPeople,
  readSetupDraft,
  writeSetupDraft,
  type SetupDraft,
} from "./setup-draft";

function tabStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const freshRows = (): OwnTeamRow[] => [
  ownerRow(),
  { name: "", role: "", duties: [] },
  { name: "", role: "", duties: [] },
];

/** A reload: the draft goes through session storage and comes back for the same business. */
function reload(draft: SetupDraft, typedName = "") {
  const storage = tabStorage();
  writeSetupDraft(draft, storage);
  return initialSetup(
    readSetupDraft(storage),
    { businessId: draft.businessId ?? "biz_x", industry: "dental", typedName },
    freshRows,
  );
}

describe("reloading in the middle of setup", () => {
  const base: SetupDraft = {
    step: "industry",
    selected: "dental",
    businessName: "",
    rows: freshRows(),
    paste: "",
    businessId: "biz_x",
  };

  it("keeps the line of business picked before anything was typed", () => {
    const back = reload({ ...base, selected: "retail" });
    expect(back.draft.selected).toBe("retail");
    expect(back.draft.step).toBe("industry");
    expect(back.restoredEarlier).toBe(false);
  });

  it("keeps a business name typed before any person's name", () => {
    const back = reload({
      ...base,
      step: "team",
      selected: "retail",
      businessName: "Reload Test Shop",
    });
    expect(back.draft).toMatchObject({
      step: "team",
      selected: "retail",
      businessName: "Reload Test Shop",
    });
  });

  it("keeps a roster pasted into the box but not yet used to fill the table", () => {
    const pasted = "Ana Ruiz, Office Manager\nBen Ochoa, Bookkeeper\nCal Diaz, Cashier";
    const back = reload({ ...base, step: "team", paste: pasted });
    expect(back.draft.paste).toBe(pasted);
  });

  it("reads a draft saved by an older version, which had no paste text or business id", () => {
    const storage = tabStorage();
    storage.setItem(
      SETUP_DRAFT_KEY,
      JSON.stringify({
        step: "team",
        selected: "general",
        businessName: "Old Co",
        rows: [{ name: "Olga Owner", role: "Owner", duties: [] }],
      }),
    );
    const back = initialSetup(
      readSetupDraft(storage),
      { businessId: "biz_new", industry: "dental", typedName: "" },
      freshRows,
    );
    expect(back.draft.businessName).toBe("Old Co");
    expect(back.draft.paste).toBe("");
    expect(namedPeople(back.draft)).toBe(1);
  });
});

describe("going back and loading the sample after typing a team", () => {
  const typed: SetupDraft = {
    step: "team",
    selected: "general",
    businessName: "Careful Co",
    rows: [
      { name: "Olga Owner", role: "Owner", duties: [] },
      { name: "Ana Ruiz", role: "Office Manager", duties: [] },
    ],
    paste: "",
    businessId: "biz_first_visit",
  };

  it("counts the typed team as work worth confirming", () => {
    expect(draftHasTypedWork(typed)).toBe(true);
    expect(namedPeople(typed)).toBe(2);
    expect(draftHasTypedWork({ businessName: " ", rows: freshRows(), paste: "" })).toBe(false);
  });

  it("brings the typed team back when the owner later sets up their own business", () => {
    const later = initialSetup(
      typed,
      { businessId: "biz_later", industry: "general", typedName: "" },
      freshRows,
    );
    expect(later.restoredEarlier).toBe(true);
    expect(later.draft.businessName).toBe("Careful Co");
    expect(later.draft.rows.map((r) => r.name)).toEqual(["Olga Owner", "Ana Ruiz"]);
    expect(later.draft.businessId).toBe("biz_later");
  });

  it("uses the name and line of business given in the business menu", () => {
    const later = initialSetup(
      typed,
      { businessId: "biz_later", industry: "retail", typedName: "Second Shop" },
      freshRows,
    );
    expect(later.draft).toMatchObject({ businessName: "Second Shop", selected: "retail" });
    expect(later.restoredEarlier).toBe(true);
  });

  it("does not bring back an untouched grid", () => {
    const later = initialSetup(
      { ...typed, businessName: "", rows: freshRows() },
      { businessId: "biz_later", industry: "retail", typedName: "Second Shop" },
      freshRows,
    );
    expect(later.restoredEarlier).toBe(false);
    expect(later.draft).toMatchObject({
      step: "team",
      selected: "retail",
      businessName: "Second Shop",
    });
  });
});

describe("a tab whose session storage is blocked", () => {
  it("keeps the draft in memory without throwing", () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      removeItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(readSetupDraft(blocked)).toBeNull();
    expect(() =>
      writeSetupDraft(
        { step: "team", selected: "dental", businessName: "", rows: [], paste: "" },
        blocked,
      ),
    ).not.toThrow();
    expect(() => writeSetupDraft(null, blocked)).not.toThrow();
  });
});

describe("honest draft save status", () => {
  it("reports successful save and removal", () => {
    const storage = tabStorage();
    expect(
      writeSetupDraft(
        { step: "team", selected: "dental", businessName: "Test", rows: freshRows(), paste: "" },
        storage,
      ),
    ).toBe(true);
    expect(writeSetupDraft(null, storage)).toBe(true);
  });
  it("reports unavailable or full session storage", () => {
    expect(writeSetupDraft(null, null)).toBe(false);
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(
      writeSetupDraft(
        { step: "team", selected: "dental", businessName: "Test", rows: [], paste: "" },
        storage,
      ),
    ).toBe(false);
  });
});
