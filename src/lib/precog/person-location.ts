import type { Person } from "./types";
import { joinWithAnd } from "./text";

/**
 * Where a person works, as the roster said: the department or location
 * column. A person listed at two stores with one title is one person whose
 * department reads "Oakridge Mall; Riverside" (see import/people-csv.ts);
 * each place is listed here once.
 */
export function personLocations(person: Pick<Person, "department"> | undefined): string[] {
  const seen = new Set<string>();
  const places: string[] = [];
  for (const raw of (person?.department ?? "").split(";")) {
    const place = raw.trim();
    const key = place.toLowerCase();
    if (!place || seen.has(key)) continue;
    seen.add(key);
    places.push(place);
  }
  return places;
}

/**
 * Every place the active team works, in roster order. A business with two or
 * more of them shows where each person named in a finding works, and lets the
 * owner look at one place at a time.
 */
export function businessLocations(people: readonly Person[]): string[] {
  const seen = new Set<string>();
  const places: string[] = [];
  for (const person of people) {
    if (!person.active) continue;
    for (const place of personLocations(person)) {
      const key = place.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      places.push(place);
    }
  }
  return places;
}

/** "Oakridge Mall and Riverside": a person's places for a sentence or a label; "" when none is known. */
export const locationText = joinWithAnd;

/**
 * Looks up where each person works by id, for views that hold only the id and
 * name a finding carries. Empty when the business has one place or none, so a
 * single-site business never sees a location it does not need.
 */
export function locationsById(people: readonly Person[]): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  if (businessLocations(people).length < 2) return byId;
  for (const person of people) {
    const places = personLocations(person);
    if (places.length > 0) byId.set(person.id, places);
  }
  return byId;
}

/** Whether a person works at `place`; one with no place on record matches only "no place given" (null). */
export function worksAt(places: readonly string[] | undefined, place: string | null): boolean {
  if (place === null) return !places || places.length === 0;
  const key = place.toLowerCase();
  return (places ?? []).some((held) => held.toLowerCase() === key);
}
