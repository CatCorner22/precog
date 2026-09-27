import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { parseRoster } from "../import/roster";
import { applyPaste, rowsForJobTitle } from "./add-people";
import { jobCatalogEntry } from "./job-catalog";
import { firstRowForIndustry, ownerRow, type OwnTeamRow } from "./own-team";

const today = new Date("2026-09-22T00:00:00Z");
const read = (text: string, industry: "general" | "nonprofit" = "general") =>
  parseRoster(text, getBaseTemplate(industry), { today });

describe("applyPaste", () => {
  it("adds the pasted people under the Owner row and says what it read", () => {
    const grid: OwnTeamRow[] = [ownerRow()];
    const applied = applyPaste(
      grid,
      read("Ana Ruiz, Bookkeeper\nBen Cole, Chief Vibes Officer"),
      "general",
    );
    expect(applied.rows?.map((r) => r.name)).toEqual(["", "Ana Ruiz", "Ben Cole"]);
    expect(applied.note).toBe(
      "Added 2 people. Found 1 title in the catalog and ticked their duties; 1 title is not in the catalog: tick those duties below. The Owner row stays at the top with its duties ticked: type your name in it. Check every row: a title is a starting point, not a fact about your business.",
    );
    expect(applied.keepPaste).toBe(false);
  });

  it("replaces a nonprofit's blank Executive Director row with a pasted President & CEO", () => {
    const grid = firstRowForIndustry([ownerRow()], "nonprofit");
    const applied = applyPaste(
      grid,
      read("Maria Lopez, President & CEO\nJon Ruiz, Bookkeeper", "nonprofit"),
      "nonprofit",
    );
    expect(applied.rows?.map((r) => r.name)).toEqual(["Maria Lopez", "Jon Ruiz"]);
    expect(applied.note).toContain(
      "The executive director in your paste takes the place of the empty Executive Director row.",
    );
  });

  it("leaves out people marked inactive and lists each leaver once, accents or not", () => {
    const applied = applyPaste(
      [ownerRow()],
      read("Name,Title,Status\nJosé Pérez,Cashier,Terminated\nCy Dunn,Bookkeeper,Active"),
      "general",
      [{ name: "Jose Perez", role: "Cashier" }],
    );
    expect(applied.rows?.map((r) => r.name)).toEqual(["", "Cy Dunn"]);
    expect(applied.leftOut).toEqual([{ name: "Jose Perez", role: "Cashier" }]);
    expect(applied.note).toContain("Left out 1 person the roster marks inactive: José Pérez.");
  });

  it("keeps the grid and the paste when everyone pasted is inactive", () => {
    const grid: OwnTeamRow[] = [ownerRow()];
    const applied = applyPaste(
      grid,
      read("Name,Title,Status\nBo Chen,Cashier,Terminated\nAl Wu,Cook,Terminated"),
      "general",
    );
    expect(applied.rows).toBeNull();
    expect(applied.keepPaste).toBe(true);
    expect(applied.note).toBe(
      "The paste marks all 2 people inactive, so the table adds none of them: Bo Chen and Al Wu.",
    );
    expect(applied.leftOut.map((who) => who.name)).toEqual(["Bo Chen", "Al Wu"]);
  });
});

describe("placeholder names for people added by job title", () => {
  it("names people after the job, not the first word of a compound title", () => {
    const first = (id: string) => rowsForJobTitle(jobCatalogEntry(id)!, 1, [], "general")[0].name;
    expect(first("general-manager")).toBe("General Manager 1");
    expect(first("provider")).toBe("Provider 1");
    expect(first("chef")).toBe("Chef 1");
    expect(first("transport-driver")).toBe("Bus Driver 1");
    expect(first("server")).toBe("Server 1");
  });
});
