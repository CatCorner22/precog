import { getIndustryTemplate } from "../templates";
import { industryMeta } from "../industry";
import type { PracticeProfile } from "../practice-profile";

/**
 * Where the process map came from.
 *
 * - "sample": the sample business (no own people entered), with or without
 *   map edits.
 * - "starter": the owner's own people over the industry's starter map, with
 *   no process owned by anyone yet. The map is a starting point, not a fact
 *   about the business.
 * - "own": the owner edited the map (customProcesses set), or a process on the
 *   starter map points at one of their people.
 */
export type MapSource = "sample" | "starter" | "own";

export type MapProfile = Pick<PracticeProfile, "industry" | "customPeople" | "customProcesses">;

export function mapSource(profile: MapProfile): MapSource {
  if (!profile.customPeople) return "sample";
  if (profile.customProcesses) return "own";
  // resolveTemplate keeps only owner references that point at the owner's own
  // people, so the starter map stays unowned until one of them is assigned.
  const ids = new Set(profile.customPeople.map((p) => p.id));
  const owned = getIndustryTemplate(profile.industry).processes.some((p) =>
    (p.ownerPersonIds ?? []).some((id) => ids.has(id)),
  );
  return owned ? "own" : "starter";
}

/**
 * Whether map health, ownership, documentation, issue counts and hot
 * processes describe a map the owner has worked on.
 *
 * The starter map with nobody assigned would score every process as unowned
 * and every procedure as unwritten, and an empty map scores nothing at all.
 * Neither is a fact about the business, so the figures wait until the owner
 * assigns an owner to a process or builds their own map with at least one
 * process on it. The sample business is scored as it always was.
 */
export function mapAssessed(profile: MapProfile): boolean {
  switch (mapSource(profile)) {
    case "sample":
      return true;
    case "starter":
      return false;
    case "own":
      return !profile.customProcesses || profile.customProcesses.length > 0;
  }
}

/** The starter map's process count and industry wording, for one shared sentence. */
export function starterMapFacts(profile: Pick<PracticeProfile, "industry">): {
  count: number;
  example: string;
} {
  return {
    count: getIndustryTemplate(profile.industry).processes.length,
    example: `${industryMeta(profile.industry).label.toLowerCase()} example`,
  };
}

/**
 * The one plain sentence every screen shows in place of map figures while the
 * map is not assessed, or null once it is.
 */
export function mapNotAssessedNote(profile: MapProfile): string | null {
  if (mapAssessed(profile)) return null;
  if (mapSource(profile) === "starter") {
    const { count, example } = starterMapFacts(profile);
    return `Your map holds ${count} starter processes from the ${example} and none has an owner yet. Assign an owner to each, or build your own map, and these figures fill in.`;
  }
  return "Your map has no processes yet. Add the processes your business runs in the map builder, and these figures fill in.";
}
