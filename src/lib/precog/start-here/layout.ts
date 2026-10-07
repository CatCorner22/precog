/** The fold on Start here that holds the evidence behind the first screen. */
export const WHY_WE_SAY_THIS = "Why we say this";

/** How many ranked controls "Do these first" shows before "Show the other N". */
export const FIRST_STEPS_SHOWN = 3;

/** The screen where a ranked control gets done: the conflicts it answers, or the controls list. */
export function stepDestination(step: { answers: number }): "sod" | "control" {
  return step.answers > 0 ? "sod" : "control";
}
