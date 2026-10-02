import { describe, expect, it } from "vitest";
import { defaultProfile, type PracticeProfile } from "./practice-profile";
import { earlyWarning, NO_EARLY_WARNING_SOURCES } from "./early-warning";
import type { Person } from "./types";

const TODAY = "2026-09-25";

function ownTeam(): PracticeProfile {
  const people: Person[] = [
    { id: "p1", name: "Ada Owner", role: "Owner", active: true, owner: true, entitlements: [] },
    { id: "p2", name: "Bea Books", role: "Bookkeeper", active: true, entitlements: [] },
  ];
  return {
    ...defaultProfile("general"),
    practiceName: "Riverside Plumbing",
    customPeople: people,
    leaverAccessChecks: [
      { id: "l1", name: "Cy Gone", industry: "general", notedOn: "2026-09-10", source: "marked" },
    ],
  };
}

describe("early warning", () => {
  it("is empty, with no source, when no record is connected", () => {
    const report = earlyWarning(defaultProfile("dental"), TODAY);
    expect(report).toEqual({ items: [], sources: [] });
    expect(NO_EARLY_WARNING_SOURCES).toBe("No early-warning sources connected");
  });

  it("lists each drift item from the books and the access export, with the reading's date", () => {
    const report = earlyWarning(
      {
        ...defaultProfile("dental"),
        integrationDriftSummary: {
          updatedAt: "2026-09-20T08:00:00.000Z",
          source: "quickbooks",
          headline: "",
          qboEmployeesNotOnMap: 2,
          qboPeopleNotInBooks: 0,
          qboVendorsAdded: 3,
          accessPending: 0,
        },
      },
      TODAY,
    );
    expect(report.sources).toEqual(["Accounting system reading"]);
    expect(report.items.map((i) => i.id)).toEqual(["drift-qbo-employees", "drift-qbo-vendors"]);
    expect(report.items[0].detail).toContain("2 people appear in QuickBooks");
    expect(report.items[1].detail).toContain("3 vendor(s)");
    for (const item of report.items) {
      expect(item).toMatchObject({ on: "2026-09-20", kind: "reading", overdue: false });
    }
  });

  it("dates the access line from the import and the books lines from the reading", () => {
    const report = earlyWarning(
      {
        ...defaultProfile("dental"),
        integrationDriftSummary: {
          updatedAt: "2026-09-20T08:00:00.000Z",
          source: "quickbooks",
          headline: "",
          qboEmployeesNotOnMap: 2,
          qboPeopleNotInBooks: 0,
          qboVendorsAdded: 0,
          accessPending: 0,
        },
        accessReconciliation: {
          importedAt: "2026-09-12T15:00:00.000Z",
          source: "quickbooks",
          users: [
            {
              id: "u1",
              name: "Pat Unmapped",
              email: "",
              role: "Clerk",
              mapped: [],
              unmatchedTokens: ["clerk"],
              extra: [],
              missingFromBooks: [],
              status: "pending",
            },
          ],
          vendors: [],
        },
      },
      TODAY,
    );
    expect(report.sources).toEqual(["Accounting system reading", "User access export"]);
    expect(report.items.map((i) => [i.id, i.on])).toEqual([
      ["drift-qbo-employees", "2026-09-20"],
      ["drift-access-import", "2026-09-12"],
    ]);
  });

  it("reads an own team's records: an unconfirmed leaver and the monthly review, overdue first", () => {
    const report = earlyWarning(ownTeam(), TODAY);
    expect(report.sources).toEqual(["Review dates, checks and procedures recorded in Precog"]);
    const ids = report.items.map((i) => i.id);
    expect(ids).toContain("leaver:l1");
    expect(ids).toContain("monthly:2026-09");
    const firstNotOverdue = report.items.findIndex((i) => !i.overdue);
    if (firstNotOverdue >= 0) {
      expect(report.items.slice(firstNotOverdue).every((i) => !i.overdue)).toBe(true);
    }
    expect(report.items.find((i) => i.id === "leaver:l1")).toMatchObject({
      kind: "due",
      on: "2026-09-10",
      overdue: true,
    });
  });

  it("carries no composite number", () => {
    const report = earlyWarning(ownTeam(), TODAY);
    expect(Object.keys(report).sort()).toEqual(["items", "sources"]);
    for (const item of report.items) {
      expect(Object.keys(item).sort()).toEqual(["detail", "id", "kind", "on", "overdue", "title"]);
    }
  });
});
