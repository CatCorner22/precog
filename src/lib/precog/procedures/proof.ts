import { daysBetween } from "../dates";
import { relationLevel, STRONG_LEVELS } from "../continuity/coverage";
import type { IndustryId } from "../industry";
import { uid } from "../text";
import type { KnowledgeLevel, KnowledgeRelation } from "../types";
import { PROCEDURE_LIMITS } from "./normalize";
import type { Procedure, ProcedureProof } from "./types";

/**
 * "Backup proved it": a record that someone other than the usual person
 * followed the procedure on a given day. The record is evidence; it never
 * changes the register by itself. After an unaided run the owner is offered
 * the level change on Who knows what, and accepting it is logged in the
 * Journal so it can be seen and undone.
 */

/** A proof older than this is shown as due again: a year without doing it is not a working backup. */
export const PROOF_FRESH_DAYS = 365;

/** The procedure with a new proof first (newest first), capped. Not a content change: the verification stands. */
export function withProof(p: Procedure, proof: Omit<ProcedureProof, "id">): Procedure {
  const next: ProcedureProof = { id: uid("proof"), ...proof };
  return { ...p, proofs: [next, ...p.proofs].slice(0, PROCEDURE_LIMITS.proofs) };
}

/** One register item where an unaided run is a reason to mark the person as able to do it alone. */
export interface LevelRaise {
  knowledgeId: string;
  from: KnowledgeLevel | undefined;
  to: "proficient";
}

/**
 * The register items this procedure covers where `personId` is not yet
 * marked as able to do the work alone. Empty for a run with help: being
 * walked through once does not make someone a backup.
 */
export function levelRaiseOffer(
  relations: KnowledgeRelation[],
  procedure: Pick<Procedure, "knowledgeIds">,
  personId: string,
  alone: boolean,
): LevelRaise[] {
  if (!alone) return [];
  const strong = new Set<KnowledgeLevel>(STRONG_LEVELS);
  const out: LevelRaise[] = [];
  for (const knowledgeId of procedure.knowledgeIds) {
    const from = relationLevel(relations, personId, knowledgeId);
    if (from && strong.has(from)) continue;
    out.push({ knowledgeId, from, to: "proficient" });
  }
  return out;
}

/**
 * The latest unaided run by each person on each register item, across this
 * industry's procedures, keyed `${personId}\u0000${knowledgeId}`.
 */
export function provenBackups(
  procedures: readonly Procedure[],
  industry: IndustryId,
): Map<string, string> {
  const latest = new Map<string, string>();
  for (const p of procedures) {
    if (p.industry !== industry) continue;
    for (const proof of p.proofs) {
      if (!proof.alone) continue;
      for (const knowledgeId of p.knowledgeIds) {
        const key = `${proof.personId}\u0000${knowledgeId}`;
        const seen = latest.get(key);
        if (!seen || proof.on > seen) latest.set(key, proof.on);
      }
    }
  }
  return latest;
}

/**
 * The latest unaided run by each named backup of this procedure (null when
 * they have none), then by anyone else who has run it.
 */
export function backupProofs(p: Procedure): { personId: string; on: string | null }[] {
  const others = p.proofs
    .map((x) => x.personId)
    .filter((id, i, all) => !p.backupPersonIds.includes(id) && all.indexOf(id) === i);
  return [...p.backupPersonIds, ...others].map((personId) => {
    const runs = p.proofs.filter((x) => x.personId === personId && x.alone).map((x) => x.on);
    return { personId, on: runs.length ? runs.sort().at(-1)! : null };
  });
}

/** True when a proof dated `on` is more than a year old on `today`. */
export function proofIsStale(on: string, today: string): boolean {
  const age = daysBetween(on, today);
  return age !== null && age > PROOF_FRESH_DAYS;
}
