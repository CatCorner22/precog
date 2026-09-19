/**
 * The underwriting question bank. Each question maps to how a carrier typically
 * treats the answer: a premium credit when yes, a surcharge when no, and — for the
 * gating questions — a coverage consequence (sublimit, exclusion, higher deductible,
 * or a likely decline). Weights are illustrative small-business market patterns,
 * not any carrier's rating plan.
 */
import type { AttestationId, InsuranceLine } from "./types";
import type { RiskVariableState } from "../scoring/dynamic-variables";
import type { StaffComposition } from "../types";

export type CoverageEffectKind = "none" | "sublimit" | "exclusion" | "higher_deductible" | "decline" | "coinsurance";

export interface CoverageEffect {
  kind: CoverageEffectKind;
  coverage: string;
  detail: string;
}

export type AnswerSource = "map" | "profile" | "attestation";

export interface UnderwritingQuestion {
  id: string;
  lines: InsuranceLine[];
  /** Roughly as it appears on an application. */
  prompt: string;
  /** Plain-English why it matters to the underwriter. */
  why: string;
  /** Where the answer comes from. */
  source: AnswerSource;
  attestation?: AttestationId;
  /** 1–5: how heavily this weighs in readiness. */
  weight: 1 | 2 | 3 | 4 | 5;
  /** Premium credit (%) when satisfied, per line. */
  creditPct: Partial<Record<InsuranceLine, number>>;
  /** Premium surcharge (%) when not satisfied, per line. */
  surchargePct: Partial<Record<InsuranceLine, number>>;
  /** Coverage consequence when NOT satisfied. */
  ifNo: CoverageEffect[];
  /** Control/evidence hints — when matching evidence is current, the answer is "documented". */
  evidenceHints?: string[];
  /** Typical cost to implement, for the change simulator. */
  effort: "low" | "medium" | "high";
  costHint: string;
}

export interface QuestionContext {
  staff: StaffComposition;
  riskVariables: RiskVariableState;
  attestations: Partial<Record<AttestationId, boolean>>;
  /** From the map: any control with these tokens mapped to a process. */
  hasControlLike: (tokens: string[]) => boolean;
  /** From the map: SoD summary. */
  sodCritical: number;
  /** From the map: evidence current for controls matching tokens. */
  evidenceCurrentFor: (tokens: string[]) => boolean;
  /** Dual-release threshold if enabled. */
  dualReleaseThreshold: number | null;
}

export const QUESTIONS: UnderwritingQuestion[] = [
  // ---- Crime / employee dishonesty ----
  {
    id: "dual_auth_payments",
    lines: ["crime", "social_engineering"],
    prompt: "Do disbursements above a set threshold require two authorised approvers?",
    why: "The single most-asked crime question. One person setting up and releasing payments is the classic embezzlement path.",
    source: "map",
    weight: 5,
    creditPct: { crime: 8, social_engineering: 10 },
    surchargePct: { crime: 10, social_engineering: 15 },
    ifNo: [
      { kind: "sublimit", coverage: "Funds transfer fraud", detail: "Expect a sublimit (often $25k–$50k) or a separate, higher deductible." },
      { kind: "decline", coverage: "Social engineering rider", detail: "Many carriers will not offer social engineering coverage without dual authorisation." },
    ],
    evidenceHints: ["dual", "payment", "release", "vendor"],
    effort: "low",
    costHint: "Bank/portal setting; 1–2 hours",
  },
  {
    id: "independent_bank_rec",
    lines: ["crime"],
    prompt: "Are bank statements reconciled monthly by someone who does not handle receipts or disbursements?",
    why: "Independent reconciliation is how theft gets caught in months, not years — it caps the size of a loss.",
    source: "map",
    weight: 5,
    creditPct: { crime: 6 },
    surchargePct: { crime: 8 },
    ifNo: [
      { kind: "higher_deductible", coverage: "Employee theft", detail: "Carriers commonly impose a higher employee-theft deductible or a coinsurance share." },
      { kind: "exclusion", coverage: "Discovery period", detail: "Losses discovered late may fall outside the discovery window." },
    ],
    evidenceHints: ["reconcil", "bank"],
    effort: "low",
    costHint: "Owner time monthly, or $150–$400/mo outsourced",
  },
  {
    id: "segregation",
    lines: ["crime"],
    prompt: "Are custody, authorisation, recording, and reconciliation duties separated (or compensated where they can't be)?",
    why: "SoD conflicts are the design flaw that makes a scheme possible in the first place.",
    source: "map",
    weight: 4,
    creditPct: { crime: 5 },
    surchargePct: { crime: 6 },
    ifNo: [{ kind: "higher_deductible", coverage: "Employee theft", detail: "Unmitigated critical conflicts usually mean a surcharge and a higher retention." }],
    evidenceHints: ["sod", "segreg"],
    effort: "medium",
    costHint: "Reassign duties; may need a part-time role",
  },
  {
    id: "background_checks",
    lines: ["crime"],
    prompt: "Are background and reference checks performed on employees who handle money or have system admin rights?",
    why: "Prior dishonesty is the strongest predictor carriers have; some exclude losses from employees with known prior theft.",
    source: "profile",
    weight: 3,
    creditPct: { crime: 4 },
    surchargePct: { crime: 4 },
    ifNo: [{ kind: "exclusion", coverage: "Employee theft", detail: "Losses caused by an employee with undisclosed prior dishonesty are typically excluded." }],
    effort: "low",
    costHint: "$30–$80 per hire",
  },
  {
    id: "vendor_bank_change_verify",
    lines: ["crime", "social_engineering", "cyber"],
    prompt: "Are changes to vendor bank details verified by phone to a known number before the next payment?",
    why: "Business-email-compromise losses almost always run through an unverified bank-detail change.",
    source: "attestation",
    attestation: "vendor_bank_change_verify",
    weight: 5,
    creditPct: { social_engineering: 12, cyber: 4, crime: 2 },
    surchargePct: { social_engineering: 20, cyber: 6 },
    ifNo: [
      { kind: "decline", coverage: "Social engineering rider", detail: "Call-back verification is a near-universal condition for social engineering / BEC coverage." },
      { kind: "exclusion", coverage: "Cyber — funds transfer", detail: "Cyber policies often exclude voluntary-parting losses without verification procedures." },
    ],
    effort: "low",
    costHint: "Written procedure; 30 minutes",
  },
  {
    id: "wire_callback",
    lines: ["social_engineering", "crime"],
    prompt: "Are wire and ACH instructions received by email confirmed by call-back before release?",
    why: "Same failure mode as vendor changes, applied to one-off payment requests — including ones that appear to come from the owner.",
    source: "attestation",
    attestation: "wire_callback",
    weight: 4,
    creditPct: { social_engineering: 8, crime: 2 },
    surchargePct: { social_engineering: 15 },
    ifNo: [{ kind: "sublimit", coverage: "Social engineering rider", detail: "If offered at all, expect a low sublimit ($10k–$25k)." }],
    effort: "low",
    costHint: "Written procedure; 30 minutes",
  },
  {
    id: "positive_pay",
    lines: ["crime"],
    prompt: "Is positive pay / ACH debit filtering enabled on operating accounts?",
    why: "Stops forged or altered cheques and unauthorised debits before they clear — carriers give credit because it caps forgery losses.",
    source: "attestation",
    attestation: "positive_pay",
    weight: 2,
    creditPct: { crime: 3 },
    surchargePct: {},
    ifNo: [{ kind: "none", coverage: "Forgery & alteration", detail: "No coverage impact; forgery deductible may be higher." }],
    effort: "low",
    costHint: "Bank service, often $0–$50/mo",
  },
  {
    id: "cpa_review",
    lines: ["crime"],
    prompt: "Are the books reviewed at least annually by an outside CPA or bookkeeper independent of daily operations?",
    why: "An outside set of eyes shortens the time a scheme can run — the biggest driver of loss size.",
    source: "attestation",
    attestation: "cpa_review_annual",
    weight: 3,
    creditPct: { crime: 3 },
    surchargePct: { crime: 3 },
    ifNo: [{ kind: "none", coverage: "Employee theft", detail: "Rated, not gated." }],
    effort: "medium",
    costHint: "$1k–$5k/yr",
  },
  {
    id: "written_procedures",
    lines: ["crime", "cyber"],
    prompt: "Are financial control procedures written down and followed (not just understood)?",
    why: "Documented procedures let the carrier rely on your controls; undocumented ones are treated as absent.",
    source: "attestation",
    attestation: "written_procedures",
    weight: 3,
    creditPct: { crime: 2, cyber: 2 },
    surchargePct: {},
    ifNo: [{ kind: "none", coverage: "All lines", detail: "Rated; also weakens any claim that a control 'was in place'." }],
    effort: "medium",
    costHint: "A few hours — the process map and evidence log are most of it",
  },
  {
    id: "card_receipts",
    lines: ["crime"],
    prompt: "Are company card statements reviewed line-by-line by someone other than the cardholder, with receipts?",
    why: "Card misuse is the most common small-dollar, long-duration scheme.",
    source: "attestation",
    attestation: "card_receipts_reviewed",
    weight: 2,
    creditPct: { crime: 2 },
    surchargePct: {},
    ifNo: [{ kind: "none", coverage: "Employee theft", detail: "Rated only." }],
    effort: "low",
    costHint: "Owner time monthly",
  },
  {
    id: "vacation_rotation",
    lines: ["crime"],
    prompt: "Do employees with financial duties take at least one consecutive week of leave per year with duties rotated?",
    why: "Schemes that need daily tending unravel when someone else sits in the chair.",
    source: "attestation",
    attestation: "vacation_rotation",
    weight: 1,
    creditPct: { crime: 1 },
    surchargePct: {},
    ifNo: [{ kind: "none", coverage: "Employee theft", detail: "Rated only." }],
    effort: "low",
    costHint: "Policy change",
  },
  {
    id: "cameras_alarm",
    lines: ["crime"],
    prompt: "Are cash-handling areas covered by cameras, with alarm/access control on premises?",
    why: "Cheap deterrence for cash and inventory theft; small but real credits.",
    source: "profile",
    weight: 1,
    creditPct: { crime: 3 },
    surchargePct: {},
    ifNo: [{ kind: "none", coverage: "Theft of money & securities", detail: "Rated only." }],
    effort: "low",
    costHint: "$300–$1,500 one-off",
  },

  // ---- Cyber ----
  {
    id: "mfa_email",
    lines: ["cyber", "social_engineering"],
    prompt: "Is multi-factor authentication enforced on all email accounts and remote access?",
    why: "The number-one cyber underwriting question since 2021. Without it many carriers decline or exclude ransomware and BEC.",
    source: "attestation",
    attestation: "mfa_email",
    weight: 5,
    creditPct: { cyber: 10, social_engineering: 6 },
    surchargePct: { cyber: 25, social_engineering: 10 },
    ifNo: [
      { kind: "decline", coverage: "Cyber liability", detail: "Many markets decline outright; others exclude ransomware and funds-transfer losses." },
      { kind: "exclusion", coverage: "Social engineering", detail: "BEC losses via a compromised mailbox are commonly excluded without MFA." },
    ],
    effort: "low",
    costHint: "Included in Google Workspace / M365; 1–2 hours",
  },
  {
    id: "mfa_banking",
    lines: ["cyber", "social_engineering", "crime"],
    prompt: "Is MFA enforced on online banking and payment platforms, with payment approvals on a separate device or user?",
    why: "Closes the account-takeover path to your operating account.",
    source: "attestation",
    attestation: "mfa_banking",
    weight: 4,
    creditPct: { cyber: 4, social_engineering: 6, crime: 2 },
    surchargePct: { cyber: 6, social_engineering: 10 },
    ifNo: [{ kind: "sublimit", coverage: "Funds transfer fraud", detail: "Expect a low sublimit for account-takeover losses." }],
    effort: "low",
    costHint: "Bank setting; 1 hour",
  },
  {
    id: "offline_backups",
    lines: ["cyber"],
    prompt: "Are backups kept offline or immutable, separate from production credentials?",
    why: "Determines whether a ransomware event is a bad week or a business-ending one — and whether the carrier pays a ransom.",
    source: "attestation",
    attestation: "offline_backups",
    weight: 5,
    creditPct: { cyber: 8 },
    surchargePct: { cyber: 15 },
    ifNo: [
      { kind: "sublimit", coverage: "Ransomware / cyber extortion", detail: "Common sublimit (e.g. 25–50% of the aggregate) and higher retention." },
      { kind: "coinsurance", coverage: "Ransomware", detail: "Some carriers apply 50% coinsurance to extortion payments without offline backups." },
    ],
    effort: "medium",
    costHint: "$10–$60/mo for a small team",
  },
  {
    id: "backup_tested",
    lines: ["cyber"],
    prompt: "Has a restore from backup been tested in the last 12 months?",
    why: "Untested backups fail at the worst moment; carriers know the base rate.",
    source: "attestation",
    attestation: "backup_tested",
    weight: 2,
    creditPct: { cyber: 3 },
    surchargePct: {},
    ifNo: [{ kind: "none", coverage: "Business interruption", detail: "Rated; longer recovery inflates BI claims." }],
    effort: "low",
    costHint: "1–2 hours",
  },
  {
    id: "phishing_training",
    lines: ["cyber", "social_engineering"],
    prompt: "Do all staff complete security-awareness / phishing training at least annually?",
    why: "People are the attack surface for BEC and ransomware; training is a standard credit.",
    source: "attestation",
    attestation: "phishing_training",
    weight: 3,
    creditPct: { cyber: 4, social_engineering: 5 },
    surchargePct: { cyber: 4 },
    ifNo: [{ kind: "none", coverage: "Social engineering", detail: "Rated; some carriers require it for the rider." }],
    effort: "low",
    costHint: "$0–$5/user/mo",
  },
  {
    id: "endpoint_protection",
    lines: ["cyber"],
    prompt: "Is managed endpoint protection (EDR/antivirus) installed on every device that touches business data?",
    why: "Baseline hygiene; absence is a common decline reason for small accounts.",
    source: "attestation",
    attestation: "endpoint_protection",
    weight: 3,
    creditPct: { cyber: 4 },
    surchargePct: { cyber: 8 },
    ifNo: [{ kind: "higher_deductible", coverage: "Cyber liability", detail: "Higher retention or a security-warranty condition." }],
    effort: "low",
    costHint: "$3–$10/device/mo",
  },
  {
    id: "patching",
    lines: ["cyber"],
    prompt: "Are critical security patches applied within 30 days?",
    why: "Most breaches exploit known, patched vulnerabilities.",
    source: "attestation",
    attestation: "patching_30d",
    weight: 2,
    creditPct: { cyber: 2 },
    surchargePct: { cyber: 3 },
    ifNo: [{ kind: "none", coverage: "Cyber liability", detail: "Rated." }],
    effort: "low",
    costHint: "Enable auto-update",
  },
  {
    id: "incident_plan",
    lines: ["cyber"],
    prompt: "Is there a written incident response plan naming who to call (IT, carrier hotline, counsel)?",
    why: "Faster notification lowers claim cost; carriers reward it and some require notice within 72 hours.",
    source: "attestation",
    attestation: "incident_response_plan",
    weight: 2,
    creditPct: { cyber: 2 },
    surchargePct: {},
    ifNo: [{ kind: "none", coverage: "Cyber liability", detail: "Rated; late notice can prejudice a claim." }],
    effort: "low",
    costHint: "One page; 1 hour",
  },
];

/** Answer a question from the map, the profile, or an attestation. `null` = unanswered. */
export function answerQuestion(q: UnderwritingQuestion, ctx: QuestionContext): boolean | null {
  switch (q.id) {
    case "dual_auth_payments":
      return ctx.staff.dualControlPayments || ctx.riskVariables.hasDualControl;
    case "independent_bank_rec":
      return ctx.staff.independentBankRec || ctx.riskVariables.hasIndependentBankRec;
    case "segregation":
      return ctx.sodCritical === 0 || (ctx.staff.segregationScore >= 60 && ctx.sodCritical <= 1);
    case "background_checks":
      return ctx.riskVariables.hasBondedCashHandlers;
    case "cameras_alarm":
      return ctx.riskVariables.hasSecurityCameras && ctx.riskVariables.hasAlarmAccess;
    default:
      if (q.attestation) {
        const v = ctx.attestations[q.attestation];
        return v === undefined ? null : v;
      }
      return null;
  }
}

export function questionsFor(line: InsuranceLine): UnderwritingQuestion[] {
  return QUESTIONS.filter((q) => q.lines.includes(line));
}
