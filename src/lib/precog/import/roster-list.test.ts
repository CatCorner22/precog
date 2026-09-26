import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import type { IndustryTemplate } from "../templates/types";
import type { Person } from "../types";
import { mergeImportedPeople } from "./people-csv";
import { parseRoster } from "./roster";

const today = new Date("2026-09-22T00:00:00Z");

const ana: Person = {
  id: "p-ana",
  name: "Ana Ruiz",
  role: "Bookkeeper",
  active: true,
  tenureYears: 4,
  department: "Finance",
  entitlements: ["bank_reconcile", "post_payments"],
};
const ben: Person = { id: "p-ben", name: "Ben Cole", role: "Cashier", active: true };

function teamOf(people: Person[]): IndustryTemplate {
  return { ...getBaseTemplate("general"), people };
}

describe("parseRoster over an existing team", () => {
  it("keeps the role and duties of a person a bare-name list names", () => {
    const tpl = teamOf([ana, ben]);
    const result = parseRoster("Ana Ruiz\nBen Cole\nCal Diaz", tpl, { today });
    const readAna = result.people.find((p) => p.name === "Ana Ruiz");
    expect(readAna).toMatchObject({ role: "Bookkeeper", department: "Finance" });
    expect(readAna?.entitlements).toEqual(["bank_reconcile", "post_payments"]);
    expect(result.people.find((p) => p.name === "Cal Diaz")?.role).toBe("Team member");
    const merged = mergeImportedPeople(tpl.people, result.people);
    expect(merged.updated.map((p) => p.name)).toEqual([]);
    expect(merged.added.map((p) => p.name)).toEqual(["Cal Diaz"]);
  });

  it("keeps the role of a title-less line in a list where other lines carry titles", () => {
    const result = parseRoster("Ana Ruiz\nCal Diaz, Cook", teamOf([ana]), { today });
    expect(result.people.find((p) => p.name === "Ana Ruiz")?.role).toBe("Bookkeeper");
    expect(result.people.find((p) => p.name === "Cal Diaz")?.role).toBe("Cook");
  });
});
