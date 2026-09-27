/**
 * Which rule, if any, a pair of duties falls under: a named rule, a named rule
 * read through another channel of one of its duties, or the duty-family
 * catch-all. The detector, the pair matrix and "what you get right" all ask
 * these questions here, so they cannot disagree.
 */
import {
  CHANNEL_OF,
  CONFLICT_RULES,
  ENTITLEMENTS,
  FAMILY_CONFLICT_MATRIX,
  PAYMENT_CHANNELS,
  SUBSUMED_BY,
  type ConflictRule,
  type DutyFamily,
  type EntitlementId,
  entitlementById,
} from "./conflict-rules";

/** A rule a pair of duties falls under, with the duties the person actually holds in the rule's two seats. */
export interface RuleMatch {
  rule: ConflictRule;
  /** The person's duty standing in the rule's `a` seat. */
  a: EntitlementId;
  /** The person's duty standing in the rule's `b` seat. */
  b: EntitlementId;
  /** False when one duty stands in for the rule's duty as another channel of it. */
  direct: boolean;
}

/** One cell of the duty-by-duty matrix the Duty conflicts view draws. */
export interface SodMatrixCell {
  row: EntitlementId;
  col: EntitlementId;
  status: "safe" | "conflict" | "self" | "n/a";
  ruleIds: string[];
  severity?: ConflictRule["severity"] | "family";
}

/** The rule a pair of duties falls under: its own rule first, then a rule for a duty it is a channel of. */
export function findRule(x: EntitlementId, y: EntitlementId): RuleMatch | undefined {
  const direct = directRule(x, y);
  if (direct) {
    return direct.a === x
      ? { rule: direct, a: x, b: y, direct: true }
      : { rule: direct, a: y, b: x, direct: true };
  }
  return viaChannel(x, y) ?? viaChannel(y, x);
}

/**
 * A pair the family catch-all flags for one person when no named rule covers
 * it: families that conflict, in a process both duties touch, and not one of
 * the combinations below that are one seat rather than two duties.
 */
export function familyPair(a: EntitlementId, b: EntitlementId): boolean {
  if (a === "view_reports_only" || b === "view_reports_only") return false;
  if (ACCESS_DUTIES.has(a) && ACCESS_DUTIES.has(b)) return false;
  if (PAYMENT_CHANNELS.has(a) && PAYMENT_CHANNELS.has(b)) return false;
  if (bossPowers(a, b)) return false;
  if (isCardPurchase(a, b)) return false;
  // Reading the card statement is a check on the people who spend on the
  // card, not on the bills or the payments, so it pairs with holding a card
  // (the named rule) and with nothing else in the payables cycle.
  if (a === "review_card_statement" || b === "review_card_statement") return false;
  return familiesConflict(entitlementFamily(a), entitlementFamily(b)) && sharesProcess(a, b);
}

/**
 * The duty-by-duty matrix: for each ordered pair, the rule or family finding
 * one person holding just those two duties would get. It depends only on the
 * rulebook, so it is built once.
 */
export function sodMatrix(): readonly SodMatrixCell[] {
  matrixCache ??= buildMatrix();
  return matrixCache;
}

/** Duty ids in the order the matrix lists them. */
export const ENTITLEMENT_ORDER: readonly EntitlementId[] = ENTITLEMENTS.map((e) => e.id);

/**
 * The rules one person holding `duties` holds both sides of, read through
 * channels, whether or not the finding survives (an owner's oversight pair, a
 * rule another finding covers).
 */
export function rulesHeldTogether(duties: readonly EntitlementId[]): Set<string> {
  const held = new Set<string>();
  for (let i = 0; i < duties.length; i++) {
    for (let j = i + 1; j < duties.length; j++) {
      const match = findRule(duties[i], duties[j]);
      if (match) held.add(match.rule.id);
    }
  }
  return held;
}

/**
 * Duties anyone on the team holds, counting a channel as the duty it stands
 * for: whoever initiates an ACH or signs checks sends money out, and whoever
 * prepares the deposit holds the cash.
 */
export function teamHeldDuties(
  assignments: readonly { entitlements: readonly EntitlementId[] }[],
): Set<EntitlementId> {
  const held = new Set<EntitlementId>();
  for (const person of assignments) {
    for (const duty of person.entitlements) {
      held.add(duty);
      const channel = CHANNEL_OF[duty];
      if (channel) held.add(channel);
    }
  }
  return held;
}

/** The compensating controls of the rules a rule's finding covers (see SUBSUMED_BY), by the covering rule's id. */
export const SUBSUMED_DEFAULTS: Readonly<Record<string, readonly string[]>> = (() => {
  const byRule: Record<string, string[]> = {};
  for (const [under, over] of Object.entries(SUBSUMED_BY)) {
    const defaults = CONFLICT_RULES.find((r) => r.id === under)?.compensatingDefaults ?? [];
    byRule[over] = [...(byRule[over] ?? []), ...defaults];
  }
  return byRule;
})();

/** A pair in a fixed order, so (a, b) and (b, a) name one pair. */
export function canonicalPair(a: EntitlementId, b: EntitlementId): [EntitlementId, EntitlementId] {
  return a.localeCompare(b) <= 0 ? [a, b] : [b, a];
}

/** The id a family finding carries: the two families, sorted. */
export function familyRuleId(a: DutyFamily, b: DutyFamily): string {
  return `family-${[a, b].sort().join("-")}`;
}

/** A duty's family; recording for an id the rulebook does not know. */
export function entitlementFamily(id: EntitlementId): DutyFamily {
  return entitlementById(id)?.family ?? "recording";
}

/** The processes a duty touches. */
export function entitlementProcesses(id: EntitlementId): string[] {
  return entitlementById(id)?.processIds ?? [];
}

const RULE_BY_PAIR = new Map<string, ConflictRule>(
  CONFLICT_RULES.map((rule) => [pairKey(rule.a, rule.b), rule]),
);

let matrixCache: readonly SodMatrixCell[] | undefined;

const APPROVAL_DUTIES = new Set<EntitlementId>([
  "approve_vendor",
  "approve_invoices",
  "approve_payroll",
  "approve_writeoffs",
  "approve_expenses",
  "sign_checks",
]);
const ACCESS_DUTIES = new Set<EntitlementId>(["manage_user_access", "pms_admin_roles"]);

function pairKey(a: EntitlementId, b: EntitlementId): string {
  return canonicalPair(a, b).join("|");
}

function directRule(a: EntitlementId, b: EntitlementId): ConflictRule | undefined {
  return RULE_BY_PAIR.get(pairKey(a, b));
}

function viaChannel(x: EntitlementId, y: EntitlementId): RuleMatch | undefined {
  if (PAYMENT_CHANNELS.has(x) && PAYMENT_CHANNELS.has(y)) return undefined;
  const channel = CHANNEL_OF[x];
  if (!channel || channel === y) return undefined;
  const rule = directRule(channel, y);
  if (!rule) return undefined;
  return rule.a === channel
    ? { rule, a: x, b: y, direct: false }
    : { rule, a: y, b: x, direct: false };
}

function buildMatrix(): SodMatrixCell[] {
  const matrix: SodMatrixCell[] = [];
  for (const row of ENTITLEMENT_ORDER) {
    for (const col of ENTITLEMENT_ORDER) {
      if (row === col) {
        matrix.push({ row, col, status: "self", ruleIds: [] });
        continue;
      }
      const rule = findRule(row, col)?.rule;
      if (rule) {
        matrix.push({ row, col, status: "conflict", ruleIds: [rule.id], severity: rule.severity });
      } else if (familyPair(row, col)) {
        matrix.push({
          row,
          col,
          status: "conflict",
          ruleIds: [familyRuleId(entitlementFamily(row), entitlementFamily(col))],
          severity: "family",
        });
      } else {
        matrix.push({ row, col, status: "safe", ruleIds: [] });
      }
    }
  }
  return matrix;
}

/**
 * Approving and administering access are one seat in any small business (the
 * manager approves and the manager holds the admin login). The named rules
 * cover the admin combinations that matter; the family catch-all would flag
 * every owner and manager for holding the boss's powers.
 */
function bossPowers(a: EntitlementId, b: EntitlementId): boolean {
  return (
    (APPROVAL_DUTIES.has(a) && ACCESS_DUTIES.has(b)) ||
    (APPROVAL_DUTIES.has(b) && ACCESS_DUTIES.has(a))
  );
}

/**
 * Ordering supplies and paying for them on the company card is one act of
 * buying, not an approval and a payment in the same hands; the control on it
 * is whoever reads the statement afterwards, which the named card rules cover.
 */
function isCardPurchase(a: EntitlementId, b: EntitlementId): boolean {
  return (
    (a === "hold_company_card" && b === "order_supplies") ||
    (a === "order_supplies" && b === "hold_company_card")
  );
}

function familiesConflict(fa: DutyFamily, fb: DutyFamily): boolean {
  if (fa === fb) {
    // Two custody duties are one custody chain: the person who takes the
    // payment also bags the deposit in every small office, and the control is
    // that someone else posts and reconciles it (named rules cover that).
    // Two master-data duties still conflict: one person shaping both the
    // payee list and the price list is the shell-vendor setup.
    return fa === "master_data";
  }
  return Boolean(FAMILY_CONFLICT_MATRIX[fa]?.[fb]);
}

function sharesProcess(a: EntitlementId, b: EntitlementId): boolean {
  const left = entitlementProcesses(a);
  const right = new Set(entitlementProcesses(b));
  return left.some((processId) => right.has(processId));
}
