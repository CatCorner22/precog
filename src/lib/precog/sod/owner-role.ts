import { industryHasOwner } from "../industry";

/**
 * Who owns the business, read from a job title.
 *
 * A title names the owner when one of its parts is an owner title on its own:
 * "Owner", "Owner / Dentist", "Chef/Owner", "President & CEO", "Managing
 * Partner". A part that only mentions an owner does not: "Owner's Assistant",
 * "Assistant to the Owner", "Office Manager (Owner's wife)", "Vice President,
 * Finance", "Principal Accountant", "Sales Partner". Those people are
 * employees, and treating them as the owner would hide their conflicts.
 */
const OWNER_PART = new RegExp(
  "^(?:" +
    [
      "(?:co[- ]?|sole )?(?:owner|proprietor)(?:[- ]operator)?",
      "(?:business|practice|shop|store|restaurant|salon|clinic|firm|company|franchise) owner",
      "(?:dentist|chef|doctor|physician|attorney|broker)[- ]owner",
      "owner[- ](?:dentist|chef|doctor|physician|attorney|broker|manager)",
      "franchisee",
      "(?:co[- ]?)?founder",
      "ceo",
      "chief executive(?: officer)?",
      "president",
      "managing (?:member|partner)",
      "(?:senior |equity |general |name )?partner",
      "principal",
    ].join("|") +
    ")$",
);

/** Splits a title into its parts: "Owner / Dentist, DDS" is owner, dentist and DDS. */
function titleParts(role: string): string[] {
  return role
    .toLowerCase()
    .replace(/\./g, "")
    .split(/\s*(?:[/,;|&()+]|\s[-–—]\s|\band\b)\s*/)
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

/**
 * A word that makes a title a past one: "Former Owner", "Ex-Controller",
 * "Owner (Retired)", "Partner Emeritus". Not "Ex Officio", which is a seat
 * held by virtue of another office.
 */
const FORMER_WORD = "(?:former|retired|emeritus|past|ex(?![- ]?officio\\b))";
const FORMER_LEAD = new RegExp(`^\\s*${FORMER_WORD}\\b[\\s-]*`, "i");
const FORMER_TAIL = new RegExp(`[\\s,(/-]+${FORMER_WORD}\\)?\\s*$`, "i");

/**
 * The seat a past title names without its "former" word ("Former Owner" is
 * "Owner"), or undefined when the title is a current one. Someone with a
 * past title no longer holds that seat.
 */
export function formerTitleRest(role: string): string | undefined {
  const rest = role.replace(FORMER_LEAD, "").replace(FORMER_TAIL, "").trim();
  return rest === role.trim() ? undefined : rest;
}

/** True when the title names the business's owner (one of possibly several), but not a former one. */
export function isOwnerRole(role: string): boolean {
  if (formerTitleRest(role) !== undefined) return false;
  return titleParts(role).some((part) => OWNER_PART.test(part));
}

/** A person as the owner tests read them: the title, and the owner's own mark when set. */
interface OwnerCandidate {
  id: string;
  role: string;
  /** Set during setup: this person owns the business. Absent, the title decides. */
  owner?: boolean;
}

/**
 * True when the team carries the owner's own marks (it was set up on the
 * grid, where each row says whether that person owns the business). The marks
 * then decide over titles, so an owner titled "Dentist" is still the owner and
 * a "Managing Partner" the owner did not mark is not.
 */
export function ownersMarked(people: readonly OwnerCandidate[]): boolean {
  return people.some((p) => typeof p.owner === "boolean");
}

/** Whether this person owns the business: their mark on a marked team, otherwise their title. */
export function ownsBusiness(person: OwnerCandidate, marked: boolean): boolean {
  return marked ? person.owner === true : isOwnerRole(person.role);
}

/**
 * The one person who owns the business alone, when exactly one active person
 * owns it (by the owner's marks, or by title on a team without marks). With
 * two or more (partners, co-owners, a family business), each can take from
 * the others, so none of them is treated as the person who cannot steal from
 * themselves. A line of business with no owner (a nonprofit belongs to no
 * one) has none, whatever the marks or titles say: this is where that rule is
 * read, so a team that reaches the engine without passing setup still gets it.
 */
export function soleOwnerId(people: readonly OwnerCandidate[], industry?: string): string | null {
  if (!industryHasOwner(industry)) return null;
  const marked = ownersMarked(people);
  const owners = people.filter((p) => ownsBusiness(p, marked));
  return owners.length === 1 ? owners[0].id : null;
}

/** `soleOwnerId` over a team of role assignments. */
export function teamOwnerId(
  team: readonly { personId: string; role: string; owner?: boolean }[],
  industry?: string,
): string | null {
  return soleOwnerId(
    team.map((a) => ({ id: a.personId, role: a.role, owner: a.owner })),
    industry,
  );
}
