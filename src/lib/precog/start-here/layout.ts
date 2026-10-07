/** The fold on Start here that holds the evidence behind the first screen. */
export const WHY_WE_SAY_THIS = "Why we say this";

/** How many ranked controls "Do these first" shows before "Show the other N". */
export const FIRST_STEPS_SHOWN = 3;

/**
 * The screen where a ranked control gets done: the conflicts it answers. A
 * control that answers no open finding (background checks, time away) is a
 * practice from the case library with no screen of its own, so it gets no
 * button; the step's own line is the instruction.
 */
export function stepDestination(step: { answers: number }): "sod" | null {
  return step.answers > 0 ? "sod" : null;
}
