import type { PioneerCoachResult } from "./pioneer-answer";
import type { DecisionInput } from "../profile-actions";
import { dateAfter } from "../dates";

/** One recommended move from a finished Pioneer brief. */
export type CoachDecision = PioneerCoachResult["decisions"][number];

/** The Journal entry for one recommended move, linked so the next brief recognises it. */
export function journalEntry(d: CoachDecision, now: Date): DecisionInput {
  return {
    subject: d.action.slice(0, 120),
    kind: "remediate",
    note: d.rationale,
    reviewBy: dateAfter(now, d.horizonDays),
    ...(d.link
      ? {
          linkedTab: d.link.tab,
          linkedId: d.link.id,
          linkedStep: d.link.step,
          linkedPersonId: d.link.personId,
        }
      : {}),
  };
}
