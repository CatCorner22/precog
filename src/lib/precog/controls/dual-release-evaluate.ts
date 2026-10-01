import type { IndustryTemplate } from "../templates";
import { ownersMarked, ownsBusiness } from "../sod/owner-role";
import { personLabel } from "../person-label";
import {
  CHANNEL_SEATS,
  holdsAny,
  seatedByDuty,
  type AppliedException,
  type DualReleasePolicy,
  type ExceptionAction,
  type EligibleApprover,
  type ReleaseChannel,
  type ReleaseEvaluation,
  type ReleaseRequest,
  type ThresholdException,
} from "./dual-release-policy";
import { localDateKey } from "../dates";
import { formatUsd } from "../../utils";

/** Evaluating one release against the policy: threshold, exceptions, who may approve. */
export function evaluateRelease(
  tpl: IndustryTemplate,
  policy: DualReleasePolicy,
  request: ReleaseRequest,
): ReleaseEvaluation {
  const rule = policy.rules.find((r) => r.channel === request.channel);
  const initiator = personById(tpl, request.initiatorPersonId);
  const second = request.secondPersonId ? personById(tpl, request.secondPersonId) : undefined;
  const controlCredit = {
    dualControlPayments: policy.enabled,
    evidenceReady:
      policy.enabled &&
      !(policy.exceptions ?? []).some((e) => e.enabled && e.action === "waive_dual"),
    note: policy.enabled
      ? "Dual release is on. Whether a carrier gives a credit for it depends on your policy's control warranties; this tool does not determine eligibility."
      : "Dual release is off, so there is no dual-release setup to show a carrier.",
  };
  const people = {
    initiator: initiator ? personMeta(initiator) : undefined,
    second: second ? personMeta(second) : undefined,
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
      reasons: ["Dual release is off for this business."],
      nextSteps: ["Turn on dual release in Controls, then set each channel's threshold."],
      eligibleSeconds: [],
      ...people,
      mitigatesRules: [],
      controlCredit,
    };
  }

  if (!rule || !rule.enabled) {
    return {
      status: "blocked_channel_off",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: 0,
      baseThresholdUsd: 0,
      dualWaived: false,
      dualForced: false,
      dualRequired: false,
      reasons: [`Dual release is off for ${rule?.label ?? request.channel}.`],
      nextSteps: ["Turn this channel on in the dual-release policy."],
      eligibleSeconds: listEligibleApprovers(tpl, policy, request.channel).filter(
        (p) => p.canSecond,
      ),
      ...people,
      mitigatesRules: rule?.mitigatesRuleIds ?? [],
      controlCredit: { ...controlCredit, dualControlPayments: false },
    };
  }

  const matches = matchExceptions(tpl, policy, request);
  const topEx = matches[0];
  const resolved = resolveEffectiveThreshold(rule.thresholdUsd, topEx);
  const effectiveThreshold = resolved.thresholdUsd;
  const dualRequired =
    resolved.forceDual || (!resolved.waiveDual && request.amountUsd > effectiveThreshold);
  const eligible = listEligibleApprovers(tpl, policy, request.channel);
  const eligibleSeconds = eligible.filter((p) => p.canSecond);
  const otherSeconds = initiator
    ? eligibleSeconds.filter((p) => p.id !== initiator.id)
    : eligibleSeconds;

  // Every evaluation past the rule check shares these fields; each outcome
  // below sets only its status, verdict and wording.
  const base = {
    channel: request.channel,
    amountUsd: request.amountUsd,
    thresholdUsd: displayThreshold(effectiveThreshold, rule.thresholdUsd),
    baseThresholdUsd: rule.thresholdUsd,
    dualWaived: resolved.waiveDual,
    dualForced: resolved.forceDual,
    dualRequired,
    eligibleSeconds: otherSeconds,
    ...people,
    mitigatesRules: rule.mitigatesRuleIds,
    appliedException: resolved.applied,
    controlCredit,
  };
  const tieNote = exceptionTieNote(matches);

  if (!initiator) {
    return {
      ...base,
      status: "blocked_role",
      ok: false,
      reasons: ["First signer not found.", ...tieNote],
      nextSteps: ["Pick someone on the team as first signer."],
    };
  }

  if (!eligible.find((p) => p.id === initiator.id)?.canInitiate) {
    return {
      ...base,
      status: "blocked_role",
      ok: false,
      eligibleSeconds,
      second: undefined,
      reasons: [
        `${personLabel(initiator.name, initiator.role)} cannot be first signer on ${rule.label}.`,
        ...tieNote,
      ],
      nextSteps: [`Allowed first signers: ${peopleList(eligible.filter((p) => p.canInitiate))}.`],
    };
  }

  if (resolved.waiveDual) {
    return {
      ...base,
      status: "approved_exception",
      ok: true,
      reasons: [
        `Exception "${topEx!.label}" waives dual release for this request.`,
        topEx!.residualNote ?? topEx!.reason,
        ...tieNote,
      ],
      nextSteps: [
        "Log the accepted risk in the Decisions log.",
        "Review the exception again before it expires.",
      ],
      controlCredit: {
        ...controlCredit,
        evidenceReady: false,
        note: "An active exception that waives dual release weakens the control a carrier would look at — disclose it if asked.",
      },
    };
  }

  if (!dualRequired) {
    const viaRaise = resolved.applied?.action === "raise_threshold";
    return {
      ...base,
      status: viaRaise ? "approved_exception" : "below_threshold",
      ok: true,
      second: undefined,
      reasons: [
        viaRaise
          ? `Exception "${resolved.applied!.label}" raised threshold from ${formatUsd(rule.thresholdUsd)} to ${formatUsd(resolved.applied!.effectiveThresholdUsd)}.`
          : `Amount ${formatUsd(request.amountUsd)} is at or under threshold ${formatUsd(effectiveThreshold)} — one signer may release it.`,
        ...(resolved.applied?.residualNote ? [resolved.applied.residualNote] : []),
        ...tieNote,
      ],
      nextSteps: [
        "Still log the release; spot-check a sample each month.",
        ...(viaRaise ? ["Confirm the exception's dates and payee still apply."] : []),
      ],
    };
  }

  const threshold = formatUsd(base.thresholdUsd);
  if (!second) {
    return {
      ...base,
      status: policy.hardBlockWithoutSecond ? "blocked_missing_second" : "needs_second",
      ok: !policy.hardBlockWithoutSecond,
      reasons: [
        resolved.forceDual
          ? `Exception "${topEx!.label}" forces dual release.`
          : `Dual release required above ${threshold}.`,
        "Second signer not yet attached.",
        ...(resolved.applied && resolved.applied.baseThresholdUsd !== effectiveThreshold
          ? [`Base threshold ${formatUsd(rule.thresholdUsd)} → effective ${threshold}.`]
          : []),
        ...tieNote,
      ],
      nextSteps: [
        `Select second signer: ${peopleList(otherSeconds, " or ")}.`,
        policy.ownerCanSecondAny
          ? "The owner may be second signer on any channel."
          : "The owner may be second signer only when the rule lists the owner's role.",
      ],
    };
  }

  if (rule.requireDistinctPeople && second.id === initiator.id) {
    return {
      ...base,
      status: "blocked_same_person",
      ok: false,
      reasons: [
        "Same person cannot be first and second signer — dual release requires two distinct people.",
        ...tieNote,
      ],
      nextSteps: ["Pick a different second signer."],
    };
  }

  if (sharesHousehold(initiator, second) && !policy.unrelatedSignersAttested) {
    return {
      ...base,
      status: "blocked_household",
      ok: false,
      reasons: [
        `${personLabel(initiator.name, initiator.role)} and ${personLabel(second.name, second.role)} share a household. Two people who share finances are not dual control.`,
        "Attest on the policy that the second signer does not share finances with the person who starts the payment, or choose a second signer outside that household.",
      ],
      nextSteps: ["Pick a second signer who does not share that household mark."],
    };
  }

  if (!eligibleSeconds.some((p) => p.id === second.id)) {
    return {
      ...base,
      status: "blocked_role",
      ok: false,
      reasons: [
        `${personLabel(second.name, second.role)} is not an allowed second signer for ${rule.label}.`,
        ...tieNote,
      ],
      nextSteps: [`Allowed second signers: ${peopleList(otherSeconds)}.`],
    };
  }

  return {
    ...base,
    status: "approved_dual",
    ok: true,
    reasons: [
      `Dual release complete: ${initiator.name} → ${second.name}.`,
      `Channel ${rule.label} above effective threshold ${threshold}.`,
      ...(resolved.applied ? [`Exception applied: ${resolved.applied.label}.`] : []),
      ...tieNote,
    ],
    nextSteps: [
      "Keep both signatures or the system audit log.",
      "Re-check What is still exposed: vendor and write-off conflicts now show this control.",
    ],
  };
}

export function isDateActive(ex: ThresholdException, asOf: string): boolean {
  if (ex.effectiveFrom && asOf < ex.effectiveFrom) return false;
  if (ex.effectiveTo && asOf > ex.effectiveTo) return false;
  return true;
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

function personById(tpl: IndustryTemplate, id: string) {
  return tpl.people.find((p) => p.id === id);
}

export function sharesHousehold(
  a: { householdKey?: string },
  b: { householdKey?: string },
): boolean {
  const key = a.householdKey?.trim();
  return Boolean(key && key === b.householdKey?.trim());
}

function personMeta(p: { id: string; name: string; role: string }) {
  return { id: p.id, name: p.name, role: p.role };
}

/**
 * The exceptions that apply to a request, most specific first. Two exceptions
 * of equal specificity resolve to the stricter action, never to the order the
 * owner happened to create them in.
 */
function matchExceptions(
  tpl: IndustryTemplate,
  policy: DualReleasePolicy,
  request: Pick<
    ReleaseRequest,
    "channel" | "amountUsd" | "initiatorPersonId" | "payee" | "asOfDate"
  >,
): ThresholdException[] {
  const asOf = request.asOfDate ?? localDateKey(new Date());
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

  return matched.sort(
    (a, b) =>
      exceptionSpecificity(b) - exceptionSpecificity(a) ||
      ACTION_STRICTNESS[b.action] - ACTION_STRICTNESS[a.action],
  );
}

/** A reason line when the two most specific matches tie and disagree, naming both. */
function exceptionTieNote(matches: readonly ThresholdException[]): string[] {
  const [first, runnerUp] = matches;
  if (!first || !runnerUp) return [];
  if (exceptionSpecificity(first) !== exceptionSpecificity(runnerUp)) return [];
  if (first.action === runnerUp.action) return [];
  return [
    `Exceptions "${first.label}" and "${runnerUp.label}" both match equally; the stricter one, "${first.label}", applies.`,
  ];
}

/** Specificity score — higher wins when multiple match. */
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

/** Tie-break between equally specific exceptions: the stricter action wins. */
const ACTION_STRICTNESS: Record<ExceptionAction, number> = {
  force_dual: 3,
  lower_threshold: 2,
  raise_threshold: 1,
  waive_dual: 0,
};

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
