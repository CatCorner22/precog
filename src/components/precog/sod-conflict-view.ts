import { CONFLICT_RULES, entitlementLabel } from "@/lib/precog/sod/conflict-rules";
import type { DetectedConflict } from "@/lib/precog/sod/detect";
import type { DualReleasePolicy } from "@/lib/precog/controls/dual-release";
import { midSentence } from "@/lib/precog/text";

export type ConflictSeverity = DetectedConflict["severity"];

/** How a conflict is coloured, on every card that shows one. */
export type ConflictTone = "ok" | "danger" | "warn" | "default";

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
