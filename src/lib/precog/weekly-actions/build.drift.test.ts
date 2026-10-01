import { describe, expect, it } from "vitest";
import { buildDriftActions } from "../integrations/drift-signals";

describe("weekly plan drift actions", () => {
  it("builds drift actions from a profile summary", () => {
    const drift = buildDriftActions({
      summary: {
        updatedAt: "2026-10-01T00:00:00.000Z",
        source: "quickbooks",
        headline: "2 employee(s) in the books but not on your map",
        qboEmployeesNotOnMap: 2,
        qboPeopleNotInBooks: 0,
        qboVendorsAdded: 0,
        accessPending: 0,
      },
      accessReconciliation: null,
    });
    expect(drift.some((d) => d.id === "drift-qbo-employees")).toBe(true);
  });
});
