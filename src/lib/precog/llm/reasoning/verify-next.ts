/**
 * What to verify next. The order is a stated rule, not a value-of-information
 * calculation. A check on a control
 * this business has not got comes before a check on one it has, and within
 * each group the table order below holds.
 */
import type { StaffComposition } from "../../types";
import type { RiskVariableState } from "../../scoring/dynamic-variables";
import { HEALTH_SCALE } from "../../scoring/bands";

export interface VerifyNextItem {
  id: string;
  observation: string;
  effort: "low" | "medium" | "high";
  rationale: string;
}

export interface VerifyNextReport {
  /** The checks, most useful first. */
  items: VerifyNextItem[];
  topObservation: string;
}

export function verifyNext(staff: StaffComposition, vars: RiskVariableState): VerifyNextReport {
  const facts = { staff, vars };
  const items = [
    ...CHECKS.filter((c) => c.appliesFirst(facts)),
    ...CHECKS.filter((c) => !c.appliesFirst(facts)),
  ].map(({ id, observation, effort, rationale }) => ({ id, observation, effort, rationale }));
  return { items, topObservation: items[0].observation };
}

interface Facts {
  staff: StaffComposition;
  vars: RiskVariableState;
}

/** Each check, and the fact about this business that moves it to the front. */
const CHECKS: (VerifyNextItem & { appliesFirst: (f: Facts) => boolean })[] = [
  {
    id: "evoi_bank_rec_sample",
    observation: "Owner re-performs the last 2 bank reconciliations",
    effort: "low",
    rationale:
      "Shows whether a missing deposit would be caught. First while nobody independent reconciles the bank.",
    appliesFirst: (f) => !f.staff.independentBankRec,
  },
  {
    id: "evoi_spof_interview",
    observation:
      "30-minute knowledge interview with each person who alone holds a duty, and name a stand-in",
    effort: "medium",
    rationale: "Confirms who can really cover each duty nobody else can run alone today.",
    appliesFirst: (f) => f.staff.soleOwnerKnowledgeCount > 0,
  },
  {
    id: "evoi_vendor_master",
    observation:
      "List vendors added or changed in the last 90 days; have a second person review new ones",
    effort: "medium",
    rationale: "Checks the invented-vendor path while payments go out on one person's say.",
    appliesFirst: (f) => !f.staff.dualControlPayments,
  },
  {
    id: "evoi_writeoff_aging",
    observation: "Export 90 days of adjustments and write-offs with their reason codes",
    effort: "low",
    rationale:
      "Shows whether balances are being written off by the person who also takes payments.",
    appliesFirst: (f) => f.staff.segregationScore < HEALTH_SCALE.adequate,
  },
  {
    id: "evoi_camera_audit",
    observation: "Verify camera coverage of the cash drawer and safe (or note the gaps)",
    effort: "low",
    rationale: "Confirms the camera credit and deterrence this app assumes actually hold.",
    appliesFirst: (f) => f.vars.hasSecurityCameras,
  },
  {
    id: "evoi_policy_terms",
    observation: "Read the crime policy's deductible, limit and control warranties",
    effort: "medium",
    rationale: "The retained and insured figures are only as good as the policy facts behind them.",
    appliesFirst: () => false,
  },
];
