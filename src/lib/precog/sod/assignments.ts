import type { IndustryTemplate } from "../templates/types";
import type { Person } from "../types";
import type { EntitlementId } from "./conflict-rules";
import { ROLE_TEMPLATES } from "./role-templates";

/** One person on the duty map and the duties they hold. */
export interface RoleAssignment {
  personId: string;
  personName: string;
  role: string;
  entitlements: EntitlementId[];
  /** The owner's own mark from setup (see Person.owner); absent, the title decides. */
  owner?: boolean;
}

/**
 * The duties the conflict engine reads for a person: their own list, else
 * their title's duties in this line of business, else the shared title table,
 * else read-only reporting. Every view that asks "what does this person hold"
 * resolves it here.
 */
export function personDuties(
  person: Pick<Person, "role" | "entitlements">,
  roleTemplates: Readonly<Record<string, readonly string[]>>,
): EntitlementId[] {
  const duties = person.entitlements?.length
    ? person.entitlements
    : (roleTemplates[person.role] ?? ROLE_TEMPLATES[person.role] ?? ["view_reports_only"]);
  return Array.from(new Set(duties)) as EntitlementId[];
}

/** The template's active people with their duties. People marked as left stay on the list for history but hold no live access. */
export function buildAssignments(
  tpl: Pick<IndustryTemplate, "people" | "roleTemplates">,
): RoleAssignment[] {
  return tpl.people
    .filter((p) => p.active)
    .map((p) => ({
      personId: p.id,
      personName: p.name,
      role: p.role,
      entitlements: personDuties(p, tpl.roleTemplates),
      ...(typeof p.owner === "boolean" ? { owner: p.owner } : {}),
    }));
}

/** The same assignments with one person granted (`on`) or relieved of one duty. */
export function withEntitlement(
  assignments: readonly RoleAssignment[],
  personId: string,
  entitlement: EntitlementId,
  on: boolean,
): RoleAssignment[] {
  return assignments.map((person) => {
    if (person.personId !== personId) return person;
    const others = person.entitlements.filter((id) => id !== entitlement);
    return { ...person, entitlements: on ? [...others, entitlement] : others };
  });
}
