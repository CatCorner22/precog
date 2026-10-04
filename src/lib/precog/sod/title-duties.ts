/**
 * Duties guessed from a job title. Setup ticks a title's usual duties and
 * marks the person `dutiesFromTitle` while the ticks are still that guess;
 * the findings say how many rest on guesses until the owner confirms them.
 */

import type { Person } from "../types";

/**
 * People whose duties are still the usual ones for their job title, not
 * ones the owner confirmed, among the active team.
 */
export function peopleWithTitleDuties(people: readonly Person[]): Person[] {
  return people.filter((person) => person.active && person.dutiesFromTitle === true);
}

/**
 * One plain sentence saying how many of the active people carry duties
 * guessed from their job title, or an empty string when none do.
 */
export function titleDutiesSentence(people: readonly Person[]): string {
  const total = people.filter((person) => person.active).length;
  const guessed = peopleWithTitleDuties(people).length;
  if (guessed === 0 || total === 0) return "";
  if (total === 1) {
    return "Your one person carries the usual duties for their job title.";
  }
  if (guessed === total) {
    return `All ${total} of your people carry the usual duties for their job titles.`;
  }
  return `${guessed} of your ${total} people carry the usual duties for their job ${
    guessed === 1 ? "title" : "titles"
  }.`;
}

/** The team with every "duties from the job title" mark cleared: the owner has checked them. */
export function confirmTitleDuties(people: readonly Person[]): Person[] {
  return people.map((person) => {
    if (!person.dutiesFromTitle) return person;
    const rest: Person = { ...person };
    delete rest.dutiesFromTitle;
    return rest;
  });
}

/** The team with one person's "duties from the job title" mark cleared: the owner confirmed theirs. */
export function confirmTitleDutiesFor(people: readonly Person[], personId: string): Person[] {
  return people.map((person) => {
    if (person.id !== personId || !person.dutiesFromTitle) return person;
    const rest: Person = { ...person };
    delete rest.dutiesFromTitle;
    return rest;
  });
}
