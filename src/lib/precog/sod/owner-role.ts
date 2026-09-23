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

/** True when the title names the business's owner (one of possibly several). */
export function isOwnerRole(role: string): boolean {
  return titleParts(role).some((part) => OWNER_PART.test(part));
}

/**
 * The one person who owns the business alone, when exactly one active person
 * holds an owner title. With two or more (partners, co-owners, a family
 * business), each can take from the others, so none of them is treated as the
 * person who cannot steal from themselves.
 */
export function soleOwnerId(people: readonly { id: string; role: string }[]): string | null {
  const owners = people.filter((p) => isOwnerRole(p.role));
  return owners.length === 1 ? owners[0].id : null;
}
