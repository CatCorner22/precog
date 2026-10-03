import { daysBetween, shiftDay } from "../dates";
import type { IndustryId } from "../industry";
import type { KnowledgeItem, Person } from "../types";
import { isWrittenProcedure, procedureStatus, reviewByDate } from "./lifecycle";
import { backupProofs, proofIsStale } from "./proof";
import type { Procedure } from "./types";

/**
 * What needs the owner's attention on the Procedures tab, worked out once
 * for the reminders, the weekly actions and the report so the three never
 * disagree: a verification about to run out, and a critical task whose named
 * backups have not yet shown they can do it alone.
 */
export interface ProcedureAttention {
  /** Verified procedures whose review date is within `leadDays`, or past. */
  reviewDue: { procedure: Procedure; dueOn: string; overdue: boolean }[];
  /**
   * Written procedures for a critical register item, with named backups none
   * of whom has done it alone in the past year. Due `PROVE_WITHIN_DAYS` after
   * the procedure was written. A named backup who has left counts for
   * nothing: `backupIds` lists only those still working here.
   */
  unproven: { procedure: Procedure; backupIds: string[]; dueOn: string; overdue: boolean }[];
}

/** Days a backup has to prove a critical procedure once it is written. */
export const PROVE_WITHIN_DAYS = 90;
/** How soon before a review date the owner hears about it. */
export const REVIEW_LEAD_DAYS = 7;

/**
 * Whether a named backup of this procedure who is still working here has done
 * it alone in the past year. A proof by someone who has since left proves no
 * cover; it stays on the procedure as history.
 */
function provenByCurrentBackup(p: Procedure, current: ReadonlySet<string>, today: string): boolean {
  return backupProofs(p).some(
    (b) =>
      p.backupPersonIds.includes(b.personId) &&
      current.has(b.personId) &&
      b.on &&
      !proofIsStale(b.on, today),
  );
}

/** Ids of the people still working here. */
function currentIds(people: readonly Pick<Person, "id" | "active">[]): Set<string> {
  return new Set(people.filter((p) => p.active).map((p) => p.id));
}

export function procedureAttention(
  procedures: readonly Procedure[],
  knowledge: readonly KnowledgeItem[],
  people: readonly Pick<Person, "id" | "active">[],
  industry: IndustryId,
  today: string,
  leadDays = REVIEW_LEAD_DAYS,
): ProcedureAttention {
  const critical = new Set(knowledge.filter((k) => k.criticality === "critical").map((k) => k.id));
  const current = currentIds(people);
  const reviewDue: ProcedureAttention["reviewDue"] = [];
  const unproven: ProcedureAttention["unproven"] = [];
  for (const p of procedures) {
    if (p.industry !== industry || !isWrittenProcedure(p)) continue;
    const due = reviewByDate(p);
    if (due && (daysBetween(today, due) ?? 0) <= leadDays) {
      reviewDue.push({ procedure: p, dueOn: due, overdue: procedureStatus(p, today) === "stale" });
    }
    if (p.backupPersonIds.length > 0 && p.knowledgeIds.some((id) => critical.has(id))) {
      if (!provenByCurrentBackup(p, current, today)) {
        const dueOn = shiftDay(p.createdAt, PROVE_WITHIN_DAYS);
        if ((daysBetween(today, dueOn) ?? 0) <= leadDays) {
          unproven.push({
            procedure: p,
            backupIds: p.backupPersonIds.filter((id) => current.has(id)),
            dueOn,
            overdue: dueOn < today,
          });
        }
      }
    }
  }
  const byDue = (a: { dueOn: string }, b: { dueOn: string }) => a.dueOn.localeCompare(b.dueOn);
  return { reviewDue: reviewDue.sort(byDue), unproven: unproven.sort(byDue) };
}

/** Counts for the printed report: how far the business's procedures cover its critical work. */
export interface ProcedureSummary {
  written: number;
  verified: number;
  reviewOverdue: number;
  /** Critical register items with no procedure written on the tab. */
  criticalWithout: number;
  /** Critical register items whose procedure has a backup who did it alone in the past year. */
  criticalProven: number;
  criticalTotal: number;
}

export function procedureSummary(
  procedures: readonly Procedure[],
  knowledge: readonly KnowledgeItem[],
  people: readonly Pick<Person, "id" | "active">[],
  industry: IndustryId,
  today: string,
): ProcedureSummary {
  const own = procedures.filter((p) => p.industry === industry && isWrittenProcedure(p));
  const critical = knowledge.filter((k) => k.criticality === "critical");
  const current = currentIds(people);
  const provenItems = new Set<string>();
  const writtenItems = new Set<string>();
  for (const p of own) {
    for (const id of p.knowledgeIds) writtenItems.add(id);
    // Only a current named backup's unaided run counts, as in procedureAttention above.
    if (provenByCurrentBackup(p, current, today))
      for (const id of p.knowledgeIds) provenItems.add(id);
  }
  return {
    written: own.length,
    verified: own.filter((p) => procedureStatus(p, today) === "verified").length,
    reviewOverdue: own.filter((p) => procedureStatus(p, today) === "stale").length,
    criticalWithout: critical.filter((k) => !writtenItems.has(k.id)).length,
    criticalProven: critical.filter((k) => provenItems.has(k.id)).length,
    criticalTotal: critical.length,
  };
}
