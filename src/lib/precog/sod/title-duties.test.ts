import { describe, expect, it } from "vitest";
import { jobCatalogEntry } from "../onboarding/job-catalog";
import { buildOwnTeam, keepDuties, ownerRow } from "../onboarding/own-team";
import { rowsForJobTitle } from "../onboarding/add-people";
import type { Person } from "../types";
import {
  confirmTitleDuties,
  confirmTitleDutiesFor,
  peopleWithTitleDuties,
  titleDutiesSentence,
} from "./title-duties";

/** A person an imported roster marked as carrying their title's usual duties. */
const guessed = (id: string, name: string): Person => ({
  id,
  name,
  role: "Bookkeeper",
  active: true,
  entitlements: ["post_payments", "view_reports_only"],
  dutiesFromTitle: true,
});

describe("findings that rest on duties guessed from job titles", () => {
  it("setup marks nobody: a suggested duty counts only once the owner keeps it", () => {
    const bookkeeper = rowsForJobTitle(jobCatalogEntry("bookkeeper")!, 1, [], "dental")[0];
    const owner = { ...ownerRow(), name: "Olga Owner" };
    const people = buildOwnTeam(
      [
        keepDuties(owner, owner.duties),
        { ...bookkeeper, name: "Ben Ochoa" },
        { name: "Dee Park", role: "Chief Vibes Officer", duties: ["collect_cash"] },
      ],
      "dental",
    );
    expect(people.map((p) => p.dutiesFromTitle ?? false)).toEqual([false, false, false]);
    // Ben's suggested duties were never kept, so none of them counts.
    expect(people[1].entitlements).toEqual(["view_reports_only"]);
    expect(people[0].entitlements).toEqual([...owner.duties, "view_reports_only"]);
    expect(titleDutiesSentence(people)).toBe("");
  });

  it("names the people an import marked, and nobody else", () => {
    const people: Person[] = [
      guessed("p1", "Olga Owner"),
      guessed("p2", "Ben Ochoa"),
      { id: "p3", name: "Cal Diaz", role: "Cashier", active: true },
      { id: "p4", name: "Dee Park", role: "Clerk", active: true },
      { id: "p5", name: "Eve Ng", role: "Clerk", active: true },
    ];
    expect(peopleWithTitleDuties(people).map((p) => p.name)).toEqual(["Olga Owner", "Ben Ochoa"]);
    expect(titleDutiesSentence(people)).toBe(
      "2 of your 5 people carry the usual duties for their job titles.",
    );
  });

  it("clears every mark once the owner says the duties are right", () => {
    const people = [guessed("p1", "Olga Owner")];
    expect(titleDutiesSentence(people)).toBe(
      "Your one person carries the usual duties for their job title.",
    );
    const confirmed = confirmTitleDuties(people);
    expect(confirmed[0]).not.toHaveProperty("dutiesFromTitle");
    expect(titleDutiesSentence(confirmed)).toBe("");
  });

  it("says when every one of several people carries the usual duties for their title, and when one does", () => {
    const people = [guessed("p1", "Olga Owner"), guessed("p2", "Ben")];
    expect(titleDutiesSentence(people)).toBe(
      "All 2 of your people carry the usual duties for their job titles.",
    );
    expect(titleDutiesSentence(confirmTitleDutiesFor(people, people[0].id))).toBe(
      "One of your 2 people carries the usual duties for their job title.",
    );
  });

  it("clears the mark on one person only when the owner confirms that person's duties", () => {
    const people = [guessed("p1", "Olga Owner"), guessed("p2", "Ben")];
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
