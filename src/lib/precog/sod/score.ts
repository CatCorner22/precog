/**
 * How a duty-conflict finding is scored, and how a team's findings become the
 * 0–100 segregation health index. Every number the owner sees on a finding
 * comes from `rawConflictScore`, the owner discount and `clampScore`.
 */
import { clamp } from "../number";
import type { StaffComposition } from "../types";
import {
  PAYMENT_CHANNELS,
  type ConflictRule,
  type EntitlementId,
  entitlementById,
} from "./conflict-rules";

export type FindingSeverity = ConflictRule["severity"] | "family";

/** What a finding's score reads. */
export interface ScoreInputs {
  severity: FindingSeverity;
  /** The rule's two duties (the held duties for a family finding). */
  pair: readonly [EntitlementId, EntitlementId];
  /** The owner accepted the residual risk on the rule's linked control. */
  accepted: boolean;
  /** How many controls are recorded as in place for this gap. */
  controlsInPlace: number;
  /** An active dual-release rule narrows the gap. */
  dualMitigated: boolean;
  staff?: StaffComposition;
}

/** A score taken off a pair the sole owner holds: error, tax and lender reliance, not theft. */
export const OWNER_HELD_DISCOUNT = 30;

/**
 * The unclamped score of a finding. Sorting uses this value, so two findings
 * that both show 100 still rank by severity, weight and the business's own
 * staffing.
 */
export function rawConflictScore(inputs: ScoreInputs): number {
  const { severity, pair, accepted, controlsInPlace, dualMitigated, staff } = inputs;
  const [a, b] = pair;
  // Bases leave room above them for the staff modifiers below: a critical
  // pair in a business with nobody independent on the bank account must read
  // higher than the same pair where the owner reconciles.
  let s = BASE_SCORE[severity] + (dutyWeight(a) + dutyWeight(b) - 6) * 3;
  if (accepted) s -= 18;
  s -= Math.min(20, controlsInPlace * 6);
  if (dualMitigated) s -= 28; // dual release is a strong compensating control
  if (staff && !staff.dualControlPayments && (PAYMENT_DUTIES.has(a) || PAYMENT_DUTIES.has(b))) {
    s += 6;
  }
  if (staff && !staff.independentBankRec && (a === "bank_reconcile" || b === "bank_reconcile")) {
    s += 8;
  }
  if (staff && staff.segregationScore < 50) s += 5;
  return s;
}

/** The 0–100 score a finding shows. */
export function clampScore(raw: number): number {
  return clamp(Math.round(raw), 12, 100);
}

/** What one finding counts as when the team's gaps are tallied: its rule, or its two duties for a family finding. */
export function gapKey(c: {
  severity: FindingSeverity;
  ruleId: string;
  entitlementA: EntitlementId;
  entitlementB: EntitlementId;
}): string {
  return c.severity === "family" ? `family:${c.entitlementA}:${c.entitlementB}` : c.ruleId;
}

/** The parts of a finding the pressure count reads. */
interface PressureFinding {
  severity: FindingSeverity;
  ruleId: string;
  entitlementA: EntitlementId;
  entitlementB: EntitlementId;
  ownerHeld: boolean;
  residualRiskAccepted: boolean;
  dualReleaseMitigated: boolean;
}

/**
 * How much conflict a team carries, counted per distinct gap rather than per
 * person. The index ranks control design: eight front-desk staff who each
 * take and record payments are one gap (the front desk posts its own
 * takings), not eight, while one bookkeeper holding five different critical
 * pairs is five gaps. Counting per person made a well-run 43-person clinic
 * score below a 5-person shop whose bookkeeper could steal end to end.
 *
 * Each gap counts its severity weight once for the most exposed holder, plus
 * a quarter of the weight for each doubling of the other holders
 * (log2), so more people in a flagged seat still lower the index, slowly. A
 * dual-release rule narrows a pair rather than closing it (×0.35), and an
 * owner-held pair is error rather than theft (×0.5). A gap with a holder
 * whose risk nobody has accepted adds 1.5 on the same basis. Adding a
 * conflict never raises the index. This is an index this app defines, not a
 * measurement.
 */
export function segregationPressure(conflicts: readonly PressureFinding[]): number {
  const gaps = new Map<string, PressureFinding[]>();
  for (const c of conflicts) {
    const key = gapKey(c);
    gaps.set(key, [...(gaps.get(key) ?? []), c]);
  }
  let total = 0;
  for (const holders of gaps.values()) {
    const weight = PRESSURE_WEIGHT[holders[0].severity];
    total +=
      weight *
      spread(holders.map((c) => (c.dualReleaseMitigated ? 0.35 : 1) * (c.ownerHeld ? 0.5 : 1)));
    total +=
      1.5 *
      spread(
        holders
          .filter((c) => !c.residualRiskAccepted && !c.dualReleaseMitigated && !c.ownerHeld)
          .map(() => 1),
      );
  }
  return total;
}

/**
 * Turns conflict pressure into the 0–100 index. Pressure at or under 50 maps
 * linearly (100 − pressure) so a lightly loaded team reads the same as before;
 * above 50 the index decays by half every 35 points of pressure, so a team at
 * 140 still moves visibly when one critical conflict (14 points) is removed.
 * Linear down to 50, then a decay that never hits a floor: every demo team and
 * most real small offices carry pressure above 100, and a fixed floor
 * (formerly 5) hid the movement when an owner fixed a conflict.
 */
export function segregationHealthIndex(pressure: number): number {
  if (pressure <= 0) return 100;
  if (pressure <= 50) return Math.round(100 - pressure);
  return Math.max(1, Math.round(50 * Math.pow(0.5, (pressure - 50) / 35)));
}

/** m + 0.25 × log2(1 + (sum − m)): the largest share in full, the rest slowly. */
function spread(factors: number[]): number {
  if (factors.length === 0) return 0;
  const top = Math.max(...factors);
  const rest = factors.reduce((sum, f) => sum + f, 0) - top;
  return top + 0.25 * Math.log2(1 + rest);
}

function dutyWeight(id: EntitlementId): number {
  return entitlementById(id)?.riskWeight ?? 3;
}

const BASE_SCORE: Record<FindingSeverity, number> = {
  critical: 80,
  high: 64,
  medium: 47,
  family: 40,
};

const PRESSURE_WEIGHT: Record<FindingSeverity, number> = {
  critical: 14,
  high: 8,
  medium: 4,
  family: 2,
};

/**
 * Duties that move customer or supplier money, the ones dual control on
 * payments protects. Payroll duties are not on it: dual release of payments
 * does not touch a payroll master change or a pay run's entry.
 */
const PAYMENT_DUTIES: ReadonlySet<EntitlementId> = new Set<EntitlementId>([
  ...PAYMENT_CHANNELS,
  "collect_cash",
  "post_payments",
]);
