/**
 * The product's names for its recurring ideas, in one place.
 *
 * `plain` is the wording plain mode shows. `tactical` is the tactical-mode
 * wording, when that mode keeps its own term (an empty string means tactical
 * mode uses the plain wording too). `retired` lists earlier names that no
 * longer appear on screen; a later lint scans the components and routes for
 * them. Old saved files and locked report layouts may still carry a retired
 * name, and Precog keeps reading them.
 */
export interface Term {
  plain: string;
  tactical: string;
  retired: string[];
}

export const TERMS = {
  segregationFigure: { plain: "Duties kept apart", tactical: "Duty separation", retired: [] },
  dutyAssignments: { plain: "Duty assignments", tactical: "", retired: ["Duty map"] },
  monthlyReview: {
    plain: "Monthly review",
    tactical: "",
    retired: ["monthly file", "This month’s file", "monthly check"],
  },
  urgentProcesses: { plain: "Most urgent processes", tactical: "", retired: [] },
  scenarios: { plain: "Scenarios", tactical: "", retired: [] },
  businessSettings: { plain: "Business settings", tactical: "", retired: ["Business profile"] },
} as const satisfies Record<string, Term>;

export type TermId = keyof typeof TERMS;

/** A term's wording for the active mode, through the presentation `say`. */
export function termLabel(id: TermId, say: (plain: string, tactical: string) => string): string {
  const term: Term = TERMS[id];
  return say(term.plain, term.tactical || term.plain);
}
