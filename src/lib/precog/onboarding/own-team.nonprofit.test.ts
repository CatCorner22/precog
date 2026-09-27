import { describe, expect, it } from "vitest";
import { jobCatalogEntry } from "./job-catalog";
import {
  buildOwnTeam,
  firstRowForIndustry,
  leaderRow,
  ownerRow,
  pasteSummary,
  rowFromImportedPerson,
  rowsForJobTitle,
  rowsKeptForAdding,
  type OwnTeamRow,
} from "./own-team";
import { initialSetup } from "./setup-draft";

describe("the setup grid's first row in a nonprofit", () => {
  const fresh = (): OwnTeamRow[] => [
    { ...ownerRow(), rowId: "r1" },
    { name: "", role: "", duties: [] },
  ];

  it("starts with the executive director, who owns nothing", () => {
    const rows = firstRowForIndustry(fresh(), "nonprofit");
    expect(rows[0]).toMatchObject({ role: "Executive Director", owner: false, rowId: "r1" });
    expect(rows[0].duties).toEqual(expect.arrayContaining(["approve_payroll", "sign_checks"]));
    // Switching back to a business with an owner restores the Owner row.
    expect(firstRowForIndustry(rows, "retail")[0]).toMatchObject({ role: "Owner", owner: true });
    expect(leaderRow("dental")).toEqual(ownerRow());
  });

  it("leaves a first row the owner has named or changed alone", () => {
    const named = [{ ...ownerRow(), name: "Ana" }];
    expect(firstRowForIndustry(named, "nonprofit")).toBe(named);
    const retitled = [{ ...ownerRow(), role: "Founder" }];
    expect(firstRowForIndustry(retitled, "nonprofit")).toBe(retitled);
  });

  it("starts a fresh nonprofit setup with the executive director row", () => {
    const start = initialSetup(
      null,
      { businessId: "b1", industry: "nonprofit", typedName: "Riverside Food Bank" },
      fresh,
    );
    expect(start.draft.rows[0].role).toBe("Executive Director");
  });

  it("lets a pasted executive director take the place of the empty row", () => {
    const rows = firstRowForIndustry(fresh(), "nonprofit");
    const kept = rowsKeptForAdding(rows, false, false);
    expect(kept.ownerRow).toBe("leader-kept");
    expect(kept.kept.map((r) => r.role)).toEqual(["Executive Director"]);
    const replaced = rowsKeptForAdding(rows, false, true);
    expect(replaced.ownerRow).toBe("leader-replaced");
    expect(replaced.kept).toEqual([]);
    const note = pasteSummary({
      added: 1,
      matched: 0,
      notAdded: 0,
      dropped: 0,
      recognised: 1,
      partial: 0,
      unmatched: 0,
      inactiveNames: [],
      ownerRow: "leader-replaced",
      onLeaveNames: [],
    }).note;
    expect(note).toContain("takes the place of the empty Executive Director row");
    expect(note).not.toContain("Owner row");
  });

  it("marks nobody as owner, whatever the title says", () => {
    const person = { id: "x", name: "Ana", role: "President & CEO", active: true };
    expect(rowFromImportedPerson(person, "nonprofit").owner).toBe(false);
    expect(rowFromImportedPerson(person, "general")).not.toHaveProperty("owner");
    const board = rowsForJobTitle(jobCatalogEntry("executive-director")!, 1, 0, "nonprofit");
    expect(board[0].owner).toBe(false);
    const team = buildOwnTeam(
      [{ name: "Ana", role: "CEO", duties: ["approve_payroll"], owner: true }],
      "nonprofit",
    );
    expect(team[0].owner).toBe(false);
    expect(
      buildOwnTeam([{ name: "Ana", role: "CEO", duties: ["approve_payroll"] }], "general")[0].owner,
    ).toBe(true);
  });
});
