import { CONTROL_CONFIRM_TAB, CONTROL_IN_PLACE_TAB } from "./active-template";
import { dateAfter } from "./dates";
import type { DecisionInput } from "./profile-actions";
import type { ControlItem } from "./types";

/**
 * The Decisions log entry "This runs here" writes for a starter control. Its
 * `linkedTab` ("control") is what the engines read to count the control, so
 * it never changes.
 */
export function confirmControlEntry(c: ControlItem, now = new Date()): DecisionInput {
  return {
    subject: `Control: ${c.name}`,
    kind: "monitor",
    note: `Confirmed this control runs here: ${c.description} Review whether it still runs, and who does it.`,
    reviewBy: dateAfter(now, 90),
    linkedTab: CONTROL_CONFIRM_TAB,
    linkedId: c.id,
  };
}

/**
 * The Decisions log entry "We already do something here" writes. Its
 * `linkedTab` ("control-in-place") is what the engines read, so it never
 * changes.
 */
export function inPlaceEntry(c: ControlItem, text: string, now = new Date()): DecisionInput {
  return {
    subject: `In place: ${c.name}`,
    kind: "monitor",
    note: text,
    reviewBy: dateAfter(now, 90),
    linkedTab: CONTROL_IN_PLACE_TAB,
    linkedId: c.id,
  };
}

/**
 * What "Take it off" asks before a credit a setup answer gives a control
 * comes off it (active-template `setupControlsInPlace`): the answer stands,
 * the control stops counting it, and nothing puts the credit back.
 */
export function takeOffSetupControlPrompt(controlName: string, text: string): string {
  return `Take "${text}" off ${controlName}? Precog stops counting it as in place there. You cannot undo this.`;
}
