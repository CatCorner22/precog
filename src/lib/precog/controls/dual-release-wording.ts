import type { DualReleasePolicy } from "./dual-release";
import { formatUsd } from "@/lib/utils";

/**
 * How screens quote the live dual-release policy. A duty-conflict suggestion
 * or a recorded control that carries its own threshold ("Dual release on
 * payments > $1,000"), or none at all ("Dual release above threshold"), gives
 * way to the policy's own figures, so every screen quotes the same number.
 */

/**
 * The live dual-release policy as it applies to one rule, in one sentence, or
 * null when no channel of the policy addresses the rule. Thresholds are the
 * policy's own, so every screen quotes the same figure.
 */
export function dualReleaseLine(policy: DualReleasePolicy, ruleId: string): string | null {
  const covering = policy.rules.filter((r) => r.mitigatesRuleIds.includes(ruleId));
  if (covering.length === 0) return null;
  const on = policy.enabled ? covering.filter((r) => r.enabled) : [];
  if (on.length === 0) {
    return `Dual release is off for this in your policy; switching it on under Who controls what would require a second person on ${channelWords(covering)}`;
  }
  return `Your dual-release policy requires a second person on ${channelWords(on)}`;
}

/**
 * What closes a gap, with any threshold taken from the live policy: suggestions
 * that quote their own dual-release figure (or a bare "above threshold"), and
 * the detector's generic "policy active" note, give way to one sentence
 * quoting the policy. Controls already in place (the finding's
 * controlsInPlace) are left out: they are done, not steps to take.
 */
export function closingSteps(
  compensatingControls: readonly string[],
  policy: DualReleasePolicy,
  ruleId: string,
  inPlace: readonly string[] = [],
): string[] {
  const kept = compensatingControls.filter(
    (c) => !inPlace.includes(c) && !quotesOwnThreshold(c) && !GENERIC_POLICY_NOTE.test(c),
  );
  const line = dualReleaseLine(policy, ruleId);
  return line ? [...kept, line] : kept;
}

/**
 * A recorded control that quotes its own dual-release figure, or none,
 * rewritten to the live policy: its thresholds when the policy is on and a
 * channel covers the rule, "off" when the policy or every covering channel is
 * off, "no channel" when the policy is on but addresses none of the rules, and
 * no figure at all when no policy is at hand.
 */
export function withLiveThreshold(
  text: string,
  policy: DualReleasePolicy | undefined,
  ruleIds: readonly string[],
): string {
  if (!quotesOwnThreshold(text)) return text;
  if (!policy) return "Dual release above the thresholds in your dual-release policy";
  const covering = policy.rules.filter((r) =>
    r.mitigatesRuleIds.some((id) => ruleIds.includes(id)),
  );
  if (policy.enabled && covering.length === 0) {
    return "Dual release (your dual-release policy has no channel for this)";
  }
  const on = policy.enabled ? covering.filter((r) => r.enabled) : [];
  if (on.length === 0) return "Dual release (off in your dual-release policy)";
  return `Dual release per your policy: ${channelWords(on)}`;
}

/**
 * Suggestion wording that carries its own dual-release threshold, or none: the
 * old bare "above threshold" and the rule default that replaced it.
 */
const OWN_THRESHOLD = [
  /dual release on payments\s*>\s*\$[\d,]+/i,
  /^dual release above threshold$/i,
  /^a second person releases each payment above a set amount, using their own sign-in$/i,
];
/** The detector's note when a policy channel touches the rule. */
const GENERIC_POLICY_NOTE = /^dual-release policy active on related channel$/i;

function quotesOwnThreshold(text: string): boolean {
  return OWN_THRESHOLD.some((re) => re.test(text));
}

/** "ACH / vendor electronic pay above $500; New vendor master at every amount" */
function channelWords(rules: readonly DualReleasePolicy["rules"][number][]): string {
  return rules
    .map((r) =>
      r.thresholdUsd > 0
        ? `${r.label} above ${formatUsd(r.thresholdUsd)}`
        : `${r.label} at every amount`,
    )
    .join("; ");
}
