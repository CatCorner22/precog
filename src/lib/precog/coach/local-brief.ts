import { resolveTemplate } from "../active-template";
import { registerAssessed } from "../continuity/register-state";
import { CONTROL_CATALOG } from "../evidence/controls";
import { runLocalAgentLoop } from "../llm/agent-loop";
import type { ToolContext } from "../llm/tools";
import type { AgentRunResult, PioneerDecision, StructuredBrief } from "../llm/types";
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
import { closingSteps } from "./first-steps";
import { personLabel } from "../person-label";

/**
 * The local advisor brief, made to answer for this business.
 *
 * The deterministic brief ranks levers across the app's whole model, so an
 * embezzlement question used to come back as "lower the deductible" priced on
 * a premium nobody entered, with the industry example's register items as
 * the people to cross-train. These helpers put the business's own open duty
 * conflicts first, by person, with the bank-statement step the owner can do
 * alone, and keep insurance levers out while the policy figures are the app's
 * defaults.
 */

/** Questions about theft, duties or what to do first: the ones a duty conflict answers. */
const CONFLICT_QUESTION =
  /embezzl|fraud|steal|stole|theft|sod\b|segregat|dut(y|ies)|conflict|fix|this week|protect|cash|money|payment|vendor|gap|brief/i;

export function isConflictQuestion(question: string): boolean {
  return CONFLICT_QUESTION.test(question);
}

/** Levers that buy or change insurance rather than a control. */
const INSURANCE_LEVER = /deductible|policy limit|claims load|premium/i;
/** Wording about the terms of a crime policy, which only means something once one is entered. */
const POLICY_TERMS = /deductible|policy limit|claims load/i;

/** One person's open duty conflicts, worst first. */
export interface PersonConflicts {
  personId: string;
  personName: string;
  role: string;
  conflicts: DetectedConflict[];
}

const SEVERITY_ORDER: Record<DetectedConflict["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  family: 3,
};

/**
 * The business's open duty conflicts grouped by person: employees only (an
 * owner-held pair is not a theft path), not accepted, not covered by dual
 * release at every amount. People with the worst pair come first.
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
): PersonConflicts[] {
  const tpl = resolveTemplate(profile);
  const sod = detectSodConflicts(tpl, profile.staff, sodDetectionOptions(tpl, profile.dualRelease));
  const byPerson = new Map<string, PersonConflicts>();
  for (const c of sod.conflicts) {
    if (c.ownerHeld || c.residualRiskAccepted || c.dualReleaseMitigated) continue;
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

/** Lower-cases the first letter for mid-sentence use, keeping acronyms ("ACH") as written. */
function lower(label: string): string {
  return label.replace(/^([A-Z])(?![A-Z])/, (m) => m.toLowerCase());
}

/** "set up suppliers and release payments" */
function pairWords(c: Pick<DetectedConflict, "labelA" | "labelB">): string {
  return `${lower(c.labelA)} and ${lower(c.labelB)}`;
}

/** The owner-doable statement step, phrased for "This week: ...". */
const STATEMENT_THIS_WEEK = "open the bank statement yourself before anyone else handles it";

/** The decision for one person's conflicts: move one duty, and what covers it meanwhile. */
export function conflictDecision(
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
    action: `Give one of ${person.personName}'s duties to someone else: ${lower(first.labelA)} or ${lower(first.labelB)}`,
    rationale: `${personLabel(person.personName, person.role)} can both ${pairWords(first)}, a ${first.severity === "family" ? "duty" : first.severity} conflict${also}. ${first.why.split(". ")[0].replace(/\.$/, "")}.${meanwhile ? ` Until the duty moves: ${lower(meanwhile).replace(/\.$/, "")}.` : ""}`,
    evidenceIds: [],
    effort: "medium",
    horizonDays: 14,
    cascadeEffects: ["duty conflicts ↓", "segregation health ↑"],
  };
}

/** The step the owner can take alone this week, from the case library's control catalog. */
export function ownerStatementDecision(): PioneerDecision {
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
    rationale: `${REGISTER_NOT_ASSESSED} Until then the brief cannot say who covers what, and it does not guess from the industry example.`,
    evidenceIds: [],
    effort: "low",
    horizonDays: 7,
    cascadeEffects: ["register accuracy ↑"],
  };
}

/** A lever sequence ("A → B → C") without its insurance steps; null when nothing is left. */
function withoutInsuranceSteps(text: string): string | null {
  if (!text.includes(" → ")) return INSURANCE_LEVER.test(text) ? null : text;
  const parts = text.split(" → ").filter((p) => !INSURANCE_LEVER.test(p));
  return parts.length ? parts.join(" → ") : null;
}

function renderDecision(d: PioneerDecision, i: number): string {
  const c = d.cascadeEffects?.length ? ` *Also moves:* ${d.cascadeEffects.join("; ")}.` : "";
  return `${i + 1}. **${d.action}** (${d.effort} · ${d.horizonDays}d): ${d.rationale}${c}`;
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
    .map((c) => `${pairWords(c)} (${c.severity})`)
    .join("; ");
  return `- **${p.personName}** (${p.role}): ${pairs}`;
}

/** The one move for the next seven days when a conflict leads. */
function thisWeek(p: PersonConflicts): string {
  const c = p.conflicts[0];
  return `This week: give one of ${p.personName}'s duties (${lower(c.labelA)} or ${lower(c.labelB)}) to someone else, and ${STATEMENT_THIS_WEEK}.`;
}

/**
 * The brief with this business's own conflicts first and no insurance lever
 * while the policy figures are defaults. Pure: the same brief and profile give
 * the same result.
 */
export function ownFirstBrief(
  brief: StructuredBrief,
  profile: PracticeProfile,
  question: string,
): StructuredBrief {
  const tpl = resolveTemplate(profile);
  const ownBusiness = isOwnBusiness(tpl);
  const stripInsurance = policyDefaultsInForce(profile.riskVariables);
  const policyNote = insuranceFigureNote(profile.riskVariables, ownBusiness);
  const people = openConflictsByPerson(profile);
  const leadWithConflicts = isConflictQuestion(question) && people.length > 0;
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
      if (!/cross-train/i.test(d.action)) return [d];
      if (replaced) return [];
      replaced = true;
      return [registerDecision()];
    });
  }
  const statement = ownerStatementDecision();
  if (leadWithConflicts) {
    const lead = people.slice(0, 3).map((p) => conflictDecision(p, profile));
    decisions = [...lead, statement, ...decisions.filter((d) => d.action !== statement.action)];
  }

  let frontierNextMove = brief.frontierNextMove;
  if (leadWithConflicts) {
    frontierNextMove = thisWeek(people[0]);
  } else if (stripInsurance && INSURANCE_LEVER.test(frontierNextMove)) {
    frontierNextMove = `This week: ${STATEMENT_THIS_WEEK}, then re-check the leading indicators.`;
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
      case "Situation":
        return leadWithConflicts
          ? [
              s,
              {
                heading: "Your open duty conflicts",
                body: [
                  ...conflictLines,
                  `- The step you can take alone: **${statement.action.replace(/\.$/, "")}**.`,
                  "",
                ],
              },
            ]
          : [s];
      case "Variable cascades (what else moves)":
        return [{ heading: s.heading, body: [...variableCascades.map((c) => `- ${c}`), ""] }];
      case "Lever ordering (this app's model)":
        return [
          {
            heading: s.heading,
            body: [...(advancedReasoning ?? []).map((x) => `- ${dayWording(x)}`), ""],
          },
        ];
      case "Recommended moves":
        return [{ heading: s.heading, body: [...decisions.map(renderDecision), ""] }];
      case "Frontier next move":
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
  const starterTag = `(${starterScenarioLabel(profile.industry).replace(/^Starter scenarios/, "starter scenario")}, not counted in your totals)`;
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

/**
 * A brief built from this business's own records alone, for when the full
 * local brief cannot be computed. It says so rather than failing the request.
 */
export function fallbackBrief(profile: PracticeProfile, question: string): StructuredBrief {
  const tpl = resolveTemplate(profile);
  const people = openConflictsByPerson(profile);
  const statement = ownerStatementDecision();
  const decisions = [
    ...people.slice(0, 3).map((p) => conflictDecision(p, profile)),
    statement,
    ...(registerAssessed(tpl) ? [] : [registerDecision()]),
  ];
  const situation = `**${profile.practiceName}**: ${people.length} ${people.length === 1 ? "person holds" : "people hold"} an open duty conflict. Question: _${question}_`;
  const frontierNextMove = people[0] ? thisWeek(people[0]) : `This week: ${STATEMENT_THIS_WEEK}.`;
  const warning =
    "Part of the full brief could not be computed for this business, so this one is built from your team's duty conflicts alone.";
  const markdown = [
    "## Situation",
    situation,
    "",
    "## Your open duty conflicts",
    ...(people.length ? people.slice(0, 5).map(conflictLine) : ["- None open."]),
    "",
    "## Recommended moves",
    ...decisions.map(renderDecision),
    "",
    "## Frontier next move",
    frontierNextMove,
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
 * The deterministic local brief with this business's own duty conflicts first
 * and no insurance lever on default policy figures. If the full brief cannot
 * be computed for this profile, a brief built from the team's conflicts alone
 * answers instead of an error.
 */
export function localBrief(
  question: string,
  ctx: ToolContext,
  profile: PracticeProfile,
): AgentRunResult {
  try {
    const result = runLocalAgentLoop(question, ctx);
    return { ...result, brief: ownFirstBrief(result.brief, profile, question) };
  } catch (e) {
    console.error("[pioneer] local brief fell back to the conflict-only brief", e);
    return {
      ok: true,
      source: "local-agent",
      question,
      steps: [],
      toolsUsed: [],
      brief: fallbackBrief(profile, question),
      contextFingerprint: "fallback",
      latencyMs: 0,
    };
  }
}
