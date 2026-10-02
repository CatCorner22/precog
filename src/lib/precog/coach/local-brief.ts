import { resolveTemplate } from "../active-template";
import { registerAssessed } from "../continuity/register-state";
import { CONTROL_CATALOG } from "../evidence/controls";
import { runLocalAgentLoop, type LocalAgentRun } from "../llm/agent-loop";
import { BRIEF_SECTION, renderDecision } from "../llm/agent-brief";
import { readSpofData } from "../llm/spof-data";
import type { ToolContext } from "../llm/tools";
import type { PioneerDecision, StructuredBrief, ToolResult } from "../llm/types";
import type { PracticeProfile } from "../practice-profile";
import { insuranceFigureNote, policyDefaultsInForce } from "../scoring/dynamic-variables";
import {
  REGISTER_NOT_ASSESSED,
  confirmedScenarioIds,
  isOwnBusiness,
  starterScenarioLabel,
  starterScenariosLeftOut,
} from "../scoring/scope";
import { detectSodConflicts, sodDetectionOptions, type DetectedConflict } from "../sod/detect";
import { openFindings, partialDualReleaseCoverage } from "../sod/open-findings";
import type { IndustryTemplate } from "../templates/types";
import { closingSteps } from "../controls/dual-release-wording";
import { personLabel } from "../person-label";
import { count, firstName, joinWithAnd, midSentence, verb } from "../text";

/**
 * The local advisor brief, made to answer for this business.
 *
 * The deterministic brief ranks levers across the app's whole model, so an
 * embezzlement question used to come back as "lower the deductible" priced on
 * a premium nobody entered, with the industry example's register items as
 * the people to cross-train. These helpers put the business's own open duty
 * conflicts first, by person, with the bank-statement step the owner can do
 * alone, keep insurance levers out while the policy figures are the app's
 * defaults, and answer a question about someone leaving with what stops.
 */

/** One person's open duty conflicts, worst first. */
interface PersonConflicts {
  personId: string;
  personName: string;
  role: string;
  conflicts: DetectedConflict[];
}

/** A rules brief for this business; `partial` when only the conflict-only brief could be built. */
interface LocalBrief extends LocalAgentRun {
  partial: boolean;
}

/** The question the coach answers when the owner sends none. */
export const DEFAULT_COACH_QUESTION =
  "Brief me on my biggest risks, the conditions Precog watches, and what to do this week.";

/**
 * The deterministic local brief with this business's own duty conflicts first
 * and no insurance lever on default policy figures. If the full brief cannot
 * be computed for this profile, a brief built from the team's conflicts alone
 * answers instead of an error, marked `partial` and logged with its cause.
 */
export function localBrief(
  question: string,
  ctx: ToolContext,
  profile: PracticeProfile,
): LocalBrief {
  const started = Date.now();
  const tpl = resolveTemplate(profile);
  const people = openConflictsByPerson(profile, tpl);
  try {
    const result = runLocalAgentLoop(question, ctx);
    return {
      ...result,
      brief: ownFirstBrief(result.brief, profile, question, {
        tpl,
        people,
        toolResults: result.toolResults,
      }),
      latencyMs: Date.now() - started,
      partial: false,
    };
  } catch (e) {
    console.error(
      `[pioneer] local brief fell back to the conflict-only brief (${e instanceof Error ? e.name : typeof e})`,
      e,
    );
    return {
      source: "local-agent",
      question,
      steps: [],
      toolsUsed: [],
      toolResults: [],
      brief: fallbackBrief(profile, question, { tpl, people }),
      contextFingerprint: "fallback",
      latencyMs: Date.now() - started,
      partial: true,
    };
  }
}

/**
 * The business's open duty conflicts grouped by person, counted as every
 * screen counts them (sod/open-findings `openFindings`): employees only (an
 * owner-held pair is not a theft path), and not covered by dual release at
 * every amount. People with the worst pair come first.
 */
export function openConflictsByPerson(
  profile: Pick<
    PracticeProfile,
    | "industry"
    | "staff"
    | "dualRelease"
    | "customPeople"
    | "customProcesses"
    | "customKnowledge"
    | "customRelations"
  >,
  tpl: IndustryTemplate = resolveTemplate(profile),
): PersonConflicts[] {
  const sod = detectSodConflicts(tpl, profile.staff, sodDetectionOptions(tpl, profile.dualRelease));
  const byPerson = new Map<string, PersonConflicts>();
  const partial = partialDualReleaseCoverage(profile.dualRelease, sod.conflicts);
  for (const c of openFindings(sod.conflicts, partial)) {
    const entry = byPerson.get(c.personId) ?? {
      personId: c.personId,
      personName: c.personName,
      role: c.role,
      conflicts: [],
    };
    entry.conflicts.push(c);
    byPerson.set(c.personId, entry);
  }
  const worst = (p: PersonConflicts) =>
    Math.min(...p.conflicts.map((c) => SEVERITY_ORDER[c.severity]));
  const top = (p: PersonConflicts) => Math.max(...p.conflicts.map((c) => c.score));
  return [...byPerson.values()].sort(
    (a, b) => worst(a) - worst(b) || top(b) - top(a) || a.personName.localeCompare(b.personName),
  );
}

/**
 * A brief built from this business's own records alone, for when the full
 * local brief cannot be computed. It says so rather than failing the request.
 */
export function fallbackBrief(
  profile: PracticeProfile,
  question: string,
  known: { tpl?: IndustryTemplate; people?: PersonConflicts[] } = {},
): StructuredBrief {
  const tpl = known.tpl ?? resolveTemplate(profile);
  const people = known.people ?? openConflictsByPerson(profile, tpl);
  const statement = ownerStatementDecision();
  const decisions = [
    ...people.slice(0, 3).map((p) => conflictDecision(p, profile)),
    statement,
    ...(registerAssessed(tpl) ? [] : [registerDecision()]),
  ];
  const situation = `**${profile.practiceName}**: ${people.length} ${people.length === 1 ? "person holds" : "people hold"} an open duty conflict. Question: _${question}_`;
  const frontierNextMove = people[0] ? thisWeek(people[0]) : `This week: ${STATEMENT_THIS_WEEK}.`;
  const warning =
    "Pioneer could not compute part of the full brief for this business, so it built this one from your team's duty conflicts alone.";
  const markdown = [
    `## ${BRIEF_SECTION.situation}`,
    situation,
    "",
    `## ${BRIEF_SECTION.thisWeek}`,
    frontierNextMove,
    "",
    `## ${OWN_CONFLICTS}`,
    ...(people.length ? people.slice(0, 5).map(conflictLine) : ["- None open."]),
    "",
    `## ${BRIEF_SECTION.moves}`,
    ...decisions.map(renderDecision),
    "",
  ].join("\n");
  return {
    situation,
    highestRisks: [],
    tradeoffs: [],
    decisions,
    frontierNextMove,
    chickenLittleWarnings: [warning],
    variableCascades: [],
    specialistNotes: [],
    markdown,
    evidence: [],
  };
}

/**
 * Questions about theft, duties, money or what to do first: the ones a duty
 * conflict answers. Whole words, so "fix" does not fire on "prefix". The
 * default question asks what to do this week, so it leads with conflicts too.
 */
const CONFLICT_QUESTION =
  /\b(embezzl\w*|fraud\w*|steal\w*|stole|theft|sod|segregat\w*|dut(?:y|ies)|conflicts?|fix\w*|this week|protect\w*|cash|money|payments?|vendors?|gaps?)\b/i;

export function isConflictQuestion(question: string): boolean {
  return question === DEFAULT_COACH_QUESTION || CONFLICT_QUESTION.test(question);
}

/** Questions about someone being away or leaving: the ones the register answers. */
const ABSENCE_QUESTION =
  /\b(leav(?:e|es|ing)|quits?|resign\w*|retir\w*|sick|vacation|holiday|away|absen\w*|without)\b/i;

function isAbsenceQuestion(question: string): boolean {
  return ABSENCE_QUESTION.test(question);
}

/** Levers that buy or change insurance rather than a control. */
const INSURANCE_LEVER = /deductible|policy limit|claims load|premium/i;
/** Wording about the terms of a crime policy, which only means something once one is entered. */
const POLICY_TERMS = /deductible|policy limit|claims load/i;

const SEVERITY_ORDER: Record<DetectedConflict["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  family: 3,
};

/**
 * Severity in the words the Start here badges use ("Critical", "High",
 * "Medium"); "fix first" is kept for the residual band it names.
 */
const SEVERITY_WORDS: Record<DetectedConflict["severity"], string> = {
  critical: "a critical duty conflict",
  high: "a high-severity duty conflict",
  medium: "a medium-severity duty conflict",
  family: "a duty conflict",
};

/** Short form for the conflict list: "critical", "high", "medium", "duty conflict". */
const SEVERITY_SHORT: Record<DetectedConflict["severity"], string> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  family: "duty conflict",
};

/** The heading for the business's own conflicts, inserted after the situation. */
const OWN_CONFLICTS = "Your open duty conflicts";
/** The heading for the answer to a question about someone being away. */
const YOUR_QUESTION = "Your question";

/** "set up suppliers and release payments" */
function pairWords(c: Pick<DetectedConflict, "labelA" | "labelB">): string {
  return `${midSentence(c.labelA)} and ${midSentence(c.labelB)}`;
}

/** The owner-doable statement step, phrased for "This week: ...". */
const STATEMENT_THIS_WEEK = "open the bank statement yourself before anyone else handles it";

/** The decision for one person's conflicts: move one duty, and what covers it meanwhile. */
function conflictDecision(
  person: PersonConflicts,
  profile: Pick<PracticeProfile, "dualRelease">,
): PioneerDecision {
  const [first, ...rest] = person.conflicts;
  const also = rest.length
    ? `; also ${rest
        .slice(0, 2)
        .map((c) => pairWords(c))
        .join("; ")}`
    : "";
  const meanwhile = closingSteps(
    first.compensatingControls,
    profile.dualRelease,
    first.ruleId,
    first.controlsInPlace,
  )[0];
  return {
    action: `Give one of ${person.personName}'s duties to someone else: ${midSentence(first.labelA)} or ${midSentence(first.labelB)}`,
    rationale: `${personLabel(person.personName, person.role)} can both ${pairWords(first)}, ${SEVERITY_WORDS[first.severity]}${also}. ${first.why.split(". ")[0].replace(/\.$/, "")}.${meanwhile ? ` Until the duty moves: ${midSentence(meanwhile).replace(/\.$/, "")}.` : ""}`,
    evidenceIds: [],
    effort: "medium",
    horizonDays: 14,
    cascadeEffects: ["duty conflicts ↓", "segregation health ↑"],
    link: { tab: "sod", personId: person.personId },
  };
}

/** The step the owner can take alone this week, from the case library's control catalog. */
function ownerStatementDecision(): PioneerDecision {
  const control = CONTROL_CATALOG["owner-opens-bank-statement"];
  return {
    action: control.label,
    rationale: `${control.why} You can do this yourself this week; it takes minutes and needs nobody else's help.`,
    evidenceIds: [],
    effort: "low",
    horizonDays: 7,
    cascadeEffects: ["detection lag ↓"],
  };
}

/** The register step that replaces generic cross-training advice while nobody is marked. */
function registerDecision(): PioneerDecision {
  return {
    action: "Mark who can do each item on Who knows what",
    rationale: `${REGISTER_NOT_ASSESSED} Until then the brief cannot say who covers what, and it does not guess from the industry sample.`,
    evidenceIds: [],
    effort: "low",
    horizonDays: 7,
    cascadeEffects: ["register accuracy ↑"],
    link: { tab: "knowledge" },
  };
}

/** A lever sequence ("A → B → C") without its insurance steps; null when nothing is left. */
function withoutInsuranceSteps(text: string): string | null {
  if (!text.includes(" → ")) return INSURANCE_LEVER.test(text) ? null : text;
  const parts = text.split(" → ").filter((p) => !INSURANCE_LEVER.test(p));
  return parts.length ? parts.join(" → ") : null;
}

type Section = { heading: string; body: string[] };

function splitSections(markdown: string): Section[] {
  const out: Section[] = [];
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) out.push({ heading: line.slice(3), body: [] });
    else if (out.length) out[out.length - 1].body.push(line);
    else out.push({ heading: "", body: [line] });
  }
  return out;
}

function joinSections(sections: Section[]): string {
  return sections
    .map((s) => (s.heading ? [`## ${s.heading}`, ...s.body] : s.body).join("\n"))
    .join("\n");
}

/** Plain day wording in place of the percentile label the lever model prints. */
function dayWording(line: string): string {
  return line.replace(/\bp50 ([+-]?\d+)d\b/g, "assumed days until found $1");
}

/** "- **Grace Kim** (Bookkeeper): set up suppliers and release payments (critical)" */
function conflictLine(p: PersonConflicts): string {
  const pairs = p.conflicts
    .slice(0, 3)
    .map((c) => `${pairWords(c)} (${SEVERITY_SHORT[c.severity]})`)
    .join("; ");
  return `- **${p.personName}** (${p.role}): ${pairs}`;
}

/** The one move for the next seven days when a conflict leads. */
function thisWeek(p: PersonConflicts): string {
  const c = p.conflicts[0];
  return `This week: give one of ${p.personName}'s duties (${midSentence(c.labelA)} or ${midSentence(c.labelB)}) to someone else, and ${STATEMENT_THIS_WEEK}.`;
}

/** Decisions about who can run the work: cross-training, hand-offs, leavers, the register. */
function isContinuityDecision(d: PioneerDecision): boolean {
  return (
    d.link?.tab === "knowledge" ||
    /cross-train|\btrain\b|hand off|hand-over|covers|who takes|is back|leaves|as left|register/i.test(
      d.action,
    )
  );
}

/**
 * The answer to "if X leaves, what breaks?": the register items only the
 * person the question names can run, or, when it names nobody on the
 * register, the items only one person can run. Null when the tool did not run.
 */
function absenceAnswer(question: string, toolResults: ToolResult[]): string[] | null {
  const spof = readSpofData(toolResults.find((t) => t.tool === "get_knowledge_spofs")?.data);
  if (!spof) return null;
  if (!spof.assessed) {
    return [
      "Who knows what does not mark anyone yet, so Precog cannot say what stops when someone is away. Mark who can do each item first.",
    ];
  }
  const soleRows = spof.rows.filter((r) => r.owners.length === 1);
  const owners = [...new Map(soleRows.map((r) => [r.owners[0].name, r.owners[0]])).values()];
  const named = owners.find((o) =>
    [o.name, firstName(o.name), o.role ?? ""].some((words) => mentions(question, words)),
  );
  if (named) {
    const theirs = soleRows.filter((r) => r.owners[0].name === named.name);
    const who = named.role ? personLabel(named.name, named.role) : named.name;
    return [
      `If ${who} is away or leaves, ${count(theirs.length, "item stops", "items stop")}, because nobody else can run ${verb(theirs.length, "it", "them")} alone: ${joinWithAnd(theirs.map((r) => r.name))}.`,
      ...(theirs[0]?.nextStep ? [`First: ${theirs[0].nextStep}`] : []),
    ];
  }
  if (soleRows.length === 0) {
    return [
      "Nothing on Who knows what rests on one person alone, so no single absence stops an item outright.",
    ];
  }
  return [
    `The question names nobody marked on Who knows what, so here is what stops when its only runner is away: ${joinWithAnd(
      soleRows.slice(0, 5).map((r) => `${r.name} (only ${r.owners[0].name})`),
      5,
    )}.`,
  ];
}

/** Whether the question names these words as whole words ("Jordan", "front desk lead"). */
function mentions(question: string, words: string): boolean {
  const trimmed = words.trim();
  if (trimmed.length < 2) return false;
  const pattern = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${pattern}\\b`, "i").test(question);
}

/**
 * The brief with this business's own conflicts first, no insurance lever
 * while the policy figures are defaults, and a direct answer to a question
 * about someone being away. Pure: the same inputs give the same result.
 */
function ownFirstBrief(
  brief: StructuredBrief,
  profile: PracticeProfile,
  question: string,
  known: { tpl: IndustryTemplate; people: PersonConflicts[]; toolResults: ToolResult[] },
): StructuredBrief {
  const { tpl, people } = known;
  const ownBusiness = isOwnBusiness(tpl);
  const stripInsurance = policyDefaultsInForce(profile.riskVariables);
  const policyNote = insuranceFigureNote(profile.riskVariables, ownBusiness);
  const absence = isAbsenceQuestion(question) ? absenceAnswer(question, known.toolResults) : null;
  const leadWithConflicts = !absence && isConflictQuestion(question) && people.length > 0;
  const assessed = registerAssessed(tpl);

  let decisions = brief.decisions.flatMap((d) => {
    if (!stripInsurance) return [d];
    const action = withoutInsuranceSteps(d.action);
    return action ? [{ ...d, action }] : [];
  });
  if (!assessed) {
    // Cross-training advice needs a register someone filled in; until then the
    // one register step is to fill it in.
    let replaced = false;
    decisions = decisions.flatMap((d) => {
      if (!/cross-train|train a second person/i.test(d.action)) return [d];
      if (replaced) return [];
      replaced = true;
      return [registerDecision()];
    });
  }
  const statement = ownerStatementDecision();
  if (leadWithConflicts) {
    const lead = people.slice(0, 3).map((p) => conflictDecision(p, profile));
    decisions = [...lead, statement, ...decisions.filter((d) => d.action !== statement.action)];
  } else if (absence) {
    decisions = [
      ...decisions.filter(isContinuityDecision),
      ...decisions.filter((d) => !isContinuityDecision(d)),
    ];
  }

  let frontierNextMove = brief.frontierNextMove;
  if (leadWithConflicts) {
    frontierNextMove = thisWeek(people[0]);
  } else if (absence && decisions[0] && isContinuityDecision(decisions[0])) {
    frontierNextMove = `This week: ${midSentence(decisions[0].action)}.`;
  } else if (stripInsurance && INSURANCE_LEVER.test(frontierNextMove)) {
    frontierNextMove = `This week: ${STATEMENT_THIS_WEEK}, then re-check the watched conditions.`;
  }

  const variableCascades = brief.variableCascades
    .filter((l) => !stripInsurance || !POLICY_TERMS.test(l))
    .map((l) =>
      dayWording(policyNote && l.startsWith("Baseline:") ? `${l} Insurance: ${policyNote}.` : l),
    );
  const advancedReasoning = brief.advancedReasoning?.flatMap((l) => {
    if (!stripInsurance) return [l];
    const kept = withoutInsuranceSteps(l);
    return kept ? [kept] : [];
  });

  const conflictLines = people.slice(0, 5).map(conflictLine);

  const sections = splitSections(brief.markdown).flatMap((s): Section[] => {
    switch (s.heading) {
      case BRIEF_SECTION.situation:
        if (absence) return [s, { heading: YOUR_QUESTION, body: [...absence, ""] }];
        return leadWithConflicts
          ? [
              s,
              {
                heading: OWN_CONFLICTS,
                body: [
                  ...conflictLines,
                  `- The step you can take alone: **${statement.action.replace(/\.$/, "")}**.`,
                  "",
                ],
              },
            ]
          : [s];
      case BRIEF_SECTION.cascades:
        return [{ heading: s.heading, body: [...variableCascades.map((c) => `- ${c}`), ""] }];
      case BRIEF_SECTION.order:
        return [
          {
            heading: s.heading,
            body: [...(advancedReasoning ?? []).map((x) => `- ${dayWording(x)}`), ""],
          },
        ];
      case BRIEF_SECTION.moves:
        return [{ heading: s.heading, body: [...decisions.map(renderDecision), ""] }];
      case BRIEF_SECTION.thisWeek:
        return [{ heading: s.heading, body: [frontierNextMove, ""] }];
      default:
        return [s];
    }
  });

  // Any other line that quotes a premium or a retained loss on default policy
  // figures says so (a "$0" change between levers is not a policy figure).
  const labelPremium = (line: string) =>
    policyNote && /\b(premium|retained) \$[1-9][\d,]*/.test(line) && !line.includes(policyNote)
      ? `${line} (${policyNote})`
      : line;
  // A starter scenario the owner has not confirmed is named as the example's.
  const starterTitles = starterScenariosLeftOut(
    tpl,
    confirmedScenarioIds(profile.decisions, profile.industry),
  ).map((sc) => sc.title);
  const starterTag = `(${starterScenarioLabel(profile.industry).replace(/^Sample scenarios/, "sample scenario")}, not counted in your totals)`;
  const labelStarter = (line: string) =>
    starterTitles.some((t) => line.includes(t)) && !line.includes(starterTag)
      ? `${line} ${starterTag}`
      : line;
  // General insurance guidance (what a deductible or a policy limit does) is
  // about a policy this business has not entered; it stays out with the levers.
  const policyTalk = (line: string) => stripInsurance && POLICY_TERMS.test(line);
  const markdown = joinSections(sections)
    .split("\n")
    .filter((line) => !(line.startsWith("- ") && policyTalk(line)))
    .map((line) => labelStarter(labelPremium(dayWording(line))))
    .join("\n");

  return {
    ...brief,
    decisions,
    frontierNextMove,
    variableCascades,
    advancedReasoning,
    tradeoffs: brief.tradeoffs.filter((t) => !policyTalk(t)),
    specialistNotes: brief.specialistNotes.map((n) => ({
      ...n,
      bullets: n.bullets.filter((b) => !policyTalk(b)),
    })),
    evidence: brief.evidence.map((e) =>
      e.metric ? { ...e, metric: labelPremium(dayWording(e.metric)) } : e,
    ),
    markdown,
  };
}
