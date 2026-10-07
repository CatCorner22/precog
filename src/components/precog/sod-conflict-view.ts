import { CONFLICT_RULES, entitlementLabel } from "@/lib/precog/sod/conflict-rules";
import type { DetectedConflict } from "@/lib/precog/sod/detect";
import type { DualReleasePolicy } from "@/lib/precog/controls/dual-release";
import { midSentence } from "@/lib/precog/text";
import { isPaymentDuty } from "@/lib/precog/sod/score";
import type { StaffComposition } from "@/lib/precog/types";
import { formatUsdTyped } from "@/lib/utils";

export type ConflictSeverity = DetectedConflict["severity"];

/** How a conflict is coloured, on every card that shows one. */
type ConflictTone = "ok" | "danger" | "warn" | "default";

/** The severity filter's options, in order, with the words the chips show. */
export const SEVERITY_FILTERS: { id: ConflictSeverity | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "family", label: "Related duties" },
];

/** Card borders and backgrounds per tone. */
export const TONE_SURFACE: Record<ConflictTone, string> = {
  ok: "border-ok/30 bg-ok/5",
  danger: "border-danger/30 bg-danger/5",
  warn: "border-warn/30 bg-warn/5",
  default: "border-border bg-elevated",
};

/**
 * The one colour rule for a conflict: narrowed by dual release is green; an
 * owner-held pair is error and tax exposure, not theft, so it is neutral;
 * otherwise critical is red, high is amber, and the rest are neutral.
 */
export function conflictTone(conflict: DetectedConflict): ConflictTone {
  if (conflict.dualReleaseMitigated) return "ok";
  if (conflict.ownerHeld) return "default";
  if (conflict.severity === "critical") return "danger";
  if (conflict.severity === "high") return "warn";
  return "default";
}

/** The badge that leads a conflict card: "Owner-held", or the severity in words. */
export function conflictBadge(conflict: DetectedConflict): string {
  if (conflict.ownerHeld) return "Owner-held";
  return SEVERITY_FILTERS.find((item) => item.id === conflict.severity)?.label ?? "Conflict";
}

/**
 * The plain reasons a conflict ranks where it does, in place of a number:
 * who holds the pair, whether dual release covers it, and the staffing that
 * leaves it open (no second approver on payments, nobody independent on the
 * bank reconciliation). When dual release covers the rule only above a
 * threshold (`partialDualReleaseCoverage`), pass that threshold: payments
 * below it still go out on one person's say-so, so the line names it. The
 * severity is the card's badge. Cards still sort by the score behind these;
 * the number itself saturates and is not a rank.
 */
export function conflictFactors(
  conflict: Pick<
    DetectedConflict,
    "personName" | "ownerHeld" | "dualReleaseMitigated" | "entitlementA" | "entitlementB"
  >,
  staff?: Pick<StaffComposition, "dualControlPayments" | "independentBankRec">,
  partialThresholdUsd?: number,
): string[] {
  const pair = [conflict.entitlementA, conflict.entitlementB];
  return [
    conflict.ownerHeld
      ? `Held by ${conflict.personName}, the owner`
      : `Held by ${conflict.personName}`,
    !conflict.dualReleaseMitigated
      ? "No dual release covers it"
      : partialThresholdUsd && partialThresholdUsd > 0
        ? `Dual release covers payments over ${formatUsdTyped(partialThresholdUsd)} only`
        : "Dual release covers it",
    ...(staff && !staff.dualControlPayments && pair.some(isPaymentDuty)
      ? ["No second approver on payments"]
      : []),
    ...(staff && !staff.independentBankRec && pair.includes("bank_reconcile")
      ? ["Nobody independent reconciles the bank"]
      : []),
  ];
}

/**
 * When a rule matched through a related duty, the card's title names the
 * rule's duty and the pair line names the one the person holds. This is the
 * sentence that joins them ("Here, Prepare bank deposit counts as Collect
 * cash."), or null when the person holds the rule's own pair.
 */
export function conflictBridge(conflict: DetectedConflict): string | null {
  const rule = CONFLICT_RULES.find((item) => item.id === conflict.ruleId);
  if (!rule) return null;
  const held = [conflict.entitlementA, conflict.entitlementB];
  const ruled = [rule.a, rule.b];
  const standIn = held.find((id) => !ruled.includes(id));
  const ruleDuty = ruled.find((id) => !held.includes(id));
  if (!standIn || !ruleDuty) return null;
  return `Here, ${entitlementLabel(standIn)} counts as ${midSentence(entitlementLabel(ruleDuty))}.`;
}

/**
 * The conflict rules any dual-release channel can narrow, whether or not the
 * channel is on: the only findings where "Configure dual release" can help.
 */
export function rulesDualReleaseCanNarrow(policy: DualReleasePolicy): Set<string> {
  return new Set(policy.rules.flatMap((rule) => rule.mitigatesRuleIds));
}

/** Conflicts grouped by person, in the order the report ranks them. */
export function conflictsByPerson(conflicts: readonly DetectedConflict[]): {
  personId: string;
  personName: string;
  role: string;
  conflicts: DetectedConflict[];
}[] {
  const groups = new Map<
    string,
    { personId: string; personName: string; role: string; conflicts: DetectedConflict[] }
  >();
  for (const conflict of conflicts) {
    const group = groups.get(conflict.personId) ?? {
      personId: conflict.personId,
      personName: conflict.personName,
      role: conflict.role,
      conflicts: [],
    };
    group.conflicts.push(conflict);
    groups.set(conflict.personId, group);
  }
  return [...groups.values()];
}

/**
 * What order the list is in, said when it opens with someone other than the
 * person the summary above it names for holding most of the money cycle
 * ("holds 6 of the 11 core money duties"): people run by their most severe
 * pair, not by how many duties they hold. Null when the two agree, or when
 * the summary names nobody.
 */
export function listOrderNote(
  open: readonly DetectedConflict[],
  holders: readonly {
    person: { personId: string; personName: string };
    cycle: readonly string[];
    of: number;
  }[],
): string | null {
  const leader = conflictsByPerson(open)[0];
  const holder = holders[0];
  if (!leader || !holder || holders.some((h) => h.person.personId === leader.personId)) {
    return null;
  }
  return `Grouped by person, in order of each person's most severe pair: ${leader.personName} comes first, not ${holder.person.personName}, who holds ${holder.cycle.length} of the ${holder.of} core money duties.`;
}
