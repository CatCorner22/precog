import { describe, expect, it } from "vitest";
import { jobCatalogEntry } from "../onboarding/job-catalog";
import { buildOwnTeam, ownerRow } from "../onboarding/own-team";
import { rowsForJobTitle } from "../onboarding/add-people";
import { confirmTitleDuties, peopleWithTitleDuties, titleDutiesSentence } from "./title-duties";

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
      "Duties for 2 of your 5 people are the usual ones for their job titles, not ones you confirmed.",
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
      "Duties for your one person are the usual ones for their job title, not ones you confirmed.",
    );
    const confirmed = confirmTitleDuties(people);
    expect(confirmed[0]).not.toHaveProperty("dutiesFromTitle");
    expect(titleDutiesSentence(confirmed)).toBe("");
  });
});
