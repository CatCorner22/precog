import type { IndustryTemplate } from "../templates";
import { ownersMarked, ownsBusiness } from "../sod/owner-role";
import { personLabel } from "../person-label";
import {
  CHANNEL_SEATS,
  holdsAny,
  seatedByDuty,
  type AppliedException,
  type DualReleasePolicy,
  type EligibleApprover,
  type ReleaseChannel,
  type ReleaseEvaluation,
  type ReleaseRequest,
  type ThresholdException,
} from "./dual-release-policy";

/** Evaluating one release against the policy: threshold, exceptions, who may approve. */
function personById(tpl: IndustryTemplate, id: string) {
  return tpl.people.find((p) => p.id === id);
}

export function todayIso(asOf?: string) {
  return asOf ?? new Date().toISOString().slice(0, 10);
}

export function isDateActive(ex: ThresholdException, asOf: string): boolean {
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

function matchExceptions(
  tpl: IndustryTemplate,
  policy: DualReleasePolicy,
  request: Pick<
    ReleaseRequest,
    "channel" | "amountUsd" | "initiatorPersonId" | "payee" | "asOfDate"
  >,
): ThresholdException[] {
  const asOf = todayIso(request.asOfDate);
  const initiator = personById(tpl, request.initiatorPersonId);
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

  return matched.sort((a, b) => exceptionSpecificity(b) - exceptionSpecificity(a));
}

function resolveEffectiveThreshold(
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

  const override = exception.thresholdUsd != null ? exception.thresholdUsd : baseThresholdUsd;

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
  tpl: IndustryTemplate,
  policy: DualReleasePolicy,
  channel: ReleaseChannel,
): EligibleApprover[] {
  const rule = policy.rules.find((r) => r.channel === channel);
  if (!rule) return [];

  const { people } = tpl;
  const marked = ownersMarked(people.filter((p) => p.active));
  return people
    .filter((p) => p.active)
    .map((p) => {
      const isOwner = ownsBusiness(p, marked);
      const seats = CHANNEL_SEATS[channel];
      const byDuty = seatedByDuty(p);
      const canInitiate = byDuty
        ? holdsAny(p, seats.initiate)
        : rule.firstApproverRoles.includes(p.role);
      const canSecond =
        (byDuty ? holdsAny(p, seats.second) : rule.secondApproverRoles.includes(p.role)) ||
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

/** "Ana Ruiz (Owner), Grace Kim (Bookkeeper)", or a plain statement when nobody qualifies. */
function peopleList(people: readonly EligibleApprover[], joiner = ", "): string {
  if (people.length === 0) return "nobody on the team holds a duty that allows it";
  return people.map((p) => personLabel(p.name, p.role)).join(joiner);
}

/**
 * The threshold a consumer should display: a real dollar figure, never a
 * sentinel. Waived (+Infinity) reports the base so the reader sees what was
 * waived; forced (-1) reports 0, which is the true effective threshold.
 */
function displayThreshold(effective: number, base: number): number {
  if (!Number.isFinite(effective)) return base;
  return Math.max(0, effective);
}

export function evaluateRelease(
  tpl: IndustryTemplate,
  policy: DualReleasePolicy,
  request: ReleaseRequest,
): ReleaseEvaluation {
  const rule = policy.rules.find((r) => r.channel === request.channel);
  const initiator = personById(tpl, request.initiatorPersonId);
  const second = request.secondPersonId ? personById(tpl, request.secondPersonId) : undefined;

  const baseCredit = {
    dualControlPayments: policy.enabled,
    evidenceReady:
      policy.enabled &&
      !(policy.exceptions ?? []).some((e) => e.enabled && e.action === "waive_dual"),
    note: policy.enabled
      ? "Dual-release policy active. Whether a carrier gives a credit for it depends on your policy's control warranties; this tool does not determine eligibility."
      : "Policy off — there is no dual-control configuration to show a carrier.",
  };

  if (!policy.enabled) {
    return {
      status: "blocked_policy_off",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: rule?.thresholdUsd ?? 0,
      baseThresholdUsd: rule?.thresholdUsd ?? 0,
      dualWaived: false,
      dualForced: false,
      dualRequired: false,
      reasons: ["Dual-release policy is turned off for the practice."],
      nextSteps: ["Enable dual release in Controls, then configure channel thresholds."],
      eligibleSeconds: [],
      initiator: initiator
        ? { id: initiator.id, name: initiator.name, role: initiator.role }
        : undefined,
      second: second ? { id: second.id, name: second.name, role: second.role } : undefined,
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
      dualWaived: false,
      dualForced: false,
      dualRequired: false,
      reasons: [`No active dual-release rule for channel "${request.channel}".`],
      nextSteps: ["Enable this channel in the dual-release policy."],
      eligibleSeconds: listEligibleApprovers(tpl, policy, request.channel).filter(
        (p) => p.canSecond,
      ),
      initiator: initiator
        ? { id: initiator.id, name: initiator.name, role: initiator.role }
        : undefined,
      mitigatesRules: rule?.mitigatesRuleIds ?? [],
      controlCredit: baseCredit,
    };
  }

  const matches = matchExceptions(tpl, policy, request);
  const topEx = matches[0];
  const resolved = resolveEffectiveThreshold(rule.thresholdUsd, topEx);
  const effectiveThreshold = resolved.thresholdUsd;
  const dualRequired = resolved.forceDual
    ? true
    : resolved.waiveDual
      ? false
      : request.amountUsd > effectiveThreshold;

  const eligible = listEligibleApprovers(tpl, policy, request.channel);
  const eligibleSeconds = eligible.filter((p) => p.canSecond);

  const initiatorMeta = initiator
    ? { id: initiator.id, name: initiator.name, role: initiator.role }
    : undefined;
  const secondMeta = second ? { id: second.id, name: second.name, role: second.role } : undefined;

  if (!initiator) {
    return {
      status: "blocked_role",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: displayThreshold(effectiveThreshold, rule.thresholdUsd),
      baseThresholdUsd: rule.thresholdUsd,
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
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
      thresholdUsd: displayThreshold(effectiveThreshold, rule.thresholdUsd),
      baseThresholdUsd: rule.thresholdUsd,
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
      dualRequired,
      reasons: [
        `${personLabel(initiator.name, initiator.role)} is not allowed to initiate ${rule.label}.`,
      ],
      nextSteps: [`Initiators must be: ${peopleList(eligible.filter((p) => p.canInitiate))}.`],
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
      thresholdUsd: displayThreshold(effectiveThreshold, rule.thresholdUsd),
      baseThresholdUsd: rule.thresholdUsd,
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
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
        evidenceReady: false,
        note: "An active dual-waive exception weakens the control a carrier would look at — disclose it if asked.",
      },
    };
  }

  if (!dualRequired) {
    const viaRaise = resolved.applied && resolved.applied.action === "raise_threshold";
    return {
      status: viaRaise ? "approved_exception" : "below_threshold",
      ok: true,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd:
        effectiveThreshold === Number.POSITIVE_INFINITY
          ? rule.thresholdUsd
          : effectiveThreshold < 0
            ? 0
            : effectiveThreshold,
      baseThresholdUsd: rule.thresholdUsd,
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
      dualRequired: false,
      reasons: [
        viaRaise
          ? `Exception "${resolved.applied!.label}" raised threshold from $${rule.thresholdUsd.toLocaleString()} to $${resolved.applied!.effectiveThresholdUsd.toLocaleString()}.`
          : `Amount $${request.amountUsd.toLocaleString()} is at or under threshold $${effectiveThreshold.toLocaleString()} — single release allowed.`,
        ...(resolved.applied?.residualNote ? [resolved.applied.residualNote] : []),
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
      status: policy.hardBlockWithoutSecond ? "blocked_missing_second" : "needs_second",
      ok: !policy.hardBlockWithoutSecond,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: effectiveThreshold < 0 ? 0 : Math.max(0, effectiveThreshold),
      baseThresholdUsd: rule.thresholdUsd,
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
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
        `Select second signer: ${peopleList(
          eligibleSeconds.filter((p) => p.id !== initiator.id),
          " or ",
        )}.`,
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
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
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
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
      dualRequired: true,
      reasons: [
        `${personLabel(second.name, second.role)} is not an allowed second signer for ${rule.label}.`,
      ],
      nextSteps: [
        `Allowed seconds: ${peopleList(eligibleSeconds.filter((p) => p.id !== initiator.id))}.`,
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
    dualWaived: resolved.waiveDual,
    dualForced: resolved.forceDual,
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
