import { describe, expect, it } from "vitest";
import { buildDriftActions, sodScopeLine } from "./drift-signals";
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
      leftButStillPaid: [],
    });
    const actions = buildDriftActions({ summary, accessReconciliation: null });
    expect(actions.some((a) => a.id === "drift-qbo-employees")).toBe(true);
  });
});

describe("sodScopeLine", () => {
  const base = {
    // Midday UTC, so the printed day is the same in every test time zone.
    updatedAt: "2026-10-01T12:00:00.000Z",
    source: "both" as const,
    headline: "",
    qboEmployeesNotOnMap: 0,
    qboPeopleNotInBooks: 0,
    qboVendorsAdded: 0,
    accessPending: 0,
  };

  it("says how many people in the books the duty map lacks, as of the reading", () => {
    expect(sodScopeLine({ ...base, qboEmployeesNotOnMap: 3 })).toBe(
      "At the reading on Oct 1, 2026, your books showed 3 people the duty map does not list; their duties are not assessed.",
    );
    expect(sodScopeLine({ ...base, qboEmployeesNotOnMap: 1 })).toBe(
      "At the reading on Oct 1, 2026, your books showed 1 person the duty map does not list; that person's duties are not assessed.",
    );
  });

  it("leaves pending access-import rows out, since they include supplier rows", () => {
    expect(sodScopeLine({ ...base, source: "access", accessPending: 10 })).toBeNull();
    expect(sodScopeLine({ ...base, qboEmployeesNotOnMap: 2, accessPending: 10 })).not.toMatch(
      /sign-in|access|row/,
    );
  });

  it("says nothing without a drift reading that shows anyone missing", () => {
    expect(sodScopeLine(null)).toBeNull();
    expect(sodScopeLine(undefined)).toBeNull();
    expect(sodScopeLine({ ...base, qboPeopleNotInBooks: 2, qboVendorsAdded: 1 })).toBeNull();
  });
});
