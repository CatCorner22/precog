/**
 * Dual-release controls for small dental practices.
 * Enforces two distinct people (or owner override) above thresholds
 * for ACH, checks, write-offs, vendor master, deposits, payroll.
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

export interface DualReleaseRule {
  channel: ReleaseChannel;
  label: string;
  enabled: boolean;
  /** Dual release required for amounts strictly greater than this (USD). 0 = always. */
  thresholdUsd: number;
  requireDistinctPeople: boolean;
  /** Roles allowed as initiator (first signer) */
  firstApproverRoles: string[];
  /** Roles allowed as second signer */
  secondApproverRoles: string[];
  /** SoD rule IDs this dual release compensates */
  mitigatesRuleIds: string[];
  processIds: string[];
  description: string;
}

export interface DualReleasePolicy {
  enabled: boolean;
  /** Owner may act as second signer on any channel when true */
  ownerCanSecondAny: boolean;
  /** Block release if second signer missing above threshold */
  hardBlockWithoutSecond: boolean;
  rules: DualReleaseRule[];
  updatedAt?: string;
}

export interface ReleaseRequest {
  channel: ReleaseChannel;
  amountUsd: number;
  initiatorPersonId: string;
  secondPersonId?: string;
  memo?: string;
  payee?: string;
}

export type ReleaseStatus =
  | "below_threshold"
  | "needs_second"
  | "approved_dual"
  | "approved_single"
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

export interface ReleaseEvaluation {
  status: ReleaseStatus;
  ok: boolean;
  channel: ReleaseChannel;
  amountUsd: number;
  thresholdUsd: number;
  dualRequired: boolean;
  reasons: string[];
  nextSteps: string[];
  eligibleSeconds: EligibleApprover[];
  initiator?: { id: string; name: string; role: string };
  second?: { id: string; name: string; role: string };
  mitigatesRules: string[];
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

export function defaultDualReleasePolicy(
  staff?: StaffComposition,
): DualReleasePolicy {
  const enabled = staff?.dualControlPayments ?? false;
  return {
    enabled,
    ownerCanSecondAny: true,
    hardBlockWithoutSecond: true,
    rules: DEFAULT_DUAL_RELEASE_RULES.map((r) => ({
      ...r,
      // When staff dual control is off, leave rules defined but policy-level off
      enabled: r.enabled,
    })),
  };
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
    updatedAt: partial.updatedAt,
  };
}

function personById(id: string) {
  return people.find((p) => p.id === id);
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
      policy.rules.filter((r) => r.enabled).length >= 3,
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

  const dualRequired = request.amountUsd > rule.thresholdUsd;
  const eligible = listEligibleApprovers(policy, request.channel);
  const eligibleSeconds = eligible.filter((p) => p.canSecond);

  if (!initiator) {
    return {
      status: "blocked_role",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: rule.thresholdUsd,
      dualRequired,
      reasons: ["Initiator not found."],
      nextSteps: ["Pick a valid staff member as first signer."],
      eligibleSeconds,
      mitigatesRules: rule.mitigatesRuleIds,
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
      thresholdUsd: rule.thresholdUsd,
      dualRequired,
      reasons: [
        `${initiator.name} (${initiator.role}) is not allowed to initiate ${rule.label}.`,
      ],
      nextSteps: [
        `Initiators must be: ${rule.firstApproverRoles.join(", ")}.`,
      ],
      eligibleSeconds,
      initiator: {
        id: initiator.id,
        name: initiator.name,
        role: initiator.role,
      },
      mitigatesRules: rule.mitigatesRuleIds,
      controlCredit: baseCredit,
    };
  }

  if (!dualRequired) {
    return {
      status: "below_threshold",
      ok: true,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: rule.thresholdUsd,
      dualRequired: false,
      reasons: [
        `Amount $${request.amountUsd.toLocaleString()} is at or under threshold $${rule.thresholdUsd.toLocaleString()} — single release allowed.`,
      ],
      nextSteps: [
        "Still log the release; spot-check samples monthly.",
      ],
      eligibleSeconds,
      initiator: {
        id: initiator.id,
        name: initiator.name,
        role: initiator.role,
      },
      mitigatesRules: rule.mitigatesRuleIds,
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
      thresholdUsd: rule.thresholdUsd,
      dualRequired: true,
      reasons: [
        `Dual release required above $${rule.thresholdUsd.toLocaleString()}.`,
        "Second signer not yet attached.",
      ],
      nextSteps: [
        `Select second signer: ${rule.secondApproverRoles.join(" or ")}.`,
        policy.ownerCanSecondAny
          ? "Owner may second any channel."
          : "Owner seconding only if listed in rule.",
      ],
      eligibleSeconds: eligibleSeconds.filter((p) => p.id !== initiator.id),
      initiator: {
        id: initiator.id,
        name: initiator.name,
        role: initiator.role,
      },
      mitigatesRules: rule.mitigatesRuleIds,
      controlCredit: baseCredit,
    };
  }

  if (rule.requireDistinctPeople && second.id === initiator.id) {
    return {
      status: "blocked_same_person",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: rule.thresholdUsd,
      dualRequired: true,
      reasons: [
        "Same person cannot be first and second signer — dual release requires two distinct people.",
      ],
      nextSteps: ["Pick a different second signer."],
      eligibleSeconds: eligibleSeconds.filter((p) => p.id !== initiator.id),
      initiator: {
        id: initiator.id,
        name: initiator.name,
        role: initiator.role,
      },
      second: { id: second.id, name: second.name, role: second.role },
      mitigatesRules: rule.mitigatesRuleIds,
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
      thresholdUsd: rule.thresholdUsd,
      dualRequired: true,
      reasons: [
        `${second.name} (${second.role}) is not an allowed second signer for ${rule.label}.`,
      ],
      nextSteps: [
        `Allowed seconds: ${rule.secondApproverRoles.join(", ")}.`,
      ],
      eligibleSeconds: eligibleSeconds.filter((p) => p.id !== initiator.id),
      initiator: {
        id: initiator.id,
        name: initiator.name,
        role: initiator.role,
      },
      second: { id: second.id, name: second.name, role: second.role },
      mitigatesRules: rule.mitigatesRuleIds,
      controlCredit: baseCredit,
    };
  }

  return {
    status: "approved_dual",
    ok: true,
    channel: request.channel,
    amountUsd: request.amountUsd,
    thresholdUsd: rule.thresholdUsd,
    dualRequired: true,
    reasons: [
      `Dual release complete: ${initiator.name} → ${second.name}.`,
      `Channel ${rule.label} above $${rule.thresholdUsd.toLocaleString()}.`,
    ],
    nextSteps: [
      "Retain both signatures / system audit log.",
      "Re-score residual risk — vendor/write-off conflicts should show dual-release mitigation.",
    ],
    eligibleSeconds: eligibleSeconds.filter((p) => p.id !== initiator.id),
    initiator: {
      id: initiator.id,
      name: initiator.name,
      role: initiator.role,
    },
    second: { id: second.id, name: second.name, role: second.role },
    mitigatesRules: rule.mitigatesRuleIds,
    controlCredit: baseCredit,
  };
}

/** Which SoD rule IDs are actively mitigated by the current policy. */
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
  }));
}

/** Staff flag sync: dual control on if policy enabled and core payment channels on. */
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
