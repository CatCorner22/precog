import { describe, expect, it } from "vitest";
import { previewSetup } from "./setup-preview";
import type { OwnTeamRow } from "./own-team";

const owner = (): OwnTeamRow => ({ name: "Ada", role: "Owner", duties: ["approve_invoices"] });

describe("setup preview", () => {
  it("says nothing while no duties are ticked", () => {
    const preview = previewSetup([{ name: "Bea", role: "Bookkeeper", duties: [] }], "general");
    expect(preview.peopleWithDuties).toBe(0);
    expect(preview.first).toBeNull();
  });

  it("names the first conflict and a case as soon as one person holds a conflicting pair", () => {
    const preview = previewSetup(
      [
        owner(),
        {
          name: "Bea",
          role: "Bookkeeper",
          duties: ["create_vendor", "approve_invoices", "release_payment", "bank_reconcile"],
        },
      ],
      "general",
    );
    expect(preview.peopleWithDuties).toBe(2);
    expect(preview.conflictCount).toBeGreaterThan(0);
    expect(preview.first?.conflict.personName).toBe("Bea");
    expect(preview.first?.conflict.ownerHeld).toBe(false);
    expect(preview.first?.study).not.toBeNull();
    expect(preview.first?.lossPhrase).toMatch(/^\$|^more than \$/);
  });

  it("ranks an employee's conflict above the owner's", () => {
    const preview = previewSetup(
      [
        {
          name: "Ada",
          role: "Owner",
          duties: ["create_vendor", "release_payment", "bank_reconcile"],
        },
        {
          name: "Bea",
          role: "Bookkeeper",
          duties: ["create_vendor", "release_payment", "bank_reconcile"],
        },
      ],
      "general",
    );
    expect(preview.first?.conflict.personName).toBe("Bea");
  });
});
