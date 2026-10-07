import type { IndustryId } from "../industry";
import type { DetectedConflict } from "../sod/detect";
import type { KnowledgeItem } from "../types";
import {
  RECOMMENDED_PROCEDURES,
  recommendationFor,
  writtenProcedure,
  type LibraryRow,
  type RecommendedProcedure,
} from "./library";
import type { Procedure } from "./types";

/**
 * The written procedure each duty-conflict rule leads to: `primary` is the one
 * a conflict card links to; `also` names others that address part of the same
 * pair. Every rule has an entry (rule-procedures.test.ts checks it against
 * CONFLICT_RULES) and every entry names a procedure in the general library,
 * so it applies to every line of business the rule does.
 *
 * Some entries are interim until the library has their own procedure (the
 * wave-3 procedures slice, PB, remaps them): manual journal entries
 * (rule-je-rec, rule-release-je) lead to the bank reconciliation and payment
 * release procedures, supplier set-up (rule-vendor-create-*) to the vendor
 * bank change, and access administration (rule-access-log,
 * rule-access-export) to the leaver's access removal.
 */
export const RULE_PROCEDURE: Readonly<
  Record<string, { primary: string; also?: readonly string[] }>
> = {
  // Interim until PB: no access-review procedure yet.
  "rule-access-export": { primary: "lib-leaver-access" },
  // Interim until PB: no access-review procedure yet.
  "rule-access-log": { primary: "lib-leaver-access" },
  "rule-access-release": { primary: "lib-release-payments", also: ["lib-leaver-access"] },
  "rule-ach-release": { primary: "lib-release-payments" },
  // Recording payments received is money coming in. The bank reconciliation
  // ticks each deposit on the statement against a deposit in the books, so it
  // checks what was recorded as received against a record the system's
  // administrator cannot edit. The daily cash deposit counts the drawer and
  // never opens the books.
  "rule-admin-pay": { primary: "lib-bank-rec", also: ["lib-leaver-access"] },
  "rule-admin-writeoff": { primary: "lib-refund-review", also: ["lib-leaver-access"] },
  "rule-backup-access": { primary: "lib-backup-test" },
  "rule-card-approve": { primary: "lib-card-review" },
  "rule-card-review": { primary: "lib-card-review" },
  "rule-cash-admin": { primary: "lib-cash-deposit", also: ["lib-leaver-access"] },
  "rule-cash-rec": { primary: "lib-bank-rec", also: ["lib-cash-deposit"] },
  "rule-cash-refund": { primary: "lib-refund-review", also: ["lib-drawer-close"] },
  "rule-cash-void": { primary: "lib-refund-review", also: ["lib-drawer-close"] },
  "rule-claims-writeoff": { primary: "lib-refund-review" },
  "rule-collect-adjust": { primary: "lib-refund-review" },
  "rule-collect-post": {
    primary: "lib-cash-deposit",
    also: ["lib-mailed-checks", "lib-drawer-close"],
  },
  "rule-custody-rec": { primary: "lib-bank-rec", also: ["lib-mailed-checks"] },
  "rule-deposit-post": { primary: "lib-cash-deposit", also: ["lib-mailed-checks"] },
  "rule-invoice-approve": { primary: "lib-release-payments" },
  "rule-invoice-pay": { primary: "lib-release-payments" },
  // Interim until PB: no manual journal entry procedure yet.
  "rule-je-rec": { primary: "lib-bank-rec" },
  "rule-order-receive": { primary: "lib-receiving" },
  "rule-payments-adjust": { primary: "lib-refund-review" },
  "rule-payroll": { primary: "lib-payroll" },
  "rule-payroll-master-release": { primary: "lib-payroll" },
  "rule-payroll-master-run": { primary: "lib-payroll" },
  "rule-payroll-rec": { primary: "lib-payroll", also: ["lib-bank-rec"] },
  "rule-payroll-release": { primary: "lib-payroll" },
  "rule-refund-adjust": { primary: "lib-refund-review" },
  "rule-refund-post": { primary: "lib-refund-review" },
  // Interim until PB: no manual journal entry procedure yet.
  "rule-release-je": { primary: "lib-release-payments" },
  "rule-release-rec": { primary: "lib-bank-rec" },
  "rule-sign-rec": { primary: "lib-bank-rec" },
  "rule-vendor-approve-pay": { primary: "lib-release-payments" },
  // Interim until PB: no new-supplier procedure yet.
  "rule-vendor-create-approve": { primary: "lib-vendor-bank-change" },
  // Interim until PB: no new-supplier procedure yet.
  "rule-vendor-create-invoice": { primary: "lib-vendor-bank-change" },
  // Interim until PB: no new-supplier procedure yet.
  "rule-vendor-create-pay": { primary: "lib-vendor-bank-change" },
  "rule-writeoff": { primary: "lib-refund-review" },
};

const BY_ID = new Map(RECOMMENDED_PROCEDURES.map((r) => [r.id, r]));

/** The written procedure a conflict card links to, or undefined for a rule with no entry. */
export function procedureForConflict(ruleId: string): RecommendedProcedure | undefined {
  const id = RULE_PROCEDURE[ruleId]?.primary;
  return id ? BY_ID.get(id) : undefined;
}

/** Every library procedure a rule leads to: its primary first, then the others. */
export function libraryIdsForRule(ruleId: string): string[] {
  const entry = RULE_PROCEDURE[ruleId];
  return entry ? [entry.primary, ...(entry.also ?? [])] : [];
}

/** The Procedures tab item that opens a recommended procedure (`?tab=procedures&item=lib:<id>`). */
export const LIBRARY_ITEM_PREFIX = "lib:";

export function libraryItem(libraryId: string): string {
  return `${LIBRARY_ITEM_PREFIX}${libraryId}`;
}

/** The library id a Procedures tab item names, or null for any other item. */
export function libraryIdFromItem(item: string | null | undefined): string | null {
  if (!item?.startsWith(LIBRARY_ITEM_PREFIX)) return null;
  const id = item.slice(LIBRARY_ITEM_PREFIX.length);
  return BY_ID.has(id) ? id : null;
}

/**
 * The business's own procedure for a recommendation, when it has one, as
 * `libraryRows` counts it written (writtenProcedure). For an id the library
 * does not hold, only a procedure started from it counts.
 */
export function writtenProcedureFor(
  libraryId: string,
  procedures: readonly Procedure[],
  knowledge: readonly Pick<KnowledgeItem, "id" | "name">[],
  industry: IndustryId,
): Procedure | undefined {
  const own = procedures.filter((p) => p.industry === industry);
  const recommendation = BY_ID.get(libraryId);
  return recommendation
    ? writtenProcedure(recommendation, own, knowledge)
    : own.find((p) => p.libraryId === libraryId);
}

/**
 * Where a conflict card's procedure link goes and what it reads: the
 * business's own procedure when one is written, else the recommendation on
 * the Procedures tab, ready to start, in this line of business's words.
 */
export function conflictProcedureLink(
  ruleId: string,
  procedures: readonly Procedure[],
  knowledge: readonly Pick<KnowledgeItem, "id" | "name">[],
  industry: IndustryId,
): { title: string; item: string; started: boolean } | null {
  const shared = procedureForConflict(ruleId);
  if (!shared) return null;
  const recommendation = recommendationFor(shared, industry);
  const own = writtenProcedureFor(recommendation.id, procedures, knowledge, industry);
  return own
    ? { title: own.title || recommendation.title, item: own.id, started: true }
    : { title: recommendation.title, item: libraryItem(recommendation.id), started: false };
}

/**
 * The recommendations ordered by the open conflicts they address: those
 * linked to an open critical conflict first, then to an open high one, then
 * the rest; within each, those addressing more of those conflicts first, and
 * otherwise in the order given. A recommendation an open conflict leads to
 * counts as fitting this business, so it is shown before "Show all".
 */
export function rankLibraryRowsByConflicts(
  rows: readonly LibraryRow[],
  openConflicts: readonly Pick<DetectedConflict, "ruleId" | "severity">[],
): LibraryRow[] {
  const addressed = new Map<string, { critical: number; high: number }>();
  for (const c of openConflicts) {
    for (const id of new Set(libraryIdsForRule(c.ruleId))) {
      const tally = addressed.get(id) ?? { critical: 0, high: 0 };
      if (c.severity === "critical") tally.critical += 1;
      else if (c.severity === "high") tally.high += 1;
      addressed.set(id, tally);
    }
  }
  const rank = (row: LibraryRow): [number, number] => {
    const tally = addressed.get(row.recommendation.id);
    if (tally?.critical) return [0, -tally.critical];
    if (tally?.high) return [1, -tally.high];
    return [2, 0];
  };
  return rows
    .map((row, index) => ({ row, index, rank: rank(row) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.index - b.index)
    .map(({ row }) => (addressed.has(row.recommendation.id) ? { ...row, fits: true } : row));
}
