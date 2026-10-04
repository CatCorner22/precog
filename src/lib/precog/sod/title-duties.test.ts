import { describe, expect, it } from "vitest";
import { jobCatalogEntry } from "../onboarding/job-catalog";
import { buildOwnTeam, ownerRow } from "../onboarding/own-team";
import { rowsForJobTitle } from "../onboarding/add-people";
import {
  confirmTitleDuties,
  confirmTitleDutiesFor,
  peopleWithTitleDuties,
  titleDutiesSentence,
} from "./title-duties";

describe("findings that rest on duties guessed from job titles", () => {
  it("marks people whose ticks are still the usual ones for their title, and nobody the owner changed", () => {
    const bookkeeper = rowsForJobTitle(jobCatalogEntry("bookkeeper")!, 1, [], "dental")[0];
    const cashier = rowsForJobTitle(jobCatalogEntry("cashier")!, 1, [], "dental")[0];
    const people = buildOwnTeam(
      [
        { ...ownerRow(), name: "Olga Owner" },
        { ...bookkeeper, name: "Ben Ochoa" },
        // The owner unticked one of the cashier's duties.
        { ...cashier, name: "Cal Diaz", duties: cashier.duties.slice(1) },
        // Typed by hand, with no title to guess from.
        { name: "Dee Park", role: "Chief Vibes Officer", duties: ["collect_cash"] },
        // A title the catalog cannot read ticks nothing, so nothing is guessed.
        {
          name: "Eve Ng",
          role: "Chief Vibes Officer",
          duties: [],
          suggestedFor: "Chief Vibes Officer",
        },
      ],
      "dental",
    );
    expect(people.map((p) => [p.name, p.dutiesFromTitle ?? false])).toEqual([
      ["Olga Owner", true],
      ["Ben Ochoa", true],
      ["Cal Diaz", false],
      ["Dee Park", false],
      ["Eve Ng", false],
    ]);
    expect(peopleWithTitleDuties(people).map((p) => p.name)).toEqual(["Olga Owner", "Ben Ochoa"]);
    expect(titleDutiesSentence(people)).toBe(
      "2 of your 5 people carry the usual duties for their job titles.",
    );
  });

  it("a row whose title was changed after its duties were ticked is not marked", () => {
    const bookkeeper = rowsForJobTitle(jobCatalogEntry("bookkeeper")!, 1, [], "general")[0];
    const [person] = buildOwnTeam(
      [{ ...bookkeeper, name: "Ben Ochoa", role: "Controller" }],
      "general",
    );
    expect(person.dutiesFromTitle).toBeUndefined();
  });

  it("clears every mark once the owner says the duties are right", () => {
    const people = buildOwnTeam([{ ...ownerRow(), name: "Olga Owner" }], "general");
    expect(titleDutiesSentence(people)).toBe(
      "Your one person carries the usual duties for their job title.",
    );
    const confirmed = confirmTitleDuties(people);
    expect(confirmed[0]).not.toHaveProperty("dutiesFromTitle");
    expect(titleDutiesSentence(confirmed)).toBe("");
  });

  it("says when every one of several people carries the usual duties for their title, and when one does", () => {
    const people = buildOwnTeam(
      [
        { ...ownerRow(), name: "Olga Owner" },
        { ...rowsForJobTitle(jobCatalogEntry("bookkeeper")!, 1, [], "general")[0], name: "Ben" },
      ],
      "general",
    );
    expect(titleDutiesSentence(people)).toBe(
      "All 2 of your people carry the usual duties for their job titles.",
    );
    expect(titleDutiesSentence(confirmTitleDutiesFor(people, people[0].id))).toBe(
      "One of your 2 people carries the usual duties for their job title.",
    );
  });

  it("clears the mark on one person only when the owner confirms that person's duties", () => {
    const people = buildOwnTeam(
      [
        { ...ownerRow(), name: "Olga Owner" },
        { ...rowsForJobTitle(jobCatalogEntry("bookkeeper")!, 1, [], "general")[0], name: "Ben" },
      ],
      "general",
    );
    const [olga, ben] = people;
    const confirmed = confirmTitleDutiesFor(people, ben.id);
    expect(confirmed[1]).not.toHaveProperty("dutiesFromTitle");
    expect(confirmed[1].entitlements).toEqual(ben.entitlements);
    expect(confirmed[0]).toBe(olga);
    expect(olga.dutiesFromTitle).toBe(true);
    // An unknown id, or a person already confirmed, changes nothing.
    expect(confirmTitleDutiesFor(confirmed, ben.id)[1]).toBe(confirmed[1]);
    expect(confirmTitleDutiesFor(people, "nobody")).toEqual(people);
  });
});
