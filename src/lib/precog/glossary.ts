import { PRIORITY_SCALE } from "./scoring/bands";
import { RESIDUAL_BANDS } from "./scoring/weights";
import { resolveNavTarget, type NavTarget, type TabId } from "./navigation";

/**
 * The words Precog uses that an owner may not know, each in one or two plain
 * sentences (grade 8 or lower, glossary.test.ts checks). "Words used here" on
 * every page opens them, the page's own words first. A definition says how
 * Precog uses the word, so it changes with the code that computes it: the
 * band cutoffs are read from scoring/bands.ts, never written here.
 */
export interface GlossaryTerm {
  id: string;
  term: string;
  /** The word Tactical mode uses for the same thing, shown only in Tactical mode. */
  tactical?: string;
  definition: string;
  /** The tabs whose pages use the word; the glossary lists it first there. */
  tabs: readonly TabId[];
}

export const GLOSSARY: readonly GlossaryTerm[] = [
  {
    id: "duty-conflict",
    term: "Duty conflict",
    tactical: "Segregation of duties (SoD) conflict",
    definition:
      "One person holds two duties that let them take money and hide it, for example paying bills and also reading the bank statement. Precog lists each pair it finds.",
    tabs: ["start", "team", "sod", "map", "scores", "pioneer"],
  },
  {
    id: "open-conflict",
    term: "Open duty conflict",
    definition:
      "A duty conflict that is still there: the same person holds both duties, and dual release does not cover every amount. Precog does not count pairs the owner holds.",
    tabs: ["start", "sod", "scores"],
  },
  {
    id: "dual-release",
    term: "Dual release",
    tactical: "Dual authorization",
    definition:
      "Two people must each approve a payment before the bank sends it. A duty conflict is closed only when this covers every amount.",
    tabs: ["start", "sod", "precog", "scores"],
  },
  {
    id: "custody",
    term: "Custody",
    definition:
      "Holding the money or goods, or being able to send a payment, for example keeping the cash or signing checks. Precog keeps it apart from the duties of writing down and checking.",
    tabs: ["sod", "map"],
  },
  {
    id: "control",
    term: "Control",
    definition:
      "A step that stops a mistake or a theft, or catches it. For example, a second person approves each payment.",
    tabs: ["start", "sod", "monthly", "precog", "scores"],
  },
  {
    id: "detective-control",
    term: "Detective control",
    definition:
      "A check that finds a problem after it happens, for example reading the bank statement each month. It does not stop a theft, but it ends it sooner, and that keeps the loss small.",
    tabs: ["start", "monthly", "scores"],
  },
  {
    id: "bank-rec",
    term: "Bank reconciliation",
    definition:
      "Each month, match every line on the bank statement to your own books. It works best when the person who does it does not also handle the money.",
    tabs: ["start", "sod", "monthly", "procedures"],
  },
  {
    id: "positive-pay",
    term: "Positive Pay",
    definition:
      "A bank service: you send the bank a list of the checks you wrote, and it pays only the checks on that list.",
    tabs: ["sod", "procedures", "precog"],
  },
  {
    id: "residual",
    term: "Residual risk",
    definition:
      "The risk that is left after the controls you have. Precog scores it from 0 to 100 with weights it chose, so the score sets an order; it is not a dollar amount.",
    tabs: ["scores", "map", "pioneer"],
  },
  {
    id: "residual-bands",
    term: "Severe, High, Moderate, Low",
    definition: `The four bands for residual risk. Severe is ${RESIDUAL_BANDS.critical_path.min} or more, High is ${RESIDUAL_BANDS.act_now.min} to ${RESIDUAL_BANDS.act_now.max}, Moderate is ${RESIDUAL_BANDS.mitigate.min} to ${RESIDUAL_BANDS.mitigate.max}, and Low is under ${RESIDUAL_BANDS.mitigate.min}.`,
    tabs: ["scores", "map", "pioneer"],
  },
  {
    id: "fix-first",
    term: "Fix first",
    definition: `The top band of the priority list, for items that score ${PRIORITY_SCALE.top} or more on it. Start with these.`,
    tabs: ["map", "scores", "pioneer"],
  },
  {
    id: "register",
    term: "Register",
    tactical: "Residual risk register",
    definition:
      "Precog's list of your controls, scenarios and know-how, each with a risk score. Your monthly checks come from it.",
    tabs: ["scores", "monthly", "knowledge"],
  },
  {
    id: "duties-apart",
    term: "Duties kept apart",
    tactical: "Duty separation",
    definition:
      "Precog's score from 0 to 100 for how well your team splits up the money duties; higher is better. It reads no better than Weak while a critical duty conflict is open.",
    tabs: ["start", "sod", "scores"],
  },
  {
    id: "scenario",
    term: "Scenario",
    definition:
      "A story of how money could be lost in a business like yours. Its dollar and day figures are examples, not from your books.",
    tabs: ["start", "precog", "scores", "pioneer"],
  },
  {
    id: "stand-in",
    term: "Stand-in",
    definition:
      "A person who can cover someone's work while they are away. Precog suggests one for each task that would stop.",
    tabs: ["start", "team", "knowledge", "procedures"],
  },
  {
    id: "sole-holder",
    term: "Only one person can do it",
    tactical: "Single point of failure",
    definition:
      "Only one person can do a task well. If that person is away or leaves, the task stops until someone else learns it.",
    tabs: ["start", "team", "knowledge"],
  },
  {
    id: "exception",
    term: "Exception",
    definition:
      "A monthly check result that means you found a problem, for example a payment you cannot explain. Write what you found in the note.",
    tabs: ["monthly", "start"],
  },
  {
    id: "evidence-log",
    term: "Control evidence log",
    definition:
      "Precog's dated record of each monthly check when you are signed in. The person who did the check makes the first entry, called the preparer entry.",
    tabs: ["monthly"],
  },
  {
    id: "self-review",
    term: "Self-review risk",
    definition:
      "The person who checks the work also does part of that work, so the check is not independent. Ask someone else to do it.",
    tabs: ["monthly"],
  },
  {
    id: "unverified",
    term: "Unverified",
    definition:
      "Nobody has checked this case record against its source yet. Open the source link to read the original.",
    tabs: ["start", "precog"],
  },
  {
    id: "pioneer",
    term: "Pioneer",
    definition:
      "Precog's assistant; it answers from your own records. It uses only Precog's own figures.",
    tabs: ["pioneer", "start"],
  },
  {
    id: "plain-tactical",
    term: "Plain and Tactical",
    definition:
      "Two ways to word the same screens: Plain uses everyday words, and Tactical uses the words an accountant uses. The numbers are the same in both.",
    tabs: [
      "start",
      "team",
      "sod",
      "knowledge",
      "procedures",
      "monthly",
      "map",
      "precog",
      "pioneer",
      "scores",
    ],
  },
];

/** The page's own words first, then every other word, each list in glossary order. */
export function glossaryForTab(tab: NavTarget): {
  here: GlossaryTerm[];
  other: GlossaryTerm[];
} {
  const target = resolveNavTarget(tab);
  const id = target && "tab" in target ? target.tab : null;
  const here = GLOSSARY.filter((t) => id !== null && t.tabs.includes(id));
  return { here, other: GLOSSARY.filter((t) => !here.includes(t)) };
}
