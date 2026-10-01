import type { IndustryTemplate } from "../templates";
import type {
  DualReleaseCoverage,
  DualReleasePolicy,
  ReleaseChannel,
  ThresholdException,
} from "./dual-release-policy";
import { isDateActive, listEligibleApprovers, sharesHousehold } from "./dual-release-evaluate";
import { localDateKey, shiftDay } from "../dates";

/**
 * The conflict rules an active dual-release policy narrows. With the team
 * given, a channel counts only when someone on it may initiate and a
 * different person may second: a policy nobody can operate, or one where the
 * only second signer is the initiator, narrows nothing. A channel emptied by
 * a blanket waiver in force on `today` (the owner's local day) narrows
 * nothing either, since one person may then release at any amount.
 */
export function mitigatedSodRuleIds(
  policy: DualReleasePolicy,
  tpl?: Pick<IndustryTemplate, "people">,
  today: string = localDateKey(new Date()),
): Set<string> {
  const ids = new Set<string>();
  if (!policy.enabled) return ids;
  const waived = blanketWaivedChannels(policy, today);
  for (const r of policy.rules) {
    if (!r.enabled || waived.has(r.channel)) continue;
    if (tpl && !hasDistinctSecond(tpl, policy, r.channel)) continue;
    for (const mid of r.mitigatesRuleIds) ids.add(mid);
  }
  return ids;
}

/**
 * What each channel card shows. A channel is covered when the policy and the
 * channel are on and no blanket waiver empties it; `activeExceptions` counts
 * the enabled exceptions in force on `today`, as activeExceptionSummary does.
 */
export function dualReleaseCoverage(
  policy: DualReleasePolicy,
  today: string = localDateKey(new Date()),
): DualReleaseCoverage[] {
  const waived = blanketWaivedChannels(policy, today);
  return policy.rules.map((r) => ({
    channel: r.channel,
    label: r.label,
    enabled: policy.enabled && r.enabled,
    thresholdUsd: r.thresholdUsd,
    mitigatesRuleIds: r.mitigatesRuleIds,
    covered: policy.enabled && r.enabled && !waived.has(r.channel),
    activeExceptions: (policy.exceptions ?? []).filter(
      (e) =>
        e.enabled &&
        isDateActive(e, today) &&
        (e.channels.length === 0 || e.channels.includes(r.channel)),
    ).length,
  }));
}

/** The channels that move money to a payee; a deposit count or a write-off approval is not payment dual control. */
const PAYMENT_CHANNELS: readonly ReleaseChannel[] = ["ach", "check"];

/**
 * Whether the business has dual control on payments, for the staff flag the
 * residual and scenario engines credit. It holds only when a payment channel
 * (ACH or checks) is on, no blanket waiver empties it, and, with the team
 * given, someone may start a release and a different person may second it:
 * the same reading mitigatedSodRuleIds gives the SoD engine.
 */
export function staffFlagsFromDualRelease(
  policy: DualReleasePolicy,
  tpl?: Pick<IndustryTemplate, "people">,
  today: string = localDateKey(new Date()),
): { dualControlPayments: boolean } {
  if (!policy.enabled) return { dualControlPayments: false };
  const waived = blanketWaivedChannels(policy, today);
  const dualControlPayments = policy.rules.some(
    (r) =>
      PAYMENT_CHANNELS.includes(r.channel) &&
      r.enabled &&
      !waived.has(r.channel) &&
      (!tpl || hasDistinctSecond(tpl, policy, r.channel)),
  );
  return { dualControlPayments };
}

/** Exceptions in force on `today`, the owner's local calendar day ("YYYY-MM-DD"). */
export function activeExceptionSummary(
  policy: DualReleasePolicy,
  today: string,
): {
  total: number;
  raises: number;
  forceDual: number;
  waives: number;
  expiringSoon: number;
} {
  const in30 = shiftDay(today, 30);
  const active = (policy.exceptions ?? []).filter((e) => e.enabled && isDateActive(e, today));
  return {
    total: active.length,
    raises: active.filter((e) => e.action === "raise_threshold").length,
    forceDual: active.filter((e) => e.action === "force_dual").length,
    waives: active.filter((e) => e.action === "waive_dual").length,
    expiringSoon: active.filter((e) => e.effectiveTo && e.effectiveTo <= in30).length,
  };
}

/**
 * A waiver with no payee, person, role or amount matcher applies to every
 * release on its channels, so the channel runs on one person's say-so.
 */
function isBlanketWaiver(e: ThresholdException): boolean {
  return (
    e.action === "waive_dual" &&
    !e.payeeContains &&
    !e.personId &&
    !e.role &&
    e.amountMinUsd == null &&
    e.amountMaxUsd == null
  );
}

/** Channels an enabled blanket waiver in force on `today` empties. */
function blanketWaivedChannels(policy: DualReleasePolicy, today: string): Set<ReleaseChannel> {
  const out = new Set<ReleaseChannel>();
  for (const e of policy.exceptions ?? []) {
    if (!e.enabled || !isBlanketWaiver(e) || !isDateActive(e, today)) continue;
    for (const r of policy.rules) {
      if (e.channels.length === 0 || e.channels.includes(r.channel)) out.add(r.channel);
    }
  }
  return out;
}

function hasDistinctSecond(
  tpl: Pick<IndustryTemplate, "people">,
  policy: DualReleasePolicy,
  channel: ReleaseChannel,
): boolean {
  const eligible = listEligibleApprovers(tpl as IndustryTemplate, policy, channel);
  const initiators = eligible.filter((p) => p.canInitiate);
  const seconds = eligible.filter((p) => p.canSecond);
  return initiators.some((a) =>
    seconds.some((b) => {
      if (b.id === a.id) return false;
      if (policy.unrelatedSignersAttested) return true;
      const left = tpl.people.find((p) => p.id === a.id);
      const right = tpl.people.find((p) => p.id === b.id);
      return !(left && right && sharesHousehold(left, right));
    }),
  );
}
