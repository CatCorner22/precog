/**
 * Insurance impact engine. Turns the map + attestations into:
 *   - readiness per line (how an application would read)
 *   - indicative premium ranges (crime anchored on the owner's base premium; cyber
 *     from a revenue/limit table) with the credits and surcharges that drive them
 *   - coverage outlook: what's likely available, sublimited, excluded, or declined
 *   - a change simulator: for each fixable gap, the premium, coverage, and
 *     evidence effect of fixing it, ranked by dollars saved per unit of effort
 *   - scenario coverage gaps: what your top loss scenarios would leave you holding
 *
 * Indicative only. Not a quote, binder, or interpretation of any policy.
 */
import { getActiveTemplate } from "../active-template";
import { detectSodConflicts } from "../sod/detect";
import { mitigatedSodRuleIds, type DualReleasePolicy } from "../controls/dual-release";
import { rankDangerousScenarios } from "../engine";
import { retainLoss, type RiskVariableState } from "../scoring/dynamic-variables";
import { evidenceStatus } from "../builder/evidence";
import type { ControlItem, ProcessNode, StaffComposition } from "../types";
import {
  QUESTIONS,
  answerQuestion,
  type CoverageEffect,
  type QuestionContext,
  type UnderwritingQuestion,
} from "./questions";
import { REVENUE_BANDS, type AttestationId, type InsuranceLine, type InsuranceProfile } from "./types";

export interface AnsweredQuestion {
  q: UnderwritingQuestion;
  answer: boolean | null;
  /** True when the map has current evidence supporting a "yes". */
  documented: boolean;
}

export interface LineReadiness {
  line: InsuranceLine;
  label: string;
  /** 0–100 weighted share of "yes" answers. */
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  answered: number;
  total: number;
  unanswered: AnsweredQuestion[];
  gaps: AnsweredQuestion[];
  /** Share of "yes" answers that are backed by current evidence. */
  documentedShare: number;
}

export interface PremiumEstimate {
  line: InsuranceLine;
  label: string;
  carried: boolean;
  base: number;
  creditPct: number;
  surchargePct: number;
  claimsLoadPct: number;
  low: number;
  mid: number;
  high: number;
  drivers: { label: string; pct: number; kind: "credit" | "surcharge" | "load" }[];
}

export type CoverageStatus = "available" | "sublimited" | "at_risk" | "likely_declined";

export interface CoverageOutlook {
  line: InsuranceLine;
  label: string;
  status: CoverageStatus;
  headline: string;
  effects: (CoverageEffect & { questionId: string; prompt: string })[];
}

export interface InsuranceMove {
  id: string;
  questionId: string;
  title: string;
  why: string;
  effort: "low" | "medium" | "high";
  costHint: string;
  /** Annual indicative premium saved across all carried lines. */
  premiumDelta: number;
  premiumDeltaPct: number;
  /** Coverage effects that fixing this removes. */
  unlocks: CoverageEffect[];
  /** True when the move can be applied inside Precog (staff / risk variables). */
  applicable: "staff_dual" | "staff_bankrec" | "rv_bonded" | "rv_cameras" | "attest" | "map";
  attestation?: AttestationId;
  /** $ saved per effort unit — the ranking key. */
  valuePerEffort: number;
}

export interface ScenarioGap {
  scenarioId: string;
  title: string;
  grossExpected: number;
  grossHigh: number;
  transferredExpected: number;
  retainedExpected: number;
  retainedHigh: number;
  /** Retained share of the expected loss. */
  retainedShare: number;
  aboveLimit: boolean;
}

export interface InsuranceReport {
  readiness: LineReadiness[];
  overallReadiness: number;
  premiums: PremiumEstimate[];
  totalMid: number;
  totalLow: number;
  totalHigh: number;
  coverage: CoverageOutlook[];
  moves: InsuranceMove[];
  gaps: ScenarioGap[];
  answers: AnsweredQuestion[];
  documentedShare: number;
  generatedAt: string;
}

export const LINE_LABEL: Record<InsuranceLine, string> = {
  crime: "Crime / employee dishonesty",
  cyber: "Cyber liability",
  social_engineering: "Social engineering (BEC) rider",
};

const EFFORT_UNITS = { low: 1, medium: 2.5, high: 5 } as const;

function grade(score: number): LineReadiness["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function tokensMatch(text: string, tokens: string[]) {
  const t = text.toLowerCase();
  return tokens.some((k) => t.includes(k));
}

export interface InsuranceInput {
  profile: InsuranceProfile;
  staff: StaffComposition;
  riskVariables: RiskVariableState;
  dualRelease: DualReleasePolicy;
  processes: ProcessNode[];
  controls: ControlItem[];
}

export function buildQuestionContext(input: InsuranceInput): QuestionContext {
  const { processes, controls } = input;
  const sod = detectSodConflicts(input.staff, { dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(input.dualRelease) });
  const mappedControls = controls.filter((c) => processes.some((p) => p.controlIds.includes(c.id)));
  return {
    staff: input.staff,
    riskVariables: input.riskVariables,
    attestations: input.profile.attestations,
    sodCritical: sod.summary.critical,
    dualReleaseThreshold: input.dualRelease.enabled
      ? (input.dualRelease.rules.find((r) => r.enabled)?.thresholdUsd ?? null)
      : null,
    hasControlLike: (tokens) => mappedControls.some((c) => tokensMatch(`${c.name} ${c.description}`, tokens)),
    evidenceCurrentFor: (tokens) =>
      processes.some((p) =>
        (p.evidence ?? []).some((e) => {
          const s = evidenceStatus(e).status;
          return (s === "current" || s === "due_soon") && tokensMatch(`${e.label} ${p.name}`, tokens);
        }),
      ),
  };
}

export function answerAll(input: InsuranceInput): AnsweredQuestion[] {
  const ctx = buildQuestionContext(input);
  return QUESTIONS.map((q) => {
    const answer = answerQuestion(q, ctx);
    const documented = answer === true && Boolean(q.evidenceHints && ctx.evidenceCurrentFor(q.evidenceHints));
    return { q, answer, documented };
  });
}

export function lineReadiness(line: InsuranceLine, answers: AnsweredQuestion[]): LineReadiness {
  const rel = answers.filter((a) => a.q.lines.includes(line));
  const totalW = rel.reduce((s, a) => s + a.q.weight, 0);
  const yesW = rel.filter((a) => a.answer === true).reduce((s, a) => s + a.q.weight, 0);
  const score = totalW ? Math.round((yesW / totalW) * 100) : 0;
  const yes = rel.filter((a) => a.answer === true);
  return {
    line,
    label: LINE_LABEL[line],
    score,
    grade: grade(score),
    answered: rel.filter((a) => a.answer !== null).length,
    total: rel.length,
    unanswered: rel.filter((a) => a.answer === null),
    gaps: rel.filter((a) => a.answer === false).sort((a, b) => b.q.weight - a.q.weight),
    documentedShare: yes.length ? Math.round((yes.filter((a) => a.documented).length / yes.length) * 100) : 0,
  };
}

/** Cyber base rate table: annual $ per $1M limit by revenue band, small-business market ballpark. */
const CYBER_BASE_PER_M: Record<InsuranceProfile["revenueBand"], number> = {
  under_500k: 1400,
  "500k_1m": 1700,
  "1m_3m": 2200,
  "3m_10m": 3200,
  over_10m: 4800,
};

function cyberBase(p: InsuranceProfile, teamSize: number, industry: string): number {
  const perM = CYBER_BASE_PER_M[p.revenueBand];
  const limitM = Math.max(0.25, p.cyber.limit / 1_000_000);
  // Limits scale sub-linearly; deductible credit is mild.
  const limitFactor = Math.pow(limitM, 0.7);
  const dedFactor = p.cyber.deductible >= 25_000 ? 0.85 : p.cyber.deductible >= 10_000 ? 0.92 : 1;
  const teamFactor = 1 + Math.max(0, teamSize - 5) * 0.02;
  const industryFactor = industry === "dental" ? 1.25 : industry === "professional_services" ? 1.15 : 1; // PHI / client data
  return Math.round(perM * limitFactor * dedFactor * teamFactor * industryFactor);
}

function socialBase(crimeBase: number, sublimit: number): number {
  // Riders typically price as a share of the crime premium, scaled by sublimit.
  return Math.round(crimeBase * 0.18 * Math.max(0.5, Math.min(2, sublimit / 100_000)));
}

export function estimatePremiums(input: InsuranceInput, answers: AnsweredQuestion[]): PremiumEstimate[] {
  const { profile, riskVariables, staff } = input;
  const industry = getActiveTemplate().id;
  const claimsLoadPct = Math.round((riskVariables.claimsLoadFactor - 1) * 100) + profile.priorClaims3y * 8;

  const lines: { line: InsuranceLine; carried: boolean; base: number }[] = [
    { line: "crime", carried: profile.crime.carry, base: riskVariables.basePremiumAnnual },
    { line: "cyber", carried: profile.cyber.carry, base: cyberBase(profile, staff.teamSize, industry) },
    { line: "social_engineering", carried: profile.socialEngineering.carry, base: socialBase(riskVariables.basePremiumAnnual, profile.socialEngineering.sublimit) },
  ];

  return lines.map(({ line, carried, base }) => {
    const rel = answers.filter((a) => a.q.lines.includes(line));
    const drivers: PremiumEstimate["drivers"] = [];
    let credit = 0;
    let surcharge = 0;
    for (const a of rel) {
      const c = a.q.creditPct[line] ?? 0;
      const s = a.q.surchargePct[line] ?? 0;
      if (a.answer === true && c) {
        credit += c;
        drivers.push({ label: a.q.prompt.replace(/\?$/, ""), pct: -c, kind: "credit" });
      } else if (a.answer !== true && s) {
        surcharge += s;
        drivers.push({ label: a.q.prompt.replace(/\?$/, ""), pct: s, kind: "surcharge" });
      }
    }
    const creditCap = line === "crime" ? riskVariables.maxDiscountPct : 35;
    credit = Math.min(credit, creditCap);
    surcharge = Math.min(surcharge, 60);
    if (claimsLoadPct) drivers.push({ label: "Claims history", pct: claimsLoadPct, kind: "load" });
    const mid = Math.round(base * (1 - credit / 100) * (1 + surcharge / 100) * (1 + claimsLoadPct / 100) + (line === "crime" ? riskVariables.underwritingLoadAnnual : 0));
    return {
      line,
      label: LINE_LABEL[line],
      carried,
      base,
      creditPct: credit,
      surchargePct: surcharge,
      claimsLoadPct,
      low: Math.round(mid * 0.85),
      mid,
      high: Math.round(mid * 1.2),
      drivers: drivers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)),
    };
  });
}

export function coverageOutlook(answers: AnsweredQuestion[]): CoverageOutlook[] {
  return (["crime", "cyber", "social_engineering"] as InsuranceLine[]).map((line) => {
    const effects = answers
      .filter((a) => a.q.lines.includes(line) && a.answer !== true)
      .flatMap((a) =>
        a.q.ifNo
          .filter((e) => e.kind !== "none")
          .map((e) => ({ ...e, questionId: a.q.id, prompt: a.q.prompt })),
      );
    const declines = effects.filter((e) => e.kind === "decline");
    const exclusions = effects.filter((e) => e.kind === "exclusion");
    const limits = effects.filter((e) => e.kind === "sublimit" || e.kind === "higher_deductible" || e.kind === "coinsurance");
    const status: CoverageStatus =
      declines.length >= (line === "social_engineering" ? 1 : 2)
        ? "likely_declined"
        : declines.length || exclusions.length >= 2
          ? "at_risk"
          : limits.length || exclusions.length
            ? "sublimited"
            : "available";
    const headline =
      status === "available"
        ? "Standard terms should be available."
        : status === "sublimited"
          ? `Expect ${limits.length} restriction(s) — sublimits, higher deductibles, or coinsurance.`
          : status === "at_risk"
            ? "Key exclusions likely; some carriers will decline."
            : "Most carriers would decline until the gating controls are in place.";
    return { line, label: LINE_LABEL[line], status, headline, effects };
  });
}

function totalCarried(premiums: PremiumEstimate[]) {
  return premiums.filter((p) => p.carried).reduce((s, p) => s + p.mid, 0);
}

export function simulateMoves(input: InsuranceInput, answers: AnsweredQuestion[]): InsuranceMove[] {
  const basePremiums = estimatePremiums(input, answers);
  const baseTotal = totalCarried(basePremiums);
  const moves: InsuranceMove[] = [];

  for (const a of answers) {
    if (a.answer === true) continue;
    // Flip this one answer to yes and re-price.
    const flipped = answers.map((x) => (x.q.id === a.q.id ? { ...x, answer: true } : x));
    const premiums = estimatePremiums(input, flipped);
    const total = totalCarried(premiums);
    // Also count lines not yet carried that this move would unlock — valued at 0 here; shown via `unlocks`.
    const premiumDelta = baseTotal - total;
    const applicable: InsuranceMove["applicable"] =
      a.q.id === "dual_auth_payments"
        ? "staff_dual"
        : a.q.id === "independent_bank_rec"
          ? "staff_bankrec"
          : a.q.id === "background_checks"
            ? "rv_bonded"
            : a.q.id === "cameras_alarm"
              ? "rv_cameras"
              : a.q.id === "segregation"
                ? "map"
                : "attest";
    moves.push({
      id: `move-${a.q.id}`,
      questionId: a.q.id,
      title: a.q.prompt.replace(/^(Do|Are|Is|Has|Does)\s/, "").replace(/\?$/, ""),
      why: a.q.why,
      effort: a.q.effort,
      costHint: a.q.costHint,
      premiumDelta,
      premiumDeltaPct: baseTotal ? Math.round((premiumDelta / baseTotal) * 1000) / 10 : 0,
      unlocks: a.q.ifNo.filter((e) => e.kind !== "none"),
      applicable,
      attestation: a.q.attestation,
      valuePerEffort: Math.round((premiumDelta + a.q.ifNo.filter((e) => e.kind !== "none").length * 150 + a.q.weight * 40) / EFFORT_UNITS[a.q.effort]),
    });
  }
  return moves.sort((a, b) => b.valuePerEffort - a.valuePerEffort);
}

/** Re-price with a set of moves applied together (for the combined banner). */
export function priceWithMoves(input: InsuranceInput, answers: AnsweredQuestion[], questionIds: Set<string>) {
  const flipped = answers.map((x) => (questionIds.has(x.q.id) ? { ...x, answer: true } : x));
  return {
    premiums: estimatePremiums(input, flipped),
    coverage: coverageOutlook(flipped),
    readiness: (["crime", "cyber", "social_engineering"] as InsuranceLine[]).map((l) => lineReadiness(l, flipped)),
  };
}

export function scenarioGaps(input: InsuranceInput, riskVariablesOverride?: Partial<RiskVariableState>): ScenarioGap[] {
  const rv = { ...input.riskVariables, ...(riskVariablesOverride ?? {}) };
  const ranked = rankDangerousScenarios({ staff: input.staff, riskVariables: rv }).slice(0, 6);
  return ranked.map(({ scenario, result }) => {
    const gross = result.financialImpact.expected;
    const high = result.financialImpact.high;
    const rE = retainLoss(gross, rv);
    const rH = retainLoss(high, rv);
    return {
      scenarioId: scenario.id,
      title: scenario.title,
      grossExpected: Math.round(gross),
      grossHigh: Math.round(high),
      transferredExpected: rE.transferred,
      retainedExpected: rE.retained,
      retainedHigh: rH.retained,
      retainedShare: gross ? Math.round((rE.retained / gross) * 100) : 0,
      aboveLimit: high > rv.deductible + rv.policyLimit,
    };
  });
}

export function buildInsuranceReport(input: InsuranceInput): InsuranceReport {
  const answers = answerAll(input);
  const readiness = (["crime", "cyber", "social_engineering"] as InsuranceLine[]).map((l) => lineReadiness(l, answers));
  const premiums = estimatePremiums(input, answers);
  const carried = premiums.filter((p) => p.carried);
  const yes = answers.filter((a) => a.answer === true);
  return {
    readiness,
    overallReadiness: Math.round(readiness.reduce((s, r) => s + r.score, 0) / readiness.length),
    premiums,
    totalMid: carried.reduce((s, p) => s + p.mid, 0),
    totalLow: carried.reduce((s, p) => s + p.low, 0),
    totalHigh: carried.reduce((s, p) => s + p.high, 0),
    coverage: coverageOutlook(answers),
    moves: simulateMoves(input, answers),
    gaps: scenarioGaps(input),
    answers,
    documentedShare: yes.length ? Math.round((yes.filter((a) => a.documented).length / yes.length) * 100) : 0,
    generatedAt: new Date().toISOString(),
  };
}

/** Broker-ready questionnaire export. */
export function questionnaireText(report: InsuranceReport, businessName: string): string {
  const lines: string[] = [`${businessName} — underwriting questionnaire (prepared ${new Date(report.generatedAt).toLocaleDateString("en-US")})`, ""];
  for (const line of ["crime", "cyber", "social_engineering"] as InsuranceLine[]) {
    const r = report.readiness.find((x) => x.line === line)!;
    lines.push(`${LINE_LABEL[line].toUpperCase()} — readiness ${r.score}/100 (${r.grade})`);
    for (const a of report.answers.filter((x) => x.q.lines.includes(line))) {
      const ans = a.answer === null ? "NOT ANSWERED" : a.answer ? "YES" : "NO";
      lines.push(`  [${ans}]${a.documented ? " (documented)" : ""} ${a.q.prompt}`);
    }
    lines.push("");
  }
  lines.push("Indicative model output — not a quote or policy interpretation. Confirm all answers before submission.");
  return lines.join("\n");
}

export function questionnaireCsv(report: InsuranceReport, businessName: string): string {
  const rows = [
    [`${businessName} — underwriting questionnaire`],
    ["Line(s)", "Question", "Answer", "Documented by evidence", "Source", "Why it matters"],
    ...report.answers.map((a) => [
      a.q.lines.map((l) => LINE_LABEL[l]).join("; "),
      a.q.prompt,
      a.answer === null ? "Not answered" : a.answer ? "Yes" : "No",
      a.documented ? "Yes" : "",
      a.q.source,
      a.q.why,
    ]),
  ];
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

export const BAND_MIDPOINT = Object.fromEntries(REVENUE_BANDS.map((b) => [b.id, b.midpoint])) as Record<InsuranceProfile["revenueBand"], number>;
