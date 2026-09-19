/**
 * Auditor-style control test plans: objective, population, sample size, steps,
 * pass criteria — generated from the control's design and the evidence cadence
 * on the processes it covers. Results are recorded on the profile and feed
 * operating effectiveness.
 */
import type { ControlItem, EvidenceFrequency, ProcessNode } from "../types";

export type TestResult = "pass" | "exception" | "fail";

export interface ControlTestRecord {
  id: string;
  controlId: string;
  testedAt: string;
  result: TestResult;
  sampleSize: number;
  exceptions: number;
  note?: string;
  testedBy?: string;
}

export interface TestPlan {
  controlId: string;
  objective: string;
  population: string;
  frequency: EvidenceFrequency | "ad_hoc";
  /** Recommended sample for one test cycle. */
  sampleSize: number;
  testFrequency: "monthly" | "quarterly" | "semiannual" | "annual";
  steps: string[];
  evidenceToCollect: string[];
  passCriteria: string;
  exceptionTolerance: number;
}

/** Small-business sample sizes by how often the control operates (loosely AICPA-style). */
const SAMPLE_BY_FREQ: Record<EvidenceFrequency, { sample: number; test: TestPlan["testFrequency"] }> = {
  daily: { sample: 25, test: "quarterly" },
  weekly: { sample: 8, test: "quarterly" },
  monthly: { sample: 3, test: "semiannual" },
  quarterly: { sample: 2, test: "annual" },
  annual: { sample: 1, test: "annual" },
};

const ORDER: EvidenceFrequency[] = ["daily", "weekly", "monthly", "quarterly", "annual"];

function mostFrequent(freqs: EvidenceFrequency[]): EvidenceFrequency | null {
  if (!freqs.length) return null;
  return [...freqs].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0];
}

function stepsFor(control: ControlItem, processes: ProcessNode[]): { steps: string[]; evidence: string[]; population: string } {
  const text = `${control.name} ${control.description} ${processes.map((p) => p.name).join(" ")}`.toLowerCase();
  const procNames = processes.map((p) => `"${p.name}"`).join(", ") || "the covered process";

  if (/reconcil|bank/.test(text))
    return {
      population: "Monthly bank statements for each operating account",
      steps: [
        "Select the sample months; obtain the bank statement and the reconciliation for each.",
        "Confirm the reconciler is not the person who posts receipts or releases payments (compare to team roles).",
        "Re-perform: bank balance ± reconciling items = ledger balance; investigate items older than 30 days.",
        "Verify owner/independent sign-off and date are on each reconciliation.",
      ],
      evidence: ["Signed reconciliation", "Bank statement", "Reconciling-items list with ages"],
    };
  if (/vendor|payable|payment|release|ap\b|dual/.test(text))
    return {
      population: "Payments released in the period (ACH, check, card)",
      steps: [
        `Pull the payment register for ${procNames}; select the sample across payees and amounts.`,
        "For each payment, trace to an approved invoice and a receiving record or service confirmation.",
        "Confirm the vendor existed before the invoice and that the vendor creator did not release the payment.",
        "For payments over the dual-release threshold, confirm two distinct approvers with timestamps.",
      ],
      evidence: ["Payment register", "Approved invoices", "Approval log with two signers"],
    };
  if (/cash|deposit|receipt|drawer/.test(text))
    return {
      population: "Daily deposits / cash-drawer closes in the period",
      steps: [
        "Select sample days; obtain the daily close report, deposit slip, and bank credit.",
        "Agree the close total to the deposit slip and to the bank credit (amount and date, within 2 business days).",
        "Confirm the person counting/depositing is different from the person posting receipts.",
        "Investigate any over/short beyond the tolerance and confirm it was reviewed by the owner.",
      ],
      evidence: ["Daily close report", "Deposit slip", "Bank credit", "Over/short log"],
    };
  if (/payroll/.test(text))
    return {
      population: "Payroll runs in the period",
      steps: [
        "Select sample payroll runs; obtain the register and the approval.",
        "Confirm the approver is not the payroll preparer and approved before transmission.",
        "Trace a sample of employees to HR records (active, rate, hours) — look for ghost or duplicate employees.",
        "Agree total payroll to the bank debit.",
      ],
      evidence: ["Payroll register", "Approval record", "Bank debit"],
    };
  if (/write.?off|adjust|credit|claim|billing|a\/r|receivable/.test(text))
    return {
      population: "Adjustments, write-offs, and credits posted in the period",
      steps: [
        "Pull the adjustments report; select the sample weighted toward larger and round-number amounts.",
        "For each, confirm documented reason and an approver different from the poster.",
        "Trace to the underlying account/claim and confirm the adjustment was warranted.",
        "Check for patterns: same poster, same payer, recurring small write-offs.",
      ],
      evidence: ["Adjustments report", "Approval evidence", "Supporting account/claim"],
    };
  if (/inventory|stock|count/.test(text))
    return {
      population: "Cycle counts / receiving in the period",
      steps: [
        "Select sample count sheets; agree counted quantities to system on-hand before adjustment.",
        "Confirm the counter is independent of purchasing and receiving.",
        "Review variance investigation and adjustment approval.",
        "Trace a sample of receipts to purchase orders and vendor invoices.",
      ],
      evidence: ["Count sheets", "Variance report", "Adjustment approvals"],
    };
  return {
    population: `Instances of ${procNames} in the period`,
    steps: [
      `Define what one instance of the control looks like for ${procNames} and pull the population.`,
      "Select the sample; for each, obtain the artefact that shows the control operated (sign-off, log entry, report).",
      "Confirm the person performing the control is independent of the person whose work it checks.",
      "Note any exception and whether it was detected and corrected without the test.",
    ],
    evidence: ["Control artefact per sample item", "Role/independence confirmation"],
  };
}

export function buildTestPlan(control: ControlItem, processes: ProcessNode[]): TestPlan {
  const covered = processes.filter((p) => p.controlIds.includes(control.id));
  const freq = mostFrequent(covered.flatMap((p) => (p.evidence ?? []).map((e) => e.frequency)));
  const sizing = freq ? SAMPLE_BY_FREQ[freq] : { sample: 5, test: "semiannual" as const };
  const { steps, evidence, population } = stepsFor(control, covered);
  const tolerance = sizing.sample >= 25 ? 1 : 0;
  return {
    controlId: control.id,
    objective: control.segregated
      ? `Confirm "${control.name}" operated as designed throughout the period and that the duties it separates stayed separated.`
      : `Confirm the compensating controls around "${control.name}" (${control.compensatingControls.join("; ") || "owner review"}) actually operated, since the duties themselves are not segregated.`,
    population,
    frequency: freq ?? "ad_hoc",
    sampleSize: sizing.sample,
    testFrequency: sizing.test,
    steps,
    evidenceToCollect: evidence,
    passCriteria:
      tolerance === 0
        ? `All ${sizing.sample} sampled items show the control operated with independent sign-off. Any exception = investigate and re-test.`
        : `No more than ${tolerance} exception in ${sizing.sample}; any exception must be explained and corrected.`,
    exceptionTolerance: tolerance,
  };
}

export function resultFor(sampleSize: number, exceptions: number, tolerance: number): TestResult {
  if (exceptions === 0) return "pass";
  if (exceptions <= tolerance) return "exception";
  return "fail";
}

/** Latest test per control, for scoring and display. */
export function latestTests(tests: ControlTestRecord[]): Map<string, ControlTestRecord> {
  const m = new Map<string, ControlTestRecord>();
  for (const t of tests) {
    const cur = m.get(t.controlId);
    if (!cur || new Date(t.testedAt) > new Date(cur.testedAt)) m.set(t.controlId, t);
  }
  return m;
}

export const TEST_FREQ_DAYS: Record<TestPlan["testFrequency"], number> = {
  monthly: 30,
  quarterly: 91,
  semiannual: 182,
  annual: 365,
};

export function makeTestId() {
  return `ct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
