import { resolveTemplate } from "../active-template";
import { formatDayRange, shiftDay } from "../dates";
import { todayBrief } from "../continuity/today";
import { registerAssessed } from "../continuity/register-state";
import { CONTROL_CATALOG, controlForIndustry } from "../evidence/controls";
import { runPrecogScenario } from "../engine";
import type { IndustryId } from "../industry";
import { runLocalAgentLoop, type LocalAgentRun } from "../llm/agent-loop";
import { BRIEF_SECTION, destack, leverAction, renderDecision } from "../llm/agent-brief";
import { describeScenarioFigures, type ScenarioRunData } from "../llm/scenario-tools";
import { readSpofData } from "../llm/spof-data";
import type { ToolContext } from "../llm/tools";
import type { PioneerDecision, StructuredBrief, ToolResult } from "../llm/types";
import type { PracticeProfile } from "../practice-profile";
import {
  DEFAULT_RISK_VARIABLES,
  insuranceFigureNote,
  policyDefaultsInForce,
} from "../scoring/dynamic-variables";
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
import type { ScenarioTemplate } from "../types";
import { closingSteps } from "../controls/dual-release-wording";
import { dutiesOffTeam } from "../onboarding/setup-answers";
import { personLabel } from "../person-label";
import { scenarioUnfolding } from "../scenario-unfolding";
import { dutyFacts, knowledgeFact, scenarioRuleIds, scenarioWatch } from "../scenario-watch";
import { count, firstName, joinWithAnd, midSentence, verb } from "../text";
import { matchScenarios, mentionsScenario } from "./scenario-question";

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
      today: ctx.today,
    });
    return {
      ...result,
      brief,
      steps: result.steps.map((step) => {
        const detail =
          step.title === "Wrote the brief from Precog's rules"
            ? `${brief.decisions.length} recommended moves · ${brief.specialistNotes.length} review lenses`
            : step.detail;
        return {
          ...step,
          title: destack(step.title),
          detail: destack(detail),
        };
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
      brief: fallbackBrief(profile, question, { tpl, people, totals, today: ctx.today }),
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
  known: {
    tpl?: IndustryTemplate;
    people?: PersonConflicts[];
    totals?: OpenConflictTotals;
    today?: string;
    toolResults?: ToolResult[];
  } = {},
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
      ? `**${profile.practiceName}**: ${totalSentence(totals, people.length)}.`
      : `**${profile.practiceName}**: no open duty conflicts.`;
  const frontierNextMove = people[0] ? thisWeek(people[0]) : `This week: ${STATEMENT_THIS_WEEK}.`;
  const warning =
    "Pioneer could not compute part of the full brief for this business, so it built this one from your team's duty conflicts alone.";
  const markdown = [
    `## ${BRIEF_SECTION.situation}`,
    situation,
    "",
    `## ${BRIEF_SECTION.thisWeek}`,
    thisWeekBody(frontierNextMove),
    "",
    `## ${BRIEF_SECTION.moves}`,
    ...decisions.map(renderDecision),
    "",
    `## ${BRIEF_SECTION.warnings}`,
    `- ${warning}`,
    "",
    `## ${BRIEF_SECTION.limits}`,
    "- Rankings use Precog's weights, not a measurement of this business.",
    "",
  ].join("\n");
  const fallback: StructuredBrief = {
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
  try {
    return ownFirstBrief(fallback, profile, question, {
      tpl,
      people,
      totals,
      toolResults: known.toolResults ?? [],
      today: known.today,
    });
  } catch {
    return fallback;
  }
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
const OUT_TODAY_QUESTION =
  /\b(?:(?:who|anyone|anybody)(?:'s|\s+is|\s+are)?\s+(?:out|off|away|absent)\b|out\s+(?:today|sick|now)\b|off\s+sick\b|called\s+in\s+sick\b)/i;
const FUTURE_PERIOD =
  /\b(?:tomorrow|next|upcoming|soon|later|weekend|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|will)\b/i;

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

/** Short form for the conflict list: "critical", "high", "medium", "duty conflict". */
const SEVERITY_SHORT: Record<DetectedConflict["severity"], string> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  family: "duty conflict",
};

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

/** "- **Grace Kim**: set up suppliers and release payments" */
function conflictLine(p: PersonConflicts): string {
  const pairs = p.conflicts
    .slice(0, 1)
    .map((c) => `${pairWords(c)} (${SEVERITY_SHORT[c.severity]})`)
    .join("; ");
  const more = p.conflicts.length > 1 ? `; ${p.conflicts.length - 1} more conflicts` : "";
  return `- **${p.personName}**: ${pairs}${more}`;
}

/** The one move for the next seven days when a conflict leads. */
function thisWeek(p: PersonConflicts): string {
  return `This week: move one of ${p.personName}'s duties to someone else, and ${STATEMENT_THIS_WEEK}.`;
}

function thisWeekBody(line: string): string {
  const body = line.replace(/^This week:\s*/, "");
  return body ? `${body.charAt(0).toUpperCase()}${body.slice(1)}` : body;
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

function outTodayAnswer(
  profile: PracticeProfile,
  tpl: IndustryTemplate,
  today: string | undefined,
): string[] | null {
  if (today === undefined) return null;
  const brief = todayBrief(
    tpl,
    profile.plannedAbsences ?? [],
    profile.decisions,
    profile.industry,
    today,
  );
  const lines =
    brief.out.length === 0
      ? [
          "Nobody is recorded as out today. When someone calls in, press Someone is out at the top of the page.",
        ]
      : [];

  for (const out of brief.out) {
    lines.push(
      `- ${out.person.name} is out today (${out.unplanned ? "unplanned" : "planned leave"}).`,
    );
    if (!brief.assessed) continue;
    if (out.stops.length === 0) {
      lines.push("  - Nothing rests on them alone.");
      continue;
    }
    for (const stop of out.stops.slice(0, 5)) {
      lines.push(
        `  - ${stop.item.name}: ${stop.standIn ? `${stop.standIn.name} covers${stop.cold ? ", starting cold" : ""}` : "nobody left can pick it up"}; hand-off ${stop.handoffLogged ? "logged" : "not logged yet"}.`,
      );
    }
    if (out.stops.length > 5) {
      lines.push(`  - and ${out.stops.length - 5} more`);
    }
  }

  if (brief.out.length > 0 && !brief.assessed) {
    lines.push("Who knows what does not mark anyone yet, so Precog cannot say what stops.");
  }
  if (brief.startingSoon.length > 0) {
    lines.push(
      `Starting within a week: ${brief.startingSoon
        .map(
          (upcoming) =>
            `${firstName(upcoming.person.name)} (${formatDayRange(upcoming.window.absence.from, upcoming.window.absence.to)})`,
        )
        .join(", ")}.`,
    );
  }
  return lines;
}

function upcomingAbsenceAnswer(
  profile: PracticeProfile,
  tpl: IndustryTemplate,
  today: string | undefined,
  question: string,
): string[] | null {
  if (today === undefined) return null;

  let from: string;
  let to: string;
  let period: string;
  if (/\btomorrow\b/i.test(question)) {
    from = shiftDay(today, 1);
    to = from;
    period = "tomorrow";
  } else if (/\bnext\s+week\b/i.test(question)) {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    from = shiftDay(today, (8 - weekday) % 7 || 7);
    to = shiftDay(from, 6);
    period = "next week";
  } else {
    from = shiftDay(today, 1);
    to = shiftDay(today, 30);
    period = "in the next 30 days";
  }

  const people = new Map(tpl.people.map((person) => [person.id, person]));
  const lines = (profile.plannedAbsences ?? [])
    .filter((absence) => absence.from <= to && absence.to >= from)
    .flatMap((absence) => {
      const person = people.get(absence.personId);
      return person ? [{ absence, person }] : [];
    })
    .sort((a, b) => a.absence.from.localeCompare(b.absence.from))
    .map(({ absence, person }) => {
      const year =
        absence.from.slice(0, 4) === absence.to.slice(0, 4) ? `, ${absence.to.slice(0, 4)}` : "";
      const label = absence.unplanned ? "unplanned absence" : "planned leave";
      return `- ${person.name}: ${label} ${formatDayRange(absence.from, absence.to)}${year}.`;
    });

  return lines.length > 0
    ? lines
    : [
        `Nobody is recorded as out ${period}. Add known leave under Who knows what → Someone is out.`,
      ];
}

/** Whether the question names these words as whole words ("Jordan", "front desk lead"). */
function mentions(question: string, words: string): boolean {
  const trimmed = words.trim();
  if (trimmed.length < 2) return false;
  const pattern = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${pattern}\\b`, "i").test(question);
}

/** The scenario answer for a question that asks about a named scenario, or null. */
export function scenarioAnswer(
  question: string,
  tpl: IndustryTemplate,
  profile: PracticeProfile,
  people: PersonConflicts[] = [],
  today?: string,
): string[] | null {
  const scenarios = matchScenarios(question, tpl.scenarios);
  return scenarios.length ? scenarioAnswerLines(scenarios, profile, tpl, people, today) : null;
}

function scenarioAnswerLines(
  scenarios: readonly ScenarioTemplate[],
  profile: PracticeProfile,
  tpl: IndustryTemplate,
  people: PersonConflicts[],
  today?: string,
): string[] {
  const outTodayIds = new Set(
    today
      ? todayBrief(
          tpl,
          profile.plannedAbsences ?? [],
          profile.decisions,
          profile.industry,
          today,
        ).out.map((out) => out.person.id)
      : [],
  );
  const openConflicts = people.flatMap((person) => person.conflicts);
  const starterIds = new Set(
    starterScenariosLeftOut(tpl, confirmedScenarioIds(profile.decisions, profile.industry)).map(
      (scenario) => scenario.id,
    ),
  );
  const starterTag = `(${starterScenarioLabel(profile.industry).replace(/^Sample scenarios/, "sample scenario")}, not counted in your totals)`;
  const lines: string[] = [];

  for (const scenario of scenarios) {
    const title = starterIds.has(scenario.id)
      ? `### ${scenario.title} ${starterTag}`
      : `### ${scenario.title}`;
    lines.push(title, scenario.description, "");
    const unfolding = scenarioUnfolding(scenario.id);
    if (unfolding) {
      lines.push(
        "**How it unfolds**",
        ...unfolding.steps.map((step, index) => `${index + 1}. ${step}`),
        "",
        "**Warning signs**",
        ...unfolding.warningSigns.slice(0, 3).map((sign) => `- ${sign}`),
        "",
      );
    }

    const watch = scenarioWatch(
      tpl,
      scenario,
      openConflicts,
      outTodayIds,
      dutiesOffTeam(profile.setupAnswers),
    );
    const facts: string[] = [];
    if (scenarioRuleIds(scenario).length > 0) {
      facts.push(...dutyFacts(watch).map((fact) => `- ${fact}`));
    }
    if (watch.control) {
      facts.push(
        `- "${watch.control.name}" ${watch.control.inPlace ? "is marked in place." : "is not marked in place."}`,
      );
    }
    if (watch.knowledge) {
      facts.push(`- ${knowledgeFact(watch.knowledge)}`);
      if (watch.knowledge.outToday.length > 0) {
        facts.push(`- ${joinWithAnd(watch.knowledge.outToday)} out today.`);
      }
    }
    if (facts.length > 0) lines.push("**In your business now**", ...facts, "");

    const mitigations = scenario.mitigations.map((mitigation) => mitigation.label);
    if (mitigations.length > 0) {
      lines.push(`**What stops it:** ${mitigations.join("; ")}.`);
    }
    const result = runPrecogScenario(tpl, scenario.id, {
      staff: profile.staff,
      riskVariables: profile.riskVariables ?? DEFAULT_RISK_VARIABLES,
    });
    if (result) {
      const data: Pick<ScenarioRunData, "retained" | "timelineDays" | "dynamic"> = {
        retained: result.retainedImpact,
        timelineDays: result.timelineDays,
        dynamic: result.dynamic ?? null,
      };
      lines.push(`**Precog's assumptions:** ${describeScenarioFigures(data)}.`);
    }
    lines.push("");
  }
  return lines;
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
    today?: string;
  },
): StructuredBrief {
  const { tpl, people } = known;
  const ownBusiness = isOwnBusiness(tpl);
  const stripInsurance = policyDefaultsInForce(profile.riskVariables);
  const policyNote = insuranceFigureNote(profile.riskVariables, ownBusiness);
  const scenarios = matchScenarios(question, tpl.scenarios);
  const absence = OUT_TODAY_QUESTION.test(question)
    ? FUTURE_PERIOD.test(question)
      ? upcomingAbsenceAnswer(profile, tpl, known.today, question)
      : outTodayAnswer(profile, tpl, known.today)
    : isAbsenceQuestion(question)
      ? absenceAnswer(question, known.toolResults)
      : null;
  const leadWithConflicts =
    !absence && scenarios.length === 0 && isConflictQuestion(question) && people.length > 0;
  const assessed = registerAssessed(tpl);

  let decisions = brief.decisions.flatMap((d) => {
    const action = leverAction(d.action);
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

  const scenarioMove =
    decisions[0] && scenarios[0] && mentionsScenario(decisions[0].action, scenarios[0])
      ? decisions[0]
      : null;
  let frontierNextMove = leverAction(brief.frontierNextMove);
  if (leadWithConflicts) {
    frontierNextMove = thisWeek(people[0]);
  } else if (absence && decisions[0] && isContinuityDecision(decisions[0])) {
    frontierNextMove = `This week: ${midSentence(decisions[0].action)}.`;
  } else if (scenarioMove) {
    frontierNextMove = `This week: ${midSentence(scenarioMove.action)}.`;
  } else if (stripInsurance && INSURANCE_LEVER.test(frontierNextMove)) {
    frontierNextMove = `This week: ${STATEMENT_THIS_WEEK}, then re-check the watched conditions.`;
  }

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
  const postProcess = (line: string) => destack(labelStarter(labelPremium(dayWording(line))));
  // General insurance guidance (what a deductible or a policy limit does) is
  // about a policy this business has not entered; it stays out with the levers.
  const policyTalk = (line: string) => stripInsurance && POLICY_TERMS.test(line);
  const variableCascades = brief.variableCascades
    .filter((line) => !policyTalk(line))
    .map(postProcess);
  const advancedReasoning = brief.advancedReasoning?.flatMap((line) => {
    if (!stripInsurance) return [postProcess(line)];
    const kept = withoutInsuranceSteps(line);
    return kept ? [postProcess(kept)] : [];
  });
  const tradeoffs = brief.tradeoffs.filter((line) => !policyTalk(line)).map(postProcess);
  const specialistNotes = brief.specialistNotes.map((note) => ({
    ...note,
    title: postProcess(note.title),
    bullets: note.bullets.filter((line) => !policyTalk(line)).map(postProcess),
  }));
  const sourceSections = splitSections(brief.markdown);
  const sourceSection = (heading: string) =>
    sourceSections.find((section) => section.heading === heading);
  const warnings =
    sourceSection(BRIEF_SECTION.warnings)?.body.filter((line) => line.trim()) ??
    brief.chickenLittleWarnings.map((warning) => `- ${warning}`);
  const watchedConditions = sourceSection("Watched conditions")?.body.filter((line) => line.trim());
  const answer =
    scenarios.length > 0
      ? [
          ...scenarioAnswerLines(scenarios, profile, tpl, people, known.today),
          ...(absence ? ["", ...absence] : []),
        ]
      : absence
        ? absence
        : leadWithConflicts
          ? [
              `- ${totalSentence(known.totals, people.length)}.`,
              ...people.slice(0, 3).map(conflictLine),
              ...(people.length > 3 ? [`- and ${people.length - 3} more`] : []),
              `- The step you can take alone: **${statement.action.replace(/\.$/, "")}**.`,
            ]
          : null;
  const sections: Section[] = [
    ...(answer ? [{ heading: BRIEF_SECTION.answer, body: [...answer, ""] }] : []),
    { heading: BRIEF_SECTION.situation, body: [brief.situation, ""] },
    { heading: BRIEF_SECTION.thisWeek, body: [thisWeekBody(frontierNextMove), ""] },
    { heading: BRIEF_SECTION.moves, body: [...decisions.map(renderDecision), ""] },
    {
      heading: BRIEF_SECTION.warnings,
      body: [...warnings, ...(watchedConditions ?? []), ""],
    },
  ];
  const risks = (
    sourceSection(BRIEF_SECTION.risks)?.body.filter((line) => line.trim()) ?? []
  ).flatMap((line) => (line.startsWith(`**${BRIEF_SECTION.cases}**`) ? ["", line] : [line]));
  if (risks.length > 0) sections.push({ heading: BRIEF_SECTION.risks, body: [...risks, ""] });
  const limits = sourceSection(BRIEF_SECTION.limits)?.body.filter((line) => line.trim()) ?? [];
  if (limits.length > 0) sections.push({ heading: BRIEF_SECTION.limits, body: [...limits, ""] });
  const markdown = joinSections(sections)
    .split("\n")
    .filter((line) => !(line.startsWith("- ") && policyTalk(line)))
    .map(postProcess)
    .join("\n");
  const chickenLittleWarnings = brief.chickenLittleWarnings
    .filter((line) => !policyTalk(line))
    .map(postProcess);

  return {
    ...brief,
    decisions,
    frontierNextMove,
    variableCascades,
    advancedReasoning,
    tradeoffs,
    specialistNotes,
    chickenLittleWarnings,
    evidence: brief.evidence.flatMap((item) => {
      const label = postProcess(item.label);
      const metric = item.metric ? postProcess(item.metric) : undefined;
      if (policyTalk(label) || (metric && policyTalk(metric))) return [];
      return [{ ...item, label, ...(metric ? { metric } : {}) }];
    }),
    markdown,
  };
}
