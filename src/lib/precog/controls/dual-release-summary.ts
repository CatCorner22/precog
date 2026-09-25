import type { IndustryTemplate } from "../templates";
import type { DualReleaseCoverage, DualReleasePolicy, ReleaseChannel } from "./dual-release-policy";
import { isDateActive, listEligibleApprovers, todayIso } from "./dual-release-evaluate";

/** What the policy covers and mitigates, read by the SoD engine and the staff flags. */
/**
 * The conflict rules an active dual-release policy narrows. With the team
 * given, a channel counts only when someone on it may initiate and a
 * different person may second: a policy nobody can operate, or one where the
 * only second signer is the initiator, narrows nothing.
 */
export function mitigatedSodRuleIds(
  policy: DualReleasePolicy,
  tpl?: Pick<IndustryTemplate, "people">,
): Set<string> {
  const ids = new Set<string>();
  if (!policy.enabled) return ids;
  for (const r of policy.rules) {
    if (!r.enabled) continue;
    if (tpl && !hasDistinctSecond(tpl, policy, r.channel)) continue;
    for (const mid of r.mitigatesRuleIds) ids.add(mid);
  }
  return ids;
}

function hasDistinctSecond(
  tpl: Pick<IndustryTemplate, "people">,
  policy: DualReleasePolicy,
  channel: ReleaseChannel,
): boolean {
  const eligible = listEligibleApprovers(tpl as IndustryTemplate, policy, channel);
  const initiators = eligible.filter((p) => p.canInitiate);
  const seconds = eligible.filter((p) => p.canSecond);
  return initiators.some((a) => seconds.some((b) => b.id !== a.id));
}

export function dualReleaseCoverage(policy: DualReleasePolicy): DualReleaseCoverage[] {
  return policy.rules.map((r) => ({
    channel: r.channel,
    label: r.label,
    enabled: policy.enabled && r.enabled,
    thresholdUsd: r.thresholdUsd,
    mitigatesRuleIds: r.mitigatesRuleIds,
    covered: policy.enabled && r.enabled,
    activeExceptions: (policy.exceptions ?? []).filter(
      (e) => e.enabled && (e.channels.length === 0 || e.channels.includes(r.channel)),
    ).length,
  }));
}

export function staffFlagsFromDualRelease(policy: DualReleasePolicy): {
  dualControlPayments: boolean;
} {
  const ach = policy.rules.find((r) => r.channel === "ach");
  const deposit = policy.rules.find((r) => r.channel === "deposit");
  const dualControlPayments = Boolean(policy.enabled && (ach?.enabled || deposit?.enabled));
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
  const active = (policy.exceptions ?? []).filter((e) => e.enabled && isDateActive(e, today));
  return {
    total: active.length,
    raises: active.filter((e) => e.action === "raise_threshold").length,
    forceDual: active.filter((e) => e.action === "force_dual").length,
    waives: active.filter((e) => e.action === "waive_dual").length,
    expiringSoon: active.filter((e) => e.effectiveTo && e.effectiveTo <= in30).length,
  };
}
