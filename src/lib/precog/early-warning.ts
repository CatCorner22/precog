import type { PracticeProfile } from "./practice-profile";
import { buildDriftActions } from "./integrations/drift-signals";
import { dueItemsFor } from "./reminders/due-items";
import { isOwnTeam } from "./firm/engagement";

/** One early-warning line: a record that says something changed or fell due. */
export interface EarlyWarningItem {
  id: string;
  title: string;
  detail: string;
  /** The day the record behind it is dated: its due date, or when the reading was taken. */
  on: string;
  /** "due": `on` is a due date; "reading": `on` is when the books or the export were read. */
  kind: "due" | "reading";
  overdue: boolean;
}

export interface EarlyWarningReport {
  items: EarlyWarningItem[];
  /** The records Precog read; empty when none is connected. */
  sources: string[];
}

/** What a screen prints when no record feeds the list. */
export const NO_EARLY_WARNING_SOURCES = "No early-warning sources connected";

/**
 * Early warning from records only: drift between the books or an access
 * export and the duty map, and what the saved profile says is due or overdue
 * (review dates on decisions, leaver sign-in checks, absences nobody covers,
 * handovers, procedure reviews, stand-ins who have not yet done a task alone,
 * and the monthly review). There is no composite number: each line is a
 * record with a date, and an index of Precog's own scores is not a signal.
 */
export function earlyWarning(profile: PracticeProfile, today: string): EarlyWarningReport {
  const sources: string[] = [];
  if (profile.integrationDriftSummary) sources.push("Accounting system reading");
  if (profile.accessReconciliation) sources.push("User access export");
  // The reminders read the saved profile of an own team; a sample has none.
  const ownTeam = isOwnTeam(profile);
  if (ownTeam) sources.push("Review dates, checks and procedures recorded in Precog");

  // Each drift line carries the date of the record behind it: the access
  // import for the access rows (when one exists), the books reading otherwise.
  const booksOn = profile.integrationDriftSummary?.updatedAt.slice(0, 10) || today;
  const accessOn = profile.accessReconciliation?.importedAt.slice(0, 10) || booksOn;
  const drift: EarlyWarningItem[] = buildDriftActions({
    summary: profile.integrationDriftSummary,
    accessReconciliation: profile.accessReconciliation,
  }).map((action) => ({
    id: action.id,
    title: action.title,
    detail: action.why,
    on: action.id === "drift-access-import" ? accessOn : booksOn,
    kind: "reading",
    overdue: false,
  }));
  const due: EarlyWarningItem[] = ownTeam
    ? dueItemsFor(profile, today).map((item) => ({
        id: item.key,
        title: item.title,
        // The owner's wording: never the advisor's own notes.
        detail: item.ownerDetail,
        on: item.dueOn,
        kind: "due",
        overdue: item.overdue,
      }))
    : [];
  // Overdue first, then what the books or the export show, then what falls due soon.
  return {
    items: [...due.filter((i) => i.overdue), ...drift, ...due.filter((i) => !i.overdue)],
    sources,
  };
}
