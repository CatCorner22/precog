import type { IndustryId } from "./industry";
import { normalizeProfile, type PracticeProfile } from "./practice-profile";
import { withRelations } from "./profile-actions";
import { isRecord } from "./profile-entries";

/**
 * A stored profile row as the server hands it back: the stored document with
 * the row's name and industry, run through the one normaliser the client
 * uses, with `today` (the owner's calendar day the request carried) as the
 * latest day a register confirmation may carry. Manual staff markers
 * (`segregationSource`, `bankRecSource`) come back as they were saved.
 */
export function mergeProfile(
  row: {
    name: string;
    industry: string;
    profile: PracticeProfile;
  },
  today: string,
): PracticeProfile {
  const stored: Partial<PracticeProfile> = isRecord(row.profile) ? row.profile : {};
  return normalizeProfile(
    {
      ...stored,
      practiceName: row.name || stored.practiceName,
      industry: (row.industry || stored.industry) as IndustryId,
    },
    { today },
  );
}

/**
 * The parts of a business that two devices may change at the same time
 * without asking: each is merged whole, never field by field. Every key the
 * named sections do not list (the setup answers, the business's name, keys a
 * later release adds) belongs to "settings", so no key is ever left out.
 */
export type ProfileSection =
  "team" | "map" | "register" | "monthlyReviews" | "decisions" | "procedures" | "settings";

const NAMED_SECTIONS: Record<Exclude<ProfileSection, "settings">, readonly string[]> = {
  team: ["customPeople", "staff", "plannedAbsences", "leaverAccessChecks"],
  map: [
    "customProcesses",
    "mapLayout",
    "savedProcessBlocks",
    "mapHealthHistory",
    "mapCompletenessHistory",
    "mapVersions",
  ],
  register: ["customKnowledge", "customRelations"],
  monthlyReviews: ["monthlyReviews"],
  decisions: ["decisions"],
  procedures: ["procedures", "places"],
};

export const PROFILE_SECTIONS: readonly ProfileSection[] = [
  ...(Object.keys(NAMED_SECTIONS) as Exclude<ProfileSection, "settings">[]),
  "settings",
];

/**
 * Which business this copy is, and when it was edited: always this device's,
 * never compared. `ownerUserId` routes the save to the owner's row, and the
 * account's conflict reply does not carry it.
 */
const IDENTITY_KEYS = new Set(["businessId", "ownerUserId", "updatedAt"]);

const SECTION_OF = new Map<string, ProfileSection>(
  Object.entries(NAMED_SECTIONS).flatMap(([section, keys]) =>
    keys.map((key) => [key, section as ProfileSection] as const),
  ),
);

function sectionOf(key: string): ProfileSection {
  return SECTION_OF.get(key) ?? "settings";
}

function fields(profile: PracticeProfile): Record<string, unknown> {
  return profile as unknown as Record<string, unknown>;
}

/** The keys of `section` that either copy holds. */
function keysOf(section: ProfileSection, a: PracticeProfile, b: PracticeProfile): string[] {
  const keys = new Set<string>();
  for (const copy of [a, b])
    for (const key of Object.keys(fields(copy)))
      if (!IDENTITY_KEYS.has(key) && sectionOf(key) === section) keys.add(key);
  return [...keys];
}

/**
 * Deep equality as the account stores JSON: key order does not matter (the
 * database reorders keys), and a key holding `undefined` is the same as no
 * key (JSON drops it).
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameValue(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)]))
    if (!sameValue(left[key], right[key])) return false;
  return true;
}

function sameSection(section: ProfileSection, a: PracticeProfile, b: PracticeProfile): boolean {
  return keysOf(section, a, b).every((key) => sameValue(fields(a)[key], fields(b)[key]));
}

export type SectionMerge =
  | {
      kind: "merged";
      profile: PracticeProfile;
      /** The sections taken from the account's copy. */
      fromRemote: ProfileSection[];
    }
  /** Both copies changed the same section differently: the owner chooses. */
  | { kind: "overlap"; sections: ProfileSection[] };

/**
 * Two copies of one business that both moved on from `base`: this device's
 * (`local`) and the account's (`remote`, saved meanwhile from another
 * device). When each section changed on one side only, or to the same value
 * on both, the merge keeps every change: each section comes whole from the
 * side that changed it, otherwise from this device. A section both sides
 * changed differently is an overlap, and nothing is merged. A change of
 * industry on either side changes what every section means, so it never
 * merges. The merged copy carries `stamp` as its edit time, and its staff
 * figures are read from it again when its team, map or register came from
 * the two devices (`withStaffReadAgain`).
 */
export function mergeSections(
  base: PracticeProfile,
  local: PracticeProfile,
  remote: PracticeProfile,
  stamp: string,
): SectionMerge {
  if (local.industry !== base.industry || remote.industry !== base.industry)
    return { kind: "overlap", sections: ["settings"] };
  const fromRemote: ProfileSection[] = [];
  const overlap: ProfileSection[] = [];
  for (const section of PROFILE_SECTIONS) {
    if (sameSection(section, base, remote)) continue;
    if (sameSection(section, base, local) || sameSection(section, local, remote))
      fromRemote.push(section);
    else overlap.push(section);
  }
  if (overlap.length) return { kind: "overlap", sections: overlap };
  return { kind: "merged", profile: withSections(local, remote, fromRemote, stamp), fromRemote };
}

/**
 * The parts of a business whose edits read the staff figures again from the
 * team, the map, the register and the dual-release policy (profile-actions
 * `withPeople`, `withProcesses`, `withKnowledge`, `withRelations`).
 */
const STAFF_SOURCES = ["customPeople", "customProcesses", "customKnowledge", "customRelations"];

/**
 * `local` with each of `sections` replaced whole by `remote`'s, stamped
 * `stamp`, its staff figures read again where they need to be.
 */
function withSections(
  local: PracticeProfile,
  remote: PracticeProfile,
  sections: readonly ProfileSection[],
  stamp: string,
): PracticeProfile {
  const taken = new Set(sections);
  const merged: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(fields(local)), ...Object.keys(fields(remote))])) {
    const source = !IDENTITY_KEYS.has(key) && taken.has(sectionOf(key)) ? remote : local;
    const value = fields(source)[key];
    if (value !== undefined) merged[key] = value;
  }
  merged.updatedAt = stamp;
  return withStaffReadAgain(merged as unknown as PracticeProfile, local, remote, sections);
}

/**
 * The staff figures (who knows what alone, the duty separation score, the
 * team's size) are worked out from the team, the map, the register and the
 * dual-release policy, and stored with the team. Taken whole from one copy,
 * they can disagree with what the merged copy took from the other: Sam
 * leaving on this device while the other device adds an item Dana and Sam
 * both know leaves Dana alone on it, which neither copy counted. So when the
 * two copies hold a different team, map or register and the merge takes a
 * section from the other device, the figures are read again from the merged
 * copy, as an edit of the team or the register reads them: the same figures
 * the two devices' edits give when made one after the other on one device,
 * the other device's first. A figure set by hand stays where such an edit
 * keeps it (on the sample team; an own team's come from its duties).
 */
function withStaffReadAgain(
  merged: PracticeProfile,
  mine: PracticeProfile,
  theirs: PracticeProfile,
  taken: readonly ProfileSection[],
): PracticeProfile {
  if (taken.length === 0) return merged;
  if (STAFF_SOURCES.every((key) => sameValue(fields(mine)[key], fields(theirs)[key])))
    return merged;
  // Setting the register's own relations changes nothing else: it reads the
  // staff figures again from the merged copy (profile-actions withContinuityStaff).
  return withRelations(merged, merged.customRelations ?? null);
}

/**
 * A merge applied to the copy open now (`state`), which may hold edits made
 * after `local` was merged. Null when one of those edits touched a section
 * the merge takes from the account's copy (taking it whole would drop that
 * edit), or when `state` is another business or industry: the owner is
 * asked instead.
 */
export function withAccountSections(
  state: PracticeProfile,
  local: PracticeProfile,
  remote: PracticeProfile,
  sections: readonly ProfileSection[],
  stamp: string,
): PracticeProfile | null {
  if ((state.businessId ?? null) !== (local.businessId ?? null)) return null;
  if (state.industry !== local.industry) return null;
  if (!sections.every((section) => sameSection(section, state, local))) return null;
  return withSections(state, remote, sections, stamp);
}
