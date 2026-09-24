import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "./active-template";
import { parsePeopleCsv } from "./import/people-csv";
import { defaultProfile } from "./practice-profile";
import {
  businessLocations,
  locationsById,
  locationText,
  personLocations,
  worksAt,
} from "./person-location";
import { detectSodConflicts, sodDetectionOptions } from "./sod/detect";
import type { Person } from "./types";

const TWO_STORES = [
  "Name,Job Title,Location",
  "Olga Owner,Owner,Oakridge Mall",
  "Jordan Lee,Keyholder,Oakridge Mall",
  "Jordan Lee,Keyholder,Riverside",
  "Sam Cruz,Store Manager,Oakridge Mall",
  "Pat Kim,Cashier,Riverside",
  "Alex Day,Bookkeeper,Oakridge Mall",
  "Rene Diaz,Assistant Manager,Oakridge Mall",
  "Rene Diaz,Assistant Manager,Riverside",
].join("\n");

function twoStoreShop() {
  const { people } = parsePeopleCsv(TWO_STORES, getBaseTemplate("retail"));
  const profile = defaultProfile("retail");
  const tpl = resolveTemplate({ ...profile, customPeople: people });
  return { people, tpl, profile };
}

describe("a keyholder listed at two stores of a retail business", () => {
  it("is kept as one person who works at both stores", () => {
    const { people } = twoStoreShop();
    const jordan = people.filter((p) => p.name === "Jordan Lee");
    expect(jordan).toHaveLength(1);
    expect(personLocations(jordan[0])).toEqual(["Oakridge Mall", "Riverside"]);
    expect(locationText(personLocations(jordan[0]))).toBe("Oakridge Mall and Riverside");
    expect(businessLocations(people)).toEqual(["Oakridge Mall", "Riverside"]);
  });

  it("is named with both stores, and counts at each store, in the duty-conflict findings", () => {
    const { people, tpl, profile } = twoStoreShop();
    const report = detectSodConflicts(
      tpl,
      profile.staff,
      sodDetectionOptions(tpl, profile.dualRelease),
    );
    const placesOf = locationsById(people);
    const rene = people.find((p) => p.name === "Rene Diaz") as Person;
    const reneFindings = report.conflicts.filter((c) => c.personId === rene.id);
    expect(reneFindings.length).toBeGreaterThan(0);
    expect(placesOf.get(rene.id)).toEqual(["Oakridge Mall", "Riverside"]);
    // Filtering by store shows the same finding under each store, once.
    const at = (place: string) =>
      report.conflicts.filter((c) => worksAt(placesOf.get(c.personId), place));
    for (const place of ["Oakridge Mall", "Riverside"]) {
      expect(at(place).filter((c) => c.personId === rene.id)).toHaveLength(reneFindings.length);
    }
    // Someone at one store only is not listed under the other.
    const alex = people.find((p) => p.name === "Alex Day") as Person;
    expect(at("Riverside").some((c) => c.personId === alex.id)).toBe(false);
  });
});

describe("a business with one location, or none on record", () => {
  it("never shows a location in findings", () => {
    const oneStore: Person[] = [
      { id: "a", name: "Ana", role: "Cashier", active: true, department: "Main St" },
      { id: "b", name: "Ben", role: "Bookkeeper", active: true, department: "Main St" },
    ];
    expect(locationsById(oneStore).size).toBe(0);
    expect(locationsById([{ id: "c", name: "Cy", role: "Owner", active: true }]).size).toBe(0);
  });

  it("ignores places only people who left worked at", () => {
    const people: Person[] = [
      { id: "a", name: "Ana", role: "Cashier", active: true, department: "Main St" },
      { id: "b", name: "Ben", role: "Cashier", active: false, department: "Old Store" },
    ];
    expect(businessLocations(people)).toEqual(["Main St"]);
  });

  it("lists a place once however the roster spells it, and matches a person with none only to 'no location given'", () => {
    expect(personLocations({ department: "Riverside; riverside ;Oakridge Mall;" })).toEqual([
      "Riverside",
      "Oakridge Mall",
    ]);
    expect(worksAt(undefined, null)).toBe(true);
    expect(worksAt(["Riverside"], null)).toBe(false);
    expect(worksAt(["Riverside"], "riverside")).toBe(true);
  });
});
