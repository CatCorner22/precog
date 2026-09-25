import type { IndustryId } from "../industry";
import { getIndustryTemplate } from "../templates";
import { parseRoster } from "../import/roster";
import { buildOwnTeam, pastedRows, OWN_TEAM_MAX, type OwnTeamRow } from "./own-team";
import type { Departure } from "../continuity/access-removal";

export function prepareGuidedRoster(text: string, industry: IndustryId) {
  if (new TextEncoder().encode(text).length > 250_000) throw new Error("The roster is too large for guided setup. No rows were imported.");
  const parsed = parseRoster(text, getIndustryTemplate(industry));
  const incoming = pastedRows(parsed, industry).rows;
  if (!incoming.length) throw new Error("No active people were found. Use one Name, Title per line, or the detailed importer.");
  if (incoming.length > OWN_TEAM_MAX || (parsed.dropped ?? 0) > 0) throw new Error(`Guided setup supports up to ${OWN_TEAM_MAX} active people without truncation. Use detailed setup to review this larger roster.`);
  const leftOut: Departure[] = parsed.people.filter((person) => !person.active).map((person) => ({name:person.name,role:person.role}));
  const rows: OwnTeamRow[] = incoming.map((row,index)=>({...row,rowId:`guided-${index}`}));
  const uncertain = rows.filter((row)=>!row.duties.length || row.readAs?.partial || row.readAs && !row.readAs.title);
  return {rows,leftOut,issues:parsed.issues,uncertain:uncertain.length};
}

export function completeGuidedRoster(rows: readonly OwnTeamRow[], industry: IndustryId) {
  if (!rows.length || rows.some((row)=>!row.name.trim())) throw new Error("Every included person needs a name.");
  const people=buildOwnTeam(rows,industry);
  if (people.length!==rows.length) throw new Error("Not every row could be preserved. Review duplicates and empty names in detailed setup.");
  return people;
}
