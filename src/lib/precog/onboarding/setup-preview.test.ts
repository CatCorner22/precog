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
    expect(preview.first?.lossPhrase).toMatch(/^\$|^at least \$/);
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

describe("the preview's count of findings", () => {
  it("counts the employees' conflicts only, not the owner's own pairs", () => {
    const duties: OwnTeamRow["duties"] = ["create_vendor", "release_payment", "bank_reconcile"];
    const both = previewSetup(
      [
        { name: "Ada", role: "Owner", duties },
        { name: "Bea", role: "Bookkeeper", duties },
      ],
      "general",
    );
    const staffOnly = previewSetup(
      [
        { name: "Ada", role: "Owner", duties: ["approve_invoices"] },
        { name: "Bea", role: "Bookkeeper", duties },
      ],
      "general",
    );
    expect(both.first?.conflict.personName).toBe("Bea");
    expect(both.conflictCount).toBe(staffOnly.conflictCount);
  });

  it("counts the owner's pairs when only the owner holds any", () => {
    const preview = previewSetup(
      [
        {
          name: "Ada",
          role: "Owner",
          duties: ["create_vendor", "release_payment", "bank_reconcile"],
        },
      ],
      "general",
    );
    expect(preview.first?.conflict.ownerHeld).toBe(true);
    expect(preview.conflictCount).toBeGreaterThan(0);
  });

  it("phrases a floor loss as 'at least', as every other surface does", () => {
    const preview = previewSetup(
      [
        {
          name: "Bea",
          role: "Office Manager",
          duties: ["post_payments", "bank_reconcile", "prepare_deposit", "collect_cash"],
        },
      ],
      "dental",
    );
    expect(preview.first?.lossPhrase ?? "").not.toMatch(/more than/);
  });
});

describe("the preview's case", () => {
  it("shows only a case that cites the finding's rule, never a related one", () => {
    // No record cites rule-access-export; a related scheme exists and stays out.
    const preview = previewSetup(
      [{ name: "Bea", role: "IT lead", duties: ["manage_user_access", "export_bulk_data"] }],
      "dental",
    );
    expect(preview.first?.conflict.ruleId).toBe("rule-access-export");
    expect(preview.first?.study).toBeNull();
    expect(preview.first?.lossPhrase).toBeNull();
    expect(preview.first?.durationPhrase).toBeNull();
  });
});
