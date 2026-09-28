import { shownSteps } from "./lifecycle";
import type { Place, Procedure, ProcedureStep } from "./types";

/**
 * The writing screen: a deterministic check of how a procedure is written,
 * against four standards. It reads only the words, never changes them, and
 * gives the same result for the same text every time.
 *
 * - Clarity: each word has one meaning. No "should" or "shall" (say "must"
 *   for a requirement, "may" for a choice, or state the condition), no
 *   "and/or", no vague words, one action per step.
 * - Consistency: one term for one thing (not "log in" in one step and "sign
 *   in" in another), and every step ends the same way.
 * - Completeness: why the task matters and what done looks like, when it is
 *   done, where, and an instruction in every step.
 * - Active voice: every step starts with what to do, and no sentence hides
 *   who acts ("the bag is sealed").
 *
 * An error blocks verification: nobody can confirm the steps work as written
 * while the writing leaves a backup to guess. The procedure can still be
 * saved as a draft. Advice never blocks anything.
 */

export type WritingStandard = "clarity" | "consistency" | "completeness" | "active-voice";

export const WRITING_STANDARD_LABEL: Record<WritingStandard, string> = {
  clarity: "Clarity",
  consistency: "Consistency",
  completeness: "Completeness",
  "active-voice": "Active voice",
};

export interface WritingIssue {
  /** Stable key for the rule, and the step or field when it is about one. */
  id: string;
  standard: WritingStandard;
  /** True for an error, which blocks verification; false for advice. */
  blocking: boolean;
  /** What to do, as an instruction. */
  title: string;
  /** Why it matters, in one sentence. */
  why: string;
  /** The step it is about, numbered as the procedure shows it (1-based). */
  step?: number;
}

/** A step longer than this usually holds more than one action. */
const LONG_STEP = 200;

// A step that opens with an article or pronoun describes rather than instructs:
// "The drawer is counted" instead of "Count the drawer".
const NOT_A_VERB =
  /^(?:the|a|an|this|that|these|those|it|there|you|we|i|they|he|she|my|our|your|their|someone|somebody|staff|everyone)\b/i;
const CONDITION_START = /^(?:if|when|whenever|once|unless|only if|in case)\b/i;
// A second action joined into the same step; a full stop after "Dr." or "a.m." is not one.
const SECOND_ACTION =
  /\s(?:and then|then|after that|afterwards)\s|;\s*\w|(?<!\b(?:Dr|Mr|Mrs|Ms|St|No|vs|etc|e\.g|i\.e|a\.m|p\.m))[.!?]\s+[A-Z]/;
const VAGUE =
  /\betc\b\.?|\b(?:and so on|as needed|as necessary|if necessary|if needed|when appropriate|appropriate(?:ly)?|properly|correctly|as usual|the usual way|whatever|somehow|stuff|things)\b/i;
// "Should" can mean a requirement, a recommendation or an expectation; "shall" is read both ways too.
const AMBIGUOUS_MODAL = /\b(?:should|shall|ought to)\b/i;
const AND_OR = /\band\s*\/\s*or\b/i;
const LATIN = /\b(?:e\.g\.|i\.e\.)/i;
const DOUBLE_NEGATIVE =
  /\bnot\s+(?:uncommon|unusual|unlike|unreasonable|unimportant|unnecessary|infrequent|insignificant|impossible|unlikely)\b/i;

// A form of "be" or "get" followed by a past participle: "is sealed", "was paid", "gets approved".
const IRREGULAR_PARTICIPLES =
  "made|done|sent|kept|paid|put|set|left|held|sold|bought|brought|told|shown|found|run|cut|read|built|spent|given|taken|written|known|seen|drawn|chosen|broken|stolen|lost|won|hidden|shut|split|begun|forgotten|gotten|meant|struck|thrown|worn|torn|met|bound|caught|dealt|heard|laid|led|lent|sought|taught|thought|understood|beaten|driven|eaten|forgiven|frozen|grown|shaken|spoken|sworn|withdrawn|overpaid|underpaid|mislaid|misread|withheld|upheld|rebuilt|resold|rewritten|reset|rerun|overdrawn";
const PASSIVE = new RegExp(
  String.raw`\b(?:am|is|are|was|were|be|been|being|gets?|got|gotten)\s+(?:(?:not|never|also|then|already|still|just|only|all|each|both|\w+ly)\s+)*(\w+ed|${IRREGULAR_PARTICIPLES})\b`,
  "gi",
);
// Words ending in "ed" that describe a state or are not participles at all ("the safe is locked", "the flag is red").
const NOT_PASSIVE = new Set([
  "locked",
  "unlocked",
  "closed",
  "attached",
  "connected",
  "red",
  "bed",
  "shed",
  "need",
  "feed",
  "seed",
  "speed",
  "hundred",
  "based",
]);

/** Words for the same thing; a procedure that uses more than one of a family reads as two things. */
const TERM_FAMILIES: { thing: string; variants: [label: string, re: RegExp][] }[] = [
  {
    thing: "signing in",
    variants: [
      ["log in", /\blog(?:s|ged|ging)?[\s-]?in(?:to)?\b|\blogins?\b/i],
      ["sign in", /\bsign(?:s|ed|ing)?[\s-]?in(?:to)?\b/i],
      ["log on", /\blog(?:s|ged|ging)?[\s-]?on(?:to)?\b|\blogons?\b/i],
    ],
  },
  {
    thing: "signing out",
    variants: [
      ["log out", /\blog(?:s|ged|ging)?[\s-]?out\b|\blogouts?\b/i],
      ["log off", /\blog(?:s|ged|ging)?[\s-]?off\b/i],
      ["sign out", /\bsign(?:s|ed|ing)?[\s-]?out\b/i],
    ],
  },
  {
    thing: "email",
    variants: [
      ["email", /\bemails?\b/i],
      ["e-mail", /\be-mails?\b/i],
    ],
  },
  {
    thing: "the name you sign in with",
    variants: [
      ["username", /\busernames?\b/i],
      ["user name", /\buser names?\b/i],
      ["user ID", /\buser[\s-]?ids?\b/i],
    ],
  },
  {
    thing: "the secret you sign in with",
    variants: [
      ["password", /\bpasswords?\b/i],
      ["passcode", /\bpass[\s-]?codes?\b/i],
    ],
  },
  {
    thing: "a box to tick",
    variants: [
      ["checkbox", /\bcheckbox(?:es)?\b/i],
      ["check box", /\bcheck boxes\b|\bcheck box\b/i],
      ["tick box", /\btick[\s-]?box(?:es)?\b/i],
    ],
  },
  {
    thing: "a list to choose from",
    variants: [
      ["drop-down", /\bdrop-downs?\b/i],
      ["dropdown", /\bdropdowns?\b/i],
      ["pull-down", /\bpull-?downs?\b/i],
    ],
  },
  {
    thing: "the OK button",
    variants: [
      ["OK", /\bOK\b/],
      ["Okay", /\bokay\b/i],
    ],
  },
];

/** The first passive construction in `text`, or null: "is sealed". */
export function findPassive(text: string): string | null {
  for (const m of text.matchAll(PASSIVE)) {
    if (!NOT_PASSIVE.has(m[1].toLowerCase())) return m[0];
  }
  return null;
}

/** Every writing issue in `p`: errors first, then advice; procedure-wide before step by step. */
export function screenProcedureWriting(
  p: Procedure,
  context: { place?: Place | null } = {},
): WritingIssue[] {
  const out: WritingIssue[] = [];
  const add = (issue: WritingIssue) => out.push(issue);
  const steps = shownSteps(p);
  const written = steps.filter((s) => s.text.trim());

  // Completeness.
  if (written.length === 0) {
    add({
      id: "steps",
      standard: "completeness",
      blocking: true,
      title: "Write the steps.",
      why: "Without steps, nobody else can do the task when the usual person is away.",
    });
  }
  const purpose = p.purpose?.trim() ?? "";
  if (!purpose) {
    add({
      id: "purpose",
      standard: "completeness",
      blocking: true,
      title: "Say why the task matters and what done looks like (“Done when …”).",
      why: "A backup who knows the goal can tell when something has gone wrong.",
    });
  } else if (!/\b(?:done|finished|complete)\s+when\b/i.test(purpose)) {
    add({
      id: "done",
      standard: "completeness",
      blocking: true,
      title: "Add what done looks like to the purpose, starting “Done when …”.",
      why: "Without it, a backup cannot tell whether they have finished.",
    });
  }
  if (!p.trigger?.trim() && !p.cadence) {
    add({
      id: "trigger",
      standard: "completeness",
      blocking: true,
      title: "Say when to do it.",
      why: "A backup cannot cover a task they do not know is due.",
    });
  }
  if (!p.placeId && !p.module?.trim()) {
    add({
      id: "where",
      standard: "completeness",
      blocking: true,
      title: "Say where to do it: the platform or place, and the screen.",
      why: "The first thing a backup needs is where to start.",
    });
  }
  if (context.place?.kind === "software" && p.prerequisites.length === 0) {
    add({
      id: "prerequisites",
      standard: "completeness",
      blocking: false,
      title: "List the sign-in and anything else a backup needs before starting.",
      why: "A backup who finds out halfway through that they have no access stops there.",
    });
  }

  // Clarity, consistency and active voice in the text around the steps.
  const around: [field: string, text: string][] = [
    ["title", p.title],
    ["purpose", purpose],
    ["trigger", p.trigger ?? ""],
    ...p.prerequisites.map((t, i): [string, string] => [`prerequisite-${i + 1}`, t]),
  ];
  const fieldName = (field: string) =>
    field.startsWith("prerequisite-")
      ? `item ${field.slice("prerequisite-".length)} of what you need first`
      : field === "trigger"
        ? "when to do it"
        : `the ${field}`;
  for (const [field, text] of around) {
    if (!text.trim()) continue;
    for (const issue of wordingIssues(text)) {
      add({
        ...issue,
        id: `${issue.id}:${field}`,
        title: `In ${fieldName(field)}: ${issue.title}`,
      });
    }
    const passive = field === "title" ? null : findPassive(text);
    if (passive) {
      add({
        id: `passive:${field}`,
        standard: "active-voice",
        blocking: true,
        title: `In ${fieldName(field)}: rewrite “${passive}” to say who does it.`,
        why: "A sentence in the passive voice hides who acts, so nobody may act.",
      });
    }
  }

  // Consistency across the whole procedure.
  const allText = [
    p.title,
    purpose,
    p.trigger ?? "",
    ...p.prerequisites,
    ...steps.flatMap((s) => [s.text, s.caution ?? ""]),
  ].join("\n");
  for (const family of TERM_FAMILIES) {
    const used = family.variants.filter(([, re]) => re.test(allText)).map(([label]) => label);
    if (used.length > 1) {
      add({
        id: `terms:${family.thing}`,
        standard: "consistency",
        blocking: true,
        title: `Use one term for ${family.thing}; it says ${used.map((u) => `“${u}”`).join(" and ")}.`,
        why: "Two words for one thing make a backup wonder whether they are two things.",
      });
    }
  }
  const ends = written.map((s) => /[.!?:)"”’]$/.test(s.text.trim()));
  const withStop = ends.filter(Boolean).length;
  if (withStop > 0 && withStop < ends.length) {
    add({
      id: "punctuation",
      standard: "consistency",
      blocking: false,
      title: `End every step the same way; ${withStop} of ${ends.length} end with a full stop.`,
      why: "Steps that look alike read as a set a backup can follow in order.",
    });
  }

  steps.forEach((s, i) => stepWritingIssues(s, i + 1).forEach(add));
  return out.sort((a, b) => Number(b.blocking) - Number(a.blocking));
}

/** The errors in `p` that block verification. */
export function verificationBlockers(p: Procedure): WritingIssue[] {
  return screenProcedureWriting(p).filter((i) => i.blocking);
}

/** The writing issues in one step, numbered as the procedure shows it. */
export function stepWritingIssues(s: ProcedureStep, step: number): WritingIssue[] {
  const text = s.text.trim();
  const out: WritingIssue[] = [];
  const key = (rule: string) => `${rule}:${s.id}`;
  if (!text) {
    // Shown because it has a caution, pictures or the photo flag, but it says nothing to do.
    out.push({
      id: key("instruction"),
      standard: "completeness",
      blocking: true,
      step,
      title: "Write the instruction for this step.",
      why: "A caution or a picture alone does not tell a backup what to do.",
    });
  } else {
    const conditional = CONDITION_START.test(text);
    if (!conditional && NOT_A_VERB.test(text)) {
      out.push({
        id: key("verb"),
        standard: "active-voice",
        blocking: true,
        step,
        title: "Start the step with what to do, such as “Count” or “Open”.",
        why: "An instruction is quicker to follow than a description of what happens.",
      });
    }
    const passive = findPassive(text);
    if (passive) {
      out.push({
        id: key("passive"),
        standard: "active-voice",
        blocking: true,
        step,
        title: `Rewrite “${passive}” to say who does it.`,
        why: "A step in the passive voice hides who acts, so nobody may act.",
      });
    }
    if (!conditional && SECOND_ACTION.test(text)) {
      out.push({
        id: key("one-action"),
        standard: "clarity",
        blocking: true,
        step,
        title: "Split this into one action per step.",
        why: "A backup who ticks off a step must have done exactly one thing.",
      });
    } else if (text.length > LONG_STEP) {
      out.push({
        id: key("long"),
        standard: "clarity",
        blocking: false,
        step,
        title: "Shorten this step, or split it.",
        why: "A long step hides the action a backup has to take.",
      });
    }
    out.push(...wordingIssues(text).map((i) => ({ ...i, id: key(i.id), step })));
  }
  const caution = s.caution?.trim();
  if (caution) {
    const passive = findPassive(caution);
    if (passive) {
      out.push({
        id: key("caution-passive"),
        standard: "active-voice",
        blocking: true,
        step,
        title: `In the caution: rewrite “${passive}” to say who does it.`,
        why: "A warning that hides who acts protects nobody.",
      });
    }
    out.push(
      ...wordingIssues(caution).map((i) => ({
        ...i,
        id: key(`caution-${i.id}`),
        step,
        title: `In the caution: ${i.title}`,
      })),
    );
  }
  return out;
}

/** Word-level clarity issues in any text: the id is the rule alone. */
function wordingIssues(text: string): WritingIssue[] {
  const out: WritingIssue[] = [];
  const modal = text.match(AMBIGUOUS_MODAL)?.[0];
  if (modal) {
    out.push({
      id: "modal",
      standard: "clarity",
      blocking: true,
      title: `Replace “${modal}” with “must” for a requirement or “may” for a choice, or state the condition with “if”.`,
      why: `A reader can take “${modal.toLowerCase()}” as an order, a recommendation or an expectation.`,
    });
  }
  if (AND_OR.test(text)) {
    out.push({
      id: "and-or",
      standard: "clarity",
      blocking: true,
      title: "Replace “and/or” with “and”, “or”, or “A or B or both”.",
      why: "“and/or” leaves the reader to decide whether one or both apply.",
    });
  }
  const vague = text.match(VAGUE)?.[0];
  if (vague) {
    out.push({
      id: "vague",
      standard: "clarity",
      blocking: true,
      title: `Replace “${vague}” with exactly what to do.`,
      why: "A backup cannot guess what the usual person means.",
    });
  }
  if (LATIN.test(text)) {
    out.push({
      id: "latin",
      standard: "clarity",
      blocking: false,
      title: "Write “for example” or “that is” instead of “e.g.” or “i.e.”.",
      why: "Readers often confuse the two abbreviations.",
    });
  }
  const doubleNegative = text.match(DOUBLE_NEGATIVE)?.[0];
  if (doubleNegative) {
    out.push({
      id: "double-negative",
      standard: "clarity",
      blocking: false,
      title: `Say “${doubleNegative}” in the positive.`,
      why: "Two negatives make a reader stop and work out what the writer means.",
    });
  }
  return out;
}
