/** The fold on Start here that holds the evidence behind the first screen. */
export const WHY_WE_SAY_THIS = "Why we say this";

/** How many ranked controls "Do these first" shows before "Show the other N". */
export const FIRST_STEPS_SHOWN = 3;

/** Where a "Do these first" step sends the owner. */
export interface StepLanding {
  tab: "team" | "sod";
  /** A person and the two duties to open, when the step names a person. */
  item?: string;
  /** The button's words. */
  button: string;
}

/**
 * The address item that opens one person on Team with two duties marked.
 * Person ids are `p1` or `own-1`; the tilde is the separator.
 */
export function teamFocusItem(personId: string, dutyA: string, dutyB: string): string {
  return `person~${personId}~${dutyA}~${dutyB}`;
}

/** The person and duties a Team address item names, or null when it names neither. */
export function parseTeamFocus(
  item: string | null | undefined,
): { personId: string; duties: [string, string] } | null {
  if (!item?.startsWith("person~")) return null;
  const [, personId, dutyA, dutyB] = item.split("~");
  if (!personId || !dutyA || !dutyB || item.split("~").length !== 4) return null;
  return { personId, duties: [dutyA, dutyB] };
}

/**
 * The screen that fixes a ranked control. A step that names the person who
 * holds the pair opens that person on Team, with the two duties marked.
 * A step that answers an open finding but names nobody opens the conflicts.
 * A step that answers no finding has no screen of its own.
 */
export function stepDestination(
  step: { answers: number },
  focus?: {
    personId: string;
    personName: string;
    entitlementA: string;
    entitlementB: string;
  } | null,
): StepLanding | null {
  if (step.answers <= 0) return null;
  if (focus?.personId && focus.personName) {
    return {
      tab: "team",
      item: teamFocusItem(focus.personId, focus.entitlementA, focus.entitlementB),
      button: `Change ${focus.personName}'s duties`,
    };
  }
  return { tab: "sod", button: "Open the conflicts it answers" };
}
