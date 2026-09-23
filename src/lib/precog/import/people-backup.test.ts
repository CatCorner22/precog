import { describe, expect, it } from "vitest";
import { peopleFromBackup } from "./people-backup";

describe("peopleFromBackup", () => {
  it("restores department, last day and employee id from the map builder's JSON backup", () => {
    const backup = JSON.parse(
      JSON.stringify({
        version: 3,
        people: [
          {
            id: "own-11",
            name: "Li Wu",
            role: "Front Desk",
            active: true,
            tenureYears: 2.5,
            lastDay: "2026-11-30",
            department: "Front Desk",
            employeeId: "10011",
            entitlements: ["collect_cash", "post_payments"],
          },
          { id: "own-12", name: "Flo Ng", role: "Payroll Administrator", active: false },
        ],
      }),
    );
    expect(peopleFromBackup(backup.people)).toEqual(backup.people);
  });

  it("drops malformed fields and people without an id or name, and keeps the first of a repeated id", () => {
    const people = peopleFromBackup([
      {
        id: "p1",
        name: "‮Ana Ruiz",
        role: 7,
        active: "yes",
        tenureYears: -3,
        lastDay: "next month",
        department: "",
        entitlements: ["collect_cash", "fly_the_plane", 4],
      },
      { id: "p1", name: "Second copy" },
      { name: "No id" },
      { id: "p2" },
      null,
      "text",
    ]);
    expect(people).toEqual([
      {
        id: "p1",
        name: "Ana Ruiz",
        role: "Team member",
        active: true,
        tenureYears: 0,
        entitlements: ["collect_cash"],
      },
    ]);
    expect(peopleFromBackup(undefined)).toEqual([]);
  });
});
