import { describe, expect, it } from "vitest";
import { buildDriftActions } from "./drift-signals";
import { summarizeQboDrift } from "./drift-summary";

describe("drift signals", () => {
  it("surfaces QuickBooks employee drift", () => {
    const summary = summarizeQboDrift({
      since: null,
      vendorsAdded: [],
      vendorsRemoved: [],
      vendorsChanged: [],
      employeesAdded: [],
      employeesReleased: [],
      employeesNotOnMap: [{ id: "1", name: "Pat", active: true, releasedOn: null }],
      peopleNotInBooks: [],
    });
    const actions = buildDriftActions({ summary, accessReconciliation: null });
    expect(actions.some((a) => a.id === "drift-qbo-employees")).toBe(true);
  });
});
