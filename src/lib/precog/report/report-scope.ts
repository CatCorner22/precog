import { isCalendarDate } from "../dates";
import { reportPeriod } from "../firm/reviews";
import { acceptanceDates } from "../headline/open-conflicts";
import type { PracticeProfile } from "../practice-profile";
import type { DetectedConflict } from "../sod/detect";

/** Lock-time calendar scope and only the acceptance dates the report prints. */
export interface ReportScope {
  day: string;
  period: string;
  acceptedOn: Array<[string, string]>;
}

export function buildReportScope(
  profile: Pick<PracticeProfile, "decisions" | "industry">,
  day: string,
  conflicts: readonly DetectedConflict[],
  layoutVersion: number,
): ReportScope {
  if (!isCalendarDate(day)) throw new Error("A report needs a valid reporting day.");
  return {
    day,
    period: layoutVersion >= 5 ? reportPeriod(day) : day.slice(0, 7),
    acceptedOn:
      layoutVersion >= 5
        ? [...acceptanceDates(conflicts, profile.decisions, profile.industry)]
        : [],
  };
}
