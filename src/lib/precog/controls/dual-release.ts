/**
 * Dual-release controls for small dental practices.
 * Enforces two distinct people (or owner override) above thresholds
 * for ACH, checks, write-offs, vendor master, deposits, payroll.
 *
 * Threshold exceptions: payee, person, role, channel, amount-band,
 * time-bound raise / force-dual / waive (with residual logging).
 *
 * Educational control design — not bank/PMS integration.
 */
import { people } from "../demo-data";
import type { StaffComposition } from "../types";

export type ReleaseChannel =
  | "ach"
  | "check"
  | "writeoff"
  | "vendor_new"
  | "deposit"
  | "payroll";

export type ExceptionAction =
  /** Raise the dual-required threshold (single release allowed up to higher amount) */
  | "raise_threshold"
  /** Force dual release even below normal threshold */
  | "force_dual"
  /** Waive dual requirement entirely (still logs residual risk) */
  | "waive_dual"
  /** Cap / lower threshold (stricter than base) */
  | "lower_threshold";

export type ExceptionScope =
  | "payee"
  | "person"
  | "role"
  | "channel"
  | "amount_band";

export interface ThresholdException {
  id: string;
  label: string;
  /** Channels this exception applies to; empty = all */
  channels: ReleaseChannel[];
  action: ExceptionAction;
  /** For raise/lower: absolute threshold override (USD) */
  thresholdUsd?: number;
  /** Scope matchers (all provided must match) */
  payeeContains?: string;
  personId?: string;
  role?: string;
  /** Amount band: match when request amount is within [min, max] */
  amountMinUsd?: number;
  amountMaxUsd?: number;
  /** ISO date YYYY-MM-DD inclusive */
  effectiveFrom?: string;
  effectiveTo?: string;
  enabled: boolean;
  reason: string;
  approvedByPersonId?: string;
  createdAt: string;
  /** Residual risk note when waive/raise is used */
  residualNote?: string;
}

export interface DualReleaseRule {
  channel: ReleaseChannel;
  label: string;
  enabled: boolean;
  /** Dual release required for amounts strictly greater than this (USD). 0 = always. */
  thresholdUsd: number;
  requireDistinctPeople: boolean;
  firstApproverRoles: string[];
  secondApproverRoles: string[];
  mitigatesRuleIds: string[];
  processIds: string[];
  description: string;
}

export interface DualReleasePolicy {
  enabled: boolean;
  ownerCanSecondAny: boolean;
  hardBlockWithoutSecond: boolean;
  rules: DualReleaseRule[];
  /** Ordered by specificity; first matching active exception wins */
  exceptions: ThresholdException[];
  updatedAt?: string;
}

export interface ReleaseRequest {
  channel: ReleaseChannel;
  amountUsd: number;
  initiatorPersonId: string;
  secondPersonId?: string;
  memo?: string;
  payee?: string;
  /** Evaluation as-of date (ISO date); defaults to today */
  asOfDate?: string;
}

export type ReleaseStatus =
  | "below_threshold"
  | "needs_second"
  | "approved_dual"
  | "approved_single"
  | "approved_exception"
  | "blocked_same_person"
  | "blocked_role"
  | "blocked_missing_second"
  | "blocked_policy_off";

export interface EligibleApprover {
  id: string;
  name: string;
  role: string;
  canInitiate: boolean;
  canSecond: boolean;
}

export interface AppliedException {
  id: string;
  label: string;
  action: ExceptionAction;
  baseThresholdUsd: number;
  effectiveThresholdUsd: number;
  residualNote?: string;
}

export interface ReleaseEvaluation {
  status: ReleaseStatus;
  ok: boolean;
  channel: ReleaseChannel;
  amountUsd: number;
  thresholdUsd: number;
  baseThresholdUsd: number;
  dualRequired: boolean;
  reasons: string[];
  nextSteps: string[];
  eligibleSeconds: EligibleApprover[];
  initiator?: { id: string; name: string; role: string };
  second?: { id: string; name: string; role: string };
  mitigatesRules: string[];
  appliedException?: AppliedException;
  controlCredit: {
    dualControlPayments: boolean;
    insuranceDiscountEligible: boolean;
    note: string;
  };
}

export interface DualReleaseCoverage {
  channel: ReleaseChannel;
  label: string;
  enabled: boolean;
  thresholdUsd: number;
  mitigatesRuleIds: string[];
  covered: boolean;
  activeExceptions: number;
}

export const DEFAULT_DUAL_RELEASE_RULES: DualReleaseRule[] = [
  {
    channel: "ach",
    label: "ACH / vendor electronic pay",
    enabled: true,
    thresholdUsd: 500,
    requireDistinctPeople: true,
    firstApproverRoles: ["Office Manager", "Billing Specialist", "Owner / Dentist"],
    secondApproverRoles: ["Owner / Dentist", "Office Manager"],
    mitigatesRuleIds: ["rule-vendor-create-pay", "rule-vendor-approve-pay"],
    processIds: ["proc-ap"],
    description: "Second person releases ACH above threshold — blocks fictitious vendor pay alone.",
  },
  {
    channel: "check",
    label: "Paper checks",
    enabled: true,
    thresholdUsd: 500,
    requireDistinctPeople: true,
    firstApproverRoles: ["Office Manager", "Owner / Dentist"],
    secondApproverRoles: ["Owner / Dentist"],
    mitigatesRuleIds: ["rule-vendor-create-pay"],
    processIds: ["proc-ap"],
    description: "Dual signature on checks above threshold.",
  },
  {
    channel: "writeoff",
    label: "Write-offs / adjustments",
    enabled: true,
    thresholdUsd: 150,
    requireDistinctPeople: true,
    firstApproverRoles: ["Billing Specialist", "Office Manager", "Front Desk Lead"],
    secondApproverRoles: ["Owner / Dentist", "Office Manager"],
    mitigatesRuleIds: ["rule-writeoff", "rule-claims-writeoff"],
    processIds: ["proc-ar", "proc-claims"],
    description: "Owner/OM must approve adjustments above threshold.",
  },
  {
    channel: "vendor_new",
    label: "New vendor master",
    enabled: true,
    thresholdUsd: 0,
    requireDistinctPeople: true,
    firstApproverRoles: ["Office Manager", "Billing Specialist"],
    secondApproverRoles: ["Owner / Dentist"],
    mitigatesRuleIds: ["rule-vendor-create-approve", "rule-vendor-create-pay"],
    processIds: ["proc-ap"],
    description: "Owner signs every new vendor before first payment.",
  },
  {
    channel: "deposit",
    label: "Bank deposit bag",
    enabled: true,
    thresholdUsd: 0,
    requireDistinctPeople: true,
    firstApproverRoles: ["Front Desk Lead", "Office Manager"],
    secondApproverRoles: ["Office Manager", "Owner / Dentist", "Billing Specialist"],
    mitigatesRuleIds: ["rule-collect-post", "rule-deposit-post", "rule-cash-rec"],
    processIds: ["proc-cash"],
    description: "Dual count of deposit before bag is sealed.",
  },
  {
    channel: "payroll",
    label: "Payroll transmission",
    enabled: true,
    thresholdUsd: 0,
    requireDistinctPeople: true,
    firstApproverRoles: ["Office Manager"],
    secondApproverRoles: ["Owner / Dentist"],
    mitigatesRuleIds: ["rule-payroll"],
    processIds: ["proc-payroll"],
    description: "Owner approves final payroll file every cycle.",
  },
];

/** Demo seed exceptions (owner-approved recurring lab payee + temporary raise). */
export function defaultExceptions(): ThresholdException[] {
  const today = new Date();
  const in90 = new Date(today.getTime() + 90 * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return [
    {
      id: "ex-lab-recurring",
      label: "Trusted lab ACH raise",
      channels: ["ach"],
      action: "raise_threshold",
      thresholdUsd: 3500,
      payeeContains: "apex dental lab",
      enabled: true,
      reason: "Recurring lab with monthly invoice; owner reviewed 12 months clean history.",
      approvedByPersonId: "p1",
      createdAt: iso(today),
      residualNote: "Single release up to $3,500 for Apex only — sample monthly statements.",
    },
    {
      id: "ex-force-new-vendor-pay",
      label: "Force dual on any first ACH to new payee band",
      channels: ["ach"],
      action: "force_dual",
      amountMinUsd: 1,
      amountMaxUsd: 499,
      enabled: false,
      reason: "Optional strict mode: dual even under $500 for small first payments.",
      createdAt: iso(today),
    },
    {
      id: "ex-temp-om-writeoff",
      label: "Temp OM write-off raise (vacation cover)",
      channels: ["writeoff"],
      action: "raise_threshold",
      thresholdUsd: 400,
      personId: "p2",
      effectiveFrom: iso(today),
      effectiveTo: iso(in90),
      enabled: false,
      reason: "Owner out of office — temporary higher single-approval for OM.",
      approvedByPersonId: "p1",
      createdAt: iso(today),
      residualNote: "Time-bound; auto-expires. Review all write-offs on return.",
    },
  ];
}

export function defaultDualReleasePolicy(
  staff?: StaffComposition,
): DualReleasePolicy {
  const enabled = staff?.dualControlPayments ?? false;
  return {
    enabled,
    ownerCanSecondAny: true,
    hardBlockWithoutSecond: true,
    rules: DEFAULT_DUAL_RELEASE_RULES.map((r) => ({ ...r })),
    exceptions: defaultExceptions(),
  };
}

export function makeExceptionId(): string {
  return `ex_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function mergeDualReleasePolicy(
  partial?: Partial<DualReleasePolicy> | null,
  staff?: StaffComposition,
): DualReleasePolicy {
  const base = defaultDualReleasePolicy(staff);
  if (!partial) return base;
  const rulesByChannel = new Map(
    (partial.rules ?? []).map((r) => [r.channel, r] as const),
  );
  return {
    enabled: partial.enabled ?? base.enabled,
    ownerCanSecondAny: partial.ownerCanSecondAny ?? base.ownerCanSecondAny,
    hardBlockWithoutSecond:
      partial.hardBlockWithoutSecond ?? base.hardBlockWithoutSecond,
    rules: base.rules.map((r) => ({
      ...r,
      ...rulesByChannel.get(r.channel),
      channel: r.channel,
    })),
    exceptions: Array.isArray(partial.exceptions)
      ? partial.exceptions
      : base.exceptions,
    updatedAt: partial.updatedAt,
  };
}

function personById(id: string) {
  return people.find((p) => p.id === id);
}

function todayIso(asOf?: string) {
  return asOf ?? new Date().toISOString().slice(0, 10);
}

function isDateActive(ex: ThresholdException, asOf: string): boolean {
  if (ex.effectiveFrom && asOf < ex.effectiveFrom) return false;
  if (ex.effectiveTo && asOf > ex.effectiveTo) return false;
  return true;
}

/** Specificity score — higher wins when multiple match (we take first sorted). */
function exceptionSpecificity(ex: ThresholdException): number {
  let s = 0;
  if (ex.payeeContains) s += 40;
  if (ex.personId) s += 30;
  if (ex.role) s += 20;
  if (ex.amountMinUsd != null || ex.amountMaxUsd != null) s += 15;
  if (ex.channels.length === 1) s += 10;
  if (ex.effectiveFrom || ex.effectiveTo) s += 5;
  return s;
}

export function matchExceptions(
  policy: DualReleasePolicy,
  request: Pick<
    ReleaseRequest,
    "channel" | "amountUsd" | "initiatorPersonId" | "payee" | "asOfDate"
  >,
): ThresholdException[] {
  const asOf = todayIso(request.asOfDate);
  const initiator = personById(request.initiatorPersonId);
  const payee = (request.payee ?? "").toLowerCase();

  const matched = (policy.exceptions ?? []).filter((ex) => {
    if (!ex.enabled) return false;
    if (!isDateActive(ex, asOf)) return false;
    if (ex.channels.length > 0 && !ex.channels.includes(request.channel)) {
      return false;
    }
    if (ex.payeeContains) {
      if (!payee.includes(ex.payeeContains.toLowerCase())) return false;
    }
    if (ex.personId && ex.personId !== request.initiatorPersonId) return false;
    if (ex.role && initiator?.role !== ex.role) return false;
    if (ex.amountMinUsd != null && request.amountUsd < ex.amountMinUsd) {
      return false;
    }
    if (ex.amountMaxUsd != null && request.amountUsd > ex.amountMaxUsd) {
      return false;
    }
    return true;
  });

  return matched.sort(
    (a, b) => exceptionSpecificity(b) - exceptionSpecificity(a),
  );
}

export function resolveEffectiveThreshold(
  baseThresholdUsd: number,
  exception: ThresholdException | undefined,
): {
  thresholdUsd: number;
  forceDual: boolean;
  waiveDual: boolean;
  applied?: AppliedException;
} {
  if (!exception) {
    return { thresholdUsd: baseThresholdUsd, forceDual: false, waiveDual: false };
  }

  if (exception.action === "waive_dual") {
    return {
      thresholdUsd: Number.POSITIVE_INFINITY,
      forceDual: false,
      waiveDual: true,
      applied: {
        id: exception.id,
        label: exception.label,
        action: exception.action,
        baseThresholdUsd,
        effectiveThresholdUsd: Number.POSITIVE_INFINITY,
        residualNote: exception.residualNote ?? exception.reason,
      },
    };
  }

  if (exception.action === "force_dual") {
    return {
      thresholdUsd: -1, // dual for any amount > -1
      forceDual: true,
      waiveDual: false,
      applied: {
        id: exception.id,
        label: exception.label,
        action: exception.action,
        baseThresholdUsd,
        effectiveThresholdUsd: -1,
        residualNote: exception.residualNote,
      },
    };
  }

  const override =
    exception.thresholdUsd != null
      ? exception.thresholdUsd
      : baseThresholdUsd;

  const thresholdUsd =
    exception.action === "raise_threshold"
      ? Math.max(baseThresholdUsd, override)
      : Math.min(baseThresholdUsd, override); // lower_threshold

  return {
    thresholdUsd,
    forceDual: false,
    waiveDual: false,
    applied: {
      id: exception.id,
      label: exception.label,
      action: exception.action,
      baseThresholdUsd,
      effectiveThresholdUsd: thresholdUsd,
      residualNote: exception.residualNote ?? exception.reason,
    },
  };
}

export function listEligibleApprovers(
  policy: DualReleasePolicy,
  channel: ReleaseChannel,
): EligibleApprover[] {
  const rule = policy.rules.find((r) => r.channel === channel);
  if (!rule) return [];

  return people
    .filter((p) => p.active)
    .map((p) => {
      const isOwner = p.role === "Owner / Dentist";
      const canInitiate = rule.firstApproverRoles.includes(p.role);
      const canSecond =
        rule.secondApproverRoles.includes(p.role) ||
        (policy.ownerCanSecondAny && isOwner);
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        canInitiate,
        canSecond,
      };
    })
    .filter((p) => p.canInitiate || p.canSecond);
}

export function evaluateRelease(
  policy: DualReleasePolicy,
  request: ReleaseRequest,
): ReleaseEvaluation {
  const rule = policy.rules.find((r) => r.channel === request.channel);
  const initiator = personById(request.initiatorPersonId);
  const second = request.secondPersonId
    ? personById(request.secondPersonId)
    : undefined;

  const baseCredit = {
    dualControlPayments: policy.enabled,
    insuranceDiscountEligible:
      policy.enabled &&
      policy.rules.filter((r) => r.enabled).length >= 3 &&
      !(policy.exceptions ?? []).some(
        (e) => e.enabled && e.action === "waive_dual",
      ),
    note: policy.enabled
      ? "Dual-release policy active — eligible for dual-control insurance credit when carriers require dual signature/ACH."
      : "Policy off — no dual-control insurance credit.",
  };

  if (!policy.enabled) {
    return {
      status: "blocked_policy_off",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: rule?.thresholdUsd ?? 0,
      baseThresholdUsd: rule?.thresholdUsd ?? 0,
      dualRequired: false,
      reasons: ["Dual-release policy is turned off for the practice."],
      nextSteps: [
        "Enable dual release in Controls, then configure channel thresholds.",
      ],
      eligibleSeconds: [],
      initiator: initiator
        ? { id: initiator.id, name: initiator.name, role: initiator.role }
        : undefined,
      second: second
        ? { id: second.id, name: second.name, role: second.role }
        : undefined,
      mitigatesRules: [],
      controlCredit: baseCredit,
    };
  }

  if (!rule || !rule.enabled) {
    return {
      status: "blocked_policy_off",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: 0,
      baseThresholdUsd: 0,
      dualRequired: false,
      reasons: [`No active dual-release rule for channel "${request.channel}".`],
      nextSteps: ["Enable this channel in the dual-release policy."],
      eligibleSeconds: listEligibleApprovers(policy, request.channel).filter(
        (p) => p.canSecond,
      ),
      initiator: initiator
        ? { id: initiator.id, name: initiator.name, role: initiator.role }
        : undefined,
      mitigatesRules: rule?.mitigatesRuleIds ?? [],
      controlCredit: baseCredit,
    };
  }

  const matches = matchExceptions(policy, request);
  const topEx = matches[0];
  const resolved = resolveEffectiveThreshold(rule.thresholdUsd, topEx);
  const effectiveThreshold = resolved.thresholdUsd;
  const dualRequired = resolved.forceDual
    ? true
    : resolved.waiveDual
      ? false
      : request.amountUsd > effectiveThreshold;

  const eligible = listEligibleApprovers(policy, request.channel);
  const eligibleSeconds = eligible.filter((p) => p.canSecond);

  const initiatorMeta = initiator
    ? { id: initiator.id, name: initiator.name, role: initiator.role }
    : undefined;
  const secondMeta = second
    ? { id: second.id, name: second.name, role: second.role }
    : undefined;

  if (!initiator) {
    return {
      status: "blocked_role",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: effectiveThreshold,
      baseThresholdUsd: rule.thresholdUsd,
      dualRequired,
      reasons: ["Initiator not found."],
      nextSteps: ["Pick a valid staff member as first signer."],
      eligibleSeconds,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: baseCredit,
    };
  }

  const initiatorEligible = eligible.find((p) => p.id === initiator.id);
  if (!initiatorEligible?.canInitiate) {
    return {
      status: "blocked_role",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: effectiveThreshold,
      baseThresholdUsd: rule.thresholdUsd,
      dualRequired,
      reasons: [
        `${initiator.name} (${initiator.role}) is not allowed to initiate ${rule.label}.`,
      ],
      nextSteps: [
        `Initiators must be: ${rule.firstApproverRoles.join(", ")}.`,
      ],
      eligibleSeconds,
      initiator: initiatorMeta,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: baseCredit,
    };
  }

  // Waived dual via exception
  if (resolved.waiveDual) {
    return {
      status: "approved_exception",
      ok: true,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: effectiveThreshold,
      baseThresholdUsd: rule.thresholdUsd,
      dualRequired: false,
      reasons: [
        `Exception "${topEx!.label}" waives dual release for this request.`,
        topEx!.residualNote ?? topEx!.reason,
      ],
      nextSteps: [
        "Log residual acceptance in the decision journal.",
        "Re-review exception before expiry.",
      ],
      eligibleSeconds,
      initiator: initiatorMeta,
      second: secondMeta,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: {
        ...baseCredit,
        insuranceDiscountEligible: false,
        note: "Active dual-waive exception may reduce dual-control insurance credit — disclose to carrier if asked.",
      },
    };
  }

  if (!dualRequired) {
    const viaRaise =
      resolved.applied && resolved.applied.action === "raise_threshold";
    return {
      status: viaRaise ? "approved_exception" : "below_threshold",
      ok: true,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: effectiveThreshold === Number.POSITIVE_INFINITY
        ? rule.thresholdUsd
        : effectiveThreshold < 0
          ? 0
          : effectiveThreshold,
      baseThresholdUsd: rule.thresholdUsd,
      dualRequired: false,
      reasons: [
        viaRaise
          ? `Exception "${resolved.applied!.label}" raised threshold from $${rule.thresholdUsd.toLocaleString()} to $${resolved.applied!.effectiveThresholdUsd.toLocaleString()}.`
          : `Amount $${request.amountUsd.toLocaleString()} is at or under threshold $${effectiveThreshold.toLocaleString()} — single release allowed.`,
        ...(resolved.applied?.residualNote
          ? [resolved.applied.residualNote]
          : []),
      ],
      nextSteps: [
        "Still log the release; spot-check samples monthly.",
        ...(viaRaise ? ["Confirm exception still valid (dates / payee)."] : []),
      ],
      eligibleSeconds,
      initiator: initiatorMeta,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: baseCredit,
    };
  }

  // Dual required path
  if (!second) {
    return {
      status: policy.hardBlockWithoutSecond
        ? "blocked_missing_second"
        : "needs_second",
      ok: !policy.hardBlockWithoutSecond,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd:
        effectiveThreshold < 0 ? 0 : Math.max(0, effectiveThreshold),
      baseThresholdUsd: rule.thresholdUsd,
      dualRequired: true,
      reasons: [
        resolved.forceDual
          ? `Exception "${topEx!.label}" forces dual release.`
          : `Dual release required above $${Math.max(0, effectiveThreshold).toLocaleString()}.`,
        "Second signer not yet attached.",
        ...(resolved.applied && resolved.applied.baseThresholdUsd !== effectiveThreshold
          ? [
              `Base threshold $${rule.thresholdUsd.toLocaleString()} → effective $${Math.max(0, effectiveThreshold).toLocaleString()}.`,
            ]
          : []),
      ],
      nextSteps: [
        `Select second signer: ${rule.secondApproverRoles.join(" or ")}.`,
        policy.ownerCanSecondAny
          ? "Owner may second any channel."
          : "Owner seconding only if listed in rule.",
      ],
      eligibleSeconds: eligibleSeconds.filter((p) => p.id !== initiator.id),
      initiator: initiatorMeta,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: baseCredit,
    };
  }

  if (rule.requireDistinctPeople && second.id === initiator.id) {
    return {
      status: "blocked_same_person",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: Math.max(0, effectiveThreshold),
      baseThresholdUsd: rule.thresholdUsd,
      dualRequired: true,
      reasons: [
        "Same person cannot be first and second signer — dual release requires two distinct people.",
      ],
      nextSteps: ["Pick a different second signer."],
      eligibleSeconds: eligibleSeconds.filter((p) => p.id !== initiator.id),
      initiator: initiatorMeta,
      second: secondMeta,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: baseCredit,
    };
  }

  const secondEligible = eligibleSeconds.find((p) => p.id === second.id);
  if (!secondEligible) {
    return {
      status: "blocked_role",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: Math.max(0, effectiveThreshold),
      baseThresholdUsd: rule.thresholdUsd,
      dualRequired: true,
      reasons: [
        `${second.name} (${second.role}) is not an allowed second signer for ${rule.label}.`,
      ],
      nextSteps: [
        `Allowed seconds: ${rule.secondApproverRoles.join(", ")}.`,
      ],
      eligibleSeconds: eligibleSeconds.filter((p) => p.id !== initiator.id),
      initiator: initiatorMeta,
      second: secondMeta,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: baseCredit,
    };
  }

  return {
    status: "approved_dual",
    ok: true,
    channel: request.channel,
    amountUsd: request.amountUsd,
    thresholdUsd: Math.max(0, effectiveThreshold),
    baseThresholdUsd: rule.thresholdUsd,
    dualRequired: true,
    reasons: [
      `Dual release complete: ${initiator.name} → ${second.name}.`,
      `Channel ${rule.label} above effective threshold $${Math.max(0, effectiveThreshold).toLocaleString()}.`,
      ...(resolved.applied
        ? [`Exception applied: ${resolved.applied.label} (${resolved.applied.action}).`]
        : []),
    ],
    nextSteps: [
      "Retain both signatures / system audit log.",
      "Re-score residual risk — vendor/write-off conflicts should show dual-release mitigation.",
    ],
    eligibleSeconds: eligibleSeconds.filter((p) => p.id !== initiator.id),
    initiator: initiatorMeta,
    second: secondMeta,
    mitigatesRules: rule.mitigatesRuleIds,
    appliedException: resolved.applied,
    controlCredit: baseCredit,
  };
}

export function mitigatedSodRuleIds(policy: DualReleasePolicy): Set<string> {
  const ids = new Set<string>();
  if (!policy.enabled) return ids;
  for (const r of policy.rules) {
    if (!r.enabled) continue;
    for (const mid of r.mitigatesRuleIds) ids.add(mid);
  }
  return ids;
}

export function dualReleaseCoverage(
  policy: DualReleasePolicy,
): DualReleaseCoverage[] {
  return policy.rules.map((r) => ({
    channel: r.channel,
    label: r.label,
    enabled: policy.enabled && r.enabled,
    thresholdUsd: r.thresholdUsd,
    mitigatesRuleIds: r.mitigatesRuleIds,
    covered: policy.enabled && r.enabled,
    activeExceptions: (policy.exceptions ?? []).filter(
      (e) =>
        e.enabled &&
        (e.channels.length === 0 || e.channels.includes(r.channel)),
    ).length,
  }));
}

export function staffFlagsFromDualRelease(policy: DualReleasePolicy): {
  dualControlPayments: boolean;
} {
  const ach = policy.rules.find((r) => r.channel === "ach");
  const deposit = policy.rules.find((r) => r.channel === "deposit");
  const dualControlPayments = Boolean(
    policy.enabled && (ach?.enabled || deposit?.enabled),
  );
  return { dualControlPayments };
}

export function activeExceptionSummary(policy: DualReleasePolicy): {
  total: number;
  raises: number;
  forceDual: number;
  waives: number;
  expiringSoon: number;
} {
  const today = todayIso();
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const active = (policy.exceptions ?? []).filter(
    (e) => e.enabled && isDateActive(e, today),
  );
  return {
    total: active.length,
    raises: active.filter((e) => e.action === "raise_threshold").length,
    forceDual: active.filter((e) => e.action === "force_dual").length,
    waives: active.filter((e) => e.action === "waive_dual").length,
    expiringSoon: active.filter(
      (e) => e.effectiveTo && e.effectiveTo <= in30,
    ).length,
  };
}
