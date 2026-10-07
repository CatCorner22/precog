import { resolveTemplate } from "../active-template";
import { registerAssessed } from "../continuity/register-state";
import { CONTROL_CATALOG, controlForIndustry } from "../evidence/controls";
import { runPrecogScenario } from "../engine";
import type { IndustryId } from "../industry";
import { runLocalAgentLoop, type LocalAgentRun } from "../llm/agent-loop";
import { BRIEF_SECTION, leverLabel, renderDecision, renderThisWeekLine } from "../llm/agent-brief";
import { readSpofData } from "../llm/spof-data";
import { describeScenarioFigures } from "../llm/scenario-tools";
import type { ToolContext } from "../llm/tools";
import type { PioneerDecision, StructuredBrief, ToolResult } from "../llm/types";
import type { PracticeProfile } from "../practice-profile";
import { scenarioUnfolding } from "../scenario-unfolding";
import { insuranceFigureNote, policyDefaultsInForce } from "../scoring/dynamic-variables";
import {
  REGISTER_NOT_ASSESSED,
  confirmedScenarioIds,
  isOwnBusiness,
  starterScenarioLabel,
  starterScenariosLeftOut,
} from "../scoring/scope";
import {
  detectSodConflicts,
  SEVERITY_RANK,
  sodDetectionOptions,
  type DetectedConflict,
} from "../sod/detect";
import { partialDualReleaseCoverage } from "../sod/open-findings";
import {
  openConflictBreakdown,
  openConflictHeadline,
  type OpenConflictTotals,
} from "../headline/open-conflicts";
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

/** The internal suffix on a bundled lever's label ("Cameras + dual release (stack)"). */
const STACK_SUFFIX = / \(stack\)/g;

/** The text without a bundled lever's internal suffix, as `leverLabel` shows it. */
function unstack(text: string): string {
  return text.replace(STACK_SUFFIX, "");
}

/** The question the coach answers when the owner sends none. */
export const DEFAULT_COACH_QUESTION = "What are my biggest risks, and what do I do this week?";

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
  const { people, totals } = ownConflicts(profile, tpl);
  try {
    const result = runLocalAgentLoop(question, ctx);
    const brief = ownFirstBrief(result.brief, profile, question, {
      tpl,
      people,
      totals,
      toolResults: result.toolResults,
    });
    return {
      ...result,
      // A bundled lever's internal " (stack)" suffix never reaches the owner,
      // in the brief (leverLabel) or in the steps.
      steps: result.steps.map((step) => ({
        ...step,
        title: unstack(step.title),
        detail:
          step.phase === "synthesize"
            ? `${brief.decisions.length} recommended moves · ${brief.specialistNotes.length} review lenses`
            : unstack(step.detail),
      })),
      brief,
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
      brief: fallbackBrief(profile, question, { tpl, people, totals }),
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
  profile: ConflictProfile,
  tpl: IndustryTemplate = resolveTemplate(profile),
): PersonConflicts[] {
  return ownConflicts(profile, tpl).people;
}

/** The profile fields the duty-conflict check reads. */
type ConflictProfile = Pick<
  PracticeProfile,
  | "industry"
  | "staff"
  | "dualRelease"
  | "customPeople"
  | "customProcesses"
  | "customKnowledge"
  | "customRelations"
>;

/**
 * The open duty conflicts by person, and their total as every screen gives it
 * (headline/open-conflicts `openConflictHeadline`), from one run of the check.
 */
function ownConflicts(
  profile: ConflictProfile,
  tpl: IndustryTemplate,
): { people: PersonConflicts[]; totals: OpenConflictTotals } {
  const sod = detectSodConflicts(tpl, profile.staff, sodDetectionOptions(tpl, profile.dualRelease));
  const byPerson = new Map<string, PersonConflicts>();
  const headline = openConflictHeadline(
    sod,
    partialDualReleaseCoverage(profile.dualRelease, sod.conflicts),
  );
  for (const c of headline.findings) {
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
    Math.min(...p.conflicts.map((c) => SEVERITY_RANK[c.severity]));
  const top = (p: PersonConflicts) => Math.max(...p.conflicts.map((c) => c.score));
  const people = [...byPerson.values()].sort(
    (a, b) => worst(a) - worst(b) || top(b) - top(a) || a.personName.localeCompare(b.personName),
  );
  return { people, totals: headline };
}

/**
 * "20 open duty conflicts (4 critical · 15 high · 1 other), held by 3
 * people": the total the Start here tile, the duty-conflict tab and the
 * report give.
 */
function totalSentence(totals: OpenConflictTotals, people: number): string {
  return `${count(totals.open, "open duty conflict")} (${openConflictBreakdown(totals)}), held by ${count(people, "person", "people")}`;
}

/**
 * A brief built from this business's own records alone, for when the full
 * local brief cannot be computed. It says so rather than failing the request.
 */
export function fallbackBrief(
  profile: PracticeProfile,
  question: string,
  known: { tpl?: IndustryTemplate; people?: PersonConflicts[]; totals?: OpenConflictTotals } = {},
): StructuredBrief {
  const tpl = known.tpl ?? resolveTemplate(profile);
  const { people, totals } =
    known.people && known.totals
      ? { people: known.people, totals: known.totals }
      : ownConflicts(profile, tpl);
  const statement = ownerStatementDecision(profile.industry);
  const decisions = [
    ...people.slice(0, 3).map((p) => conflictDecision(p, profile)),
    statement,
    ...(registerAssessed(tpl) ? [] : [registerDecision()]),
  ];
  const situation =
    totals.open > 0
      ? `**${profile.practiceName}**: ${totalSentence(totals, people.length)}. Question: _${question}_`
      : `**${profile.practiceName}**: no open duty conflicts. Question: _${question}_`;
  const frontierNextMove = people[0] ? thisWeek(people[0]) : `This week: ${STATEMENT_THIS_WEEK}.`;
  const warning =
    "Pioneer could not compute part of the full brief for this business, so it built this one from your team's duty conflicts alone.";
  const markdown = [
    `## ${BRIEF_SECTION.situation}`,
    situation,
    "",
    `## ${BRIEF_SECTION.thisWeek}`,
    renderThisWeekLine(frontierNextMove),
    "",
    `## ${OWN_CONFLICTS}`,
    ...(people.length ? people.slice(0, 5).map(conflictLine) : ["- None open."]),
    "",
    `## ${BRIEF_SECTION.moves}`,
    ...decisions.map(renderDecision),
    "",
    `## ${BRIEF_SECTION.limits}`,
    "- Rankings use Precog's weights, not a measurement of this business.",
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

/**
 * Severity in the words the Start here badges use ("Critical", "High",
 * "Medium"); "Fix first" is kept for the priority list's top band.
 */
const SEVERITY_WORDS: Record<DetectedConflict["severity"], string> = {
  critical: "a critical duty conflict",
  high: "a high-severity duty conflict",
  medium: "a medium-severity duty conflict",
  family: "a duty conflict",
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
const STATEMENT_THIS_WEEK = "open the bank statement yourself, before anyone else";

/** The decision for one person's conflicts: move one duty, and what covers it meanwhile. */
function conflictDecision(
  person: PersonConflicts,
  profile: Pick<PracticeProfile, "dualRelease">,
): PioneerDecision {
  const [first] = person.conflicts;
  const severity = SEVERITY_WORDS[first.severity].replace(/^a /, "");
  const reason = first.why.split(". ")[0].replace(/\.$/, "");
  const meanwhile = closingSteps(
    first.compensatingControls,
    profile.dualRelease,
    first.ruleId,
    first.controlsInPlace,
  )[0];
  return {
    action: `Give one of ${person.personName}'s duties to someone else: ${midSentence(first.labelA)} or ${midSentence(first.labelB)}`,
    rationale: `${severity.charAt(0).toUpperCase()}${severity.slice(1)}: ${reason}.${meanwhile ? ` Until it moves: ${midSentence(meanwhile).replace(/\.$/, "")}.` : ""}`,
    evidenceIds: [],
    effort: "medium",
    horizonDays: 14,
    cascadeEffects: ["duty conflicts ↓", "segregation health ↑"],
    link: { tab: "sod", personId: person.personId },
  };
}

/** The step the owner can take alone this week, from the case library's control catalog. */
function ownerStatementDecision(industry: IndustryId): PioneerDecision {
  const control = controlForIndustry(CONTROL_CATALOG["owner-opens-bank-statement"], industry);
  return {
    action: control.label,
    rationale: `${control.why} You can do this yourself this week; it takes minutes.`,
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

/**
 * "- **Grace Kim**: set up suppliers and release payments; 2 more": the
 * person's worst pair, and how many more they hold. The total line above the
 * list gives the one open-conflict count, so each person's line stays short.
 */
function conflictLine(p: PersonConflicts): string {
  const more = p.conflicts.length - 1;
  return `- **${p.personName}**: ${pairWords(p.conflicts[0])}${more > 0 ? `; ${more} more` : ""}`;
}

/** The one move for the next seven days when a conflict leads. */
function thisWeek(p: PersonConflicts): string {
  return `This week: move one of ${p.personName}'s duties to someone else, and ${STATEMENT_THIS_WEEK}.`;
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

const SCENARIO_QUESTION = /\b(scenario|walk me through|compare|what would happen|how would)\b/i;
const SCENARIO_STOP_WORDS = new Set([
  "about",
  "after",
  "before",
  "could",
  "every",
  "first",
  "from",
  "money",
  "never",
  "other",
  "person",
  "posted",
  "someone",
  "their",
  "there",
  "these",
  "those",
  "through",
  "under",
  "until",
  "which",
  "while",
  "without",
  "would",
]);

/** A question that asks for two scenarios side by side. */
const COMPARE_QUESTION = /\b(compare|versus|vs\.?)\b/i;

/**
 * Match a scenario only when the question asks about scenarios and names one.
 * The scenario whose own words the question uses most is the one it names
 * (one shared word such as "payments" does not outrank a title the question
 * quotes); a comparison takes the two strongest, in the order the question
 * names them.
 */
export function scenarioAnswer(
  question: string,
  tpl: IndustryTemplate,
  profile: PracticeProfile,
): string[] | null {
  if (!SCENARIO_QUESTION.test(question)) return null;
  const matches = tpl.scenarios
    .map((scenario, templateIndex) => {
      const hitIndexes = [...scenarioKeywords(scenario)]
        .map((keyword) => scenarioKeywordPattern(keyword).exec(question)?.index ?? -1)
        .filter((index) => index >= 0);
      return {
        scenario,
        templateIndex,
        score: hitIndexes.length,
        firstHit: hitIndexes.length ? Math.min(...hitIndexes) : -1,
      };
    })
    .filter((match) => match.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.firstHit - b.firstHit || a.templateIndex - b.templateIndex,
    )
    .slice(0, COMPARE_QUESTION.test(question) ? 2 : 1)
    .sort((a, b) => a.firstHit - b.firstHit || a.templateIndex - b.templateIndex);
  if (!matches.length) return null;

  const answers: string[] = [];
  for (const { scenario } of matches) {
    const result = runPrecogScenario(tpl, scenario.id, {
      staff: profile.staff,
      riskVariables: profile.riskVariables,
    });
    if (!result) continue;
    if (answers.length) answers.push("");
    const unfolding = scenarioUnfolding(scenario.id);
    answers.push(
      `**${scenario.title}**: ${describeScenarioFigures({
        retained: result.retainedImpact,
        timelineDays: result.timelineDays,
        dynamic: result.dynamic ?? null,
      })}`,
    );
    if (unfolding?.steps.length) {
      answers.push("How it unfolds:", ...unfolding.steps.map((step, i) => `${i + 1}. ${step}`));
    }
    if (unfolding?.warningSigns.length) {
      answers.push("Warning signs:", ...unfolding.warningSigns.map((sign) => `- ${sign}`));
    }
  }
  return answers.length ? answers : null;
}

function scenarioKeywords(scenario: IndustryTemplate["scenarios"][number]): Set<string> {
  const titleWords = scenario.title.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const idWords = scenario.id.replace(/^sc-/, "").toLowerCase().split("-");
  return new Set([
    ...titleWords.filter((word) => word.length >= 5 && !SCENARIO_STOP_WORDS.has(word)),
    ...idWords.filter((word) => !SCENARIO_STOP_WORDS.has(word)),
  ]);
}

function scenarioKeywordPattern(keyword: string): RegExp {
  const pattern =
    keyword === "writeoff"
      ? "write(?:[-\\s]?off)s?"
      : keyword === "skim"
        ? "skim(?:m(?:ing|ed)|s)?"
        : `${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?`;
  return new RegExp(`\\b${pattern}\\b`, "i");
}

function scenarioMoveIsRelevant(
  action: string,
  scenario: IndustryTemplate["scenarios"][number],
): boolean {
  return [...scenarioKeywords(scenario)].some((keyword) =>
    scenarioKeywordPattern(keyword).test(action),
  );
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
  known: {
    tpl: IndustryTemplate;
    people: PersonConflicts[];
    totals: OpenConflictTotals;
    toolResults: ToolResult[];
  },
): StructuredBrief {
  const { tpl, people } = known;
  const ownBusiness = isOwnBusiness(tpl);
  const stripInsurance = policyDefaultsInForce(profile.riskVariables);
  const policyNote = insuranceFigureNote(profile.riskVariables, ownBusiness);
  const absence = isAbsenceQuestion(question) ? absenceAnswer(question, known.toolResults) : null;
  const scenario = absence ? null : scenarioAnswer(question, tpl, profile);
  const leadWithConflicts = !absence && isConflictQuestion(question) && people.length > 0;
  const assessed = registerAssessed(tpl);

  let decisions = brief.decisions.flatMap((d) => {
    const action = leverLabel(d.action);
    if (!stripInsurance) return [{ ...d, action }];
    const kept = withoutInsuranceSteps(action);
    return kept ? [{ ...d, action: kept }] : [];
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
  const statement = ownerStatementDecision(profile.industry);
  if (leadWithConflicts) {
    const lead = people.slice(0, 3).map((p) => conflictDecision(p, profile));
    decisions = [...lead, statement, ...decisions.filter((d) => d.action !== statement.action)];
  } else if (absence) {
    decisions = [
      ...decisions.filter(isContinuityDecision),
      ...decisions.filter((d) => !isContinuityDecision(d)),
    ];
  }

  const scenarioTitle = scenario?.[0] ? /^\*\*(.+?)\*\*:/.exec(scenario[0])?.[1] : undefined;
  const scenarioTemplate = tpl.scenarios.find((s) => s.title === scenarioTitle);
  const scenarioMove =
    decisions[0] &&
    scenarioTemplate &&
    scenarioMoveIsRelevant(decisions[0].action, scenarioTemplate)
      ? decisions[0]
      : null;
  let frontierNextMove = leverLabel(brief.frontierNextMove);
  if (leadWithConflicts) {
    frontierNextMove = thisWeek(people[0]);
  } else if (absence && decisions[0] && isContinuityDecision(decisions[0])) {
    frontierNextMove = `This week: ${midSentence(decisions[0].action)}.`;
  } else if (scenarioMove) {
    frontierNextMove = `This week: ${midSentence(scenarioMove.action)}.`;
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
  const verifyNext = advancedReasoning?.find((line) =>
    line.startsWith("Most useful thing to verify next:"),
  );

  const conflictLines = people.slice(0, 5).map(conflictLine);

  const sections = splitSections(brief.markdown).flatMap((s): Section[] => {
    switch (s.heading) {
      case BRIEF_SECTION.situation:
        if (absence) return [s, { heading: YOUR_QUESTION, body: [...absence, ""] }];
        if (scenario) return [s, { heading: YOUR_QUESTION, body: [...scenario, ""] }];
        return leadWithConflicts
          ? [
              s,
              {
                heading: OWN_CONFLICTS,
                body: [
                  `- ${totalSentence(known.totals, people.length)}.`,
                  ...conflictLines,
                  `- The step you can take alone: **${statement.action.replace(/\.$/, "")}**.`,
                  "",
                ],
              },
            ]
          : [s];
      case BRIEF_SECTION.cascades:
        return [{ heading: s.heading, body: [...variableCascades.map((c) => `- ${c}`), ""] }];
      case BRIEF_SECTION.limits:
        return [
          {
            heading: s.heading,
            body: [
              ...(brief.tradeoffs[0] ? [`- ${brief.tradeoffs[0]}`] : []),
              ...(verifyNext ? [`- ${verifyNext}`] : []),
              "- Rankings use Precog's weights, not a measurement of this business.",
              "",
            ],
          },
        ];
      case BRIEF_SECTION.moves:
        return [{ heading: s.heading, body: [...decisions.map(renderDecision), ""] }];
      case BRIEF_SECTION.thisWeek:
        return [{ heading: s.heading, body: [renderThisWeekLine(frontierNextMove), ""] }];
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
      bullets: n.bullets.filter((b) => !policyTalk(b)).map(unstack),
    })),
    evidence: brief.evidence.map((e) => ({
      ...e,
      label: unstack(e.label),
      ...(e.metric ? { metric: unstack(labelPremium(dayWording(e.metric))) } : {}),
    })),
    markdown,
  };
}
