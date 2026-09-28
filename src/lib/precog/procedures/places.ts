import type { IndustryId } from "../industry";
import type { ProcessNode } from "../types";
import type { Place, PlaceKind } from "./types";

/** A place the owner can add with one click. */
export interface PlaceSuggestion {
  kind: PlaceKind;
  name: string;
  /** Why it is suggested: named on a process, or usual in this line of business. */
  source: "process" | "usual";
}

/** Places most businesses of every kind do money work in. */
const COMMON: readonly PlaceSuggestion[] = [
  { kind: "software", name: "Accounting software", source: "usual" },
  { kind: "software", name: "Bank portal", source: "usual" },
  { kind: "software", name: "Payroll provider", source: "usual" },
  { kind: "physical", name: "Office safe", source: "usual" },
  { kind: "physical", name: "Deposit bag and bank run", source: "usual" },
  { kind: "physical", name: "Filing cabinet", source: "usual" },
];

/** The usual platforms of each line of business, ahead of the common ones. */
const BY_INDUSTRY: Partial<Record<IndustryId, readonly PlaceSuggestion[]>> = {
  dental: [
    { kind: "software", name: "Practice-management system", source: "usual" },
    { kind: "software", name: "Insurance clearinghouse portal", source: "usual" },
  ],
  retail: [
    { kind: "software", name: "Point of sale", source: "usual" },
    { kind: "software", name: "Online store admin", source: "usual" },
  ],
  professional_services: [
    { kind: "software", name: "Billing and time system", source: "usual" },
    { kind: "software", name: "Trust account bank portal", source: "usual" },
  ],
  restaurant: [
    { kind: "software", name: "Point of sale", source: "usual" },
    { kind: "software", name: "Scheduling app", source: "usual" },
  ],
  construction: [
    { kind: "software", name: "Job-cost accounting", source: "usual" },
    { kind: "software", name: "Project management app", source: "usual" },
  ],
  automotive: [
    { kind: "software", name: "Dealer management system (DMS)", source: "usual" },
    { kind: "software", name: "Manufacturer warranty portal", source: "usual" },
  ],
  nonprofit: [
    { kind: "software", name: "Donor database", source: "usual" },
    { kind: "software", name: "Grant portal", source: "usual" },
  ],
};

/**
 * Places worth adding: the systems the business's own processes name first,
 * then the usual ones for its line of business, less any already added (by
 * name, ignoring case).
 */
export function placeSuggestions(
  industry: IndustryId,
  processes: readonly Pick<ProcessNode, "systems">[],
  places: readonly Pick<Place, "name">[],
): PlaceSuggestion[] {
  const taken = new Set(places.map((p) => p.name.trim().toLowerCase()));
  const out: PlaceSuggestion[] = [];
  const add = (s: PlaceSuggestion) => {
    const key = s.name.trim().toLowerCase();
    if (!key || taken.has(key)) return;
    taken.add(key);
    out.push({ ...s, name: s.name.trim() });
  };
  for (const p of processes) {
    for (const name of p.systems ?? []) add({ kind: "software", name, source: "process" });
  }
  for (const s of BY_INDUSTRY[industry] ?? []) add(s);
  for (const s of COMMON) add(s);
  return out;
}
