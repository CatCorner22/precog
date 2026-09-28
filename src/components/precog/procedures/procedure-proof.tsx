import { useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldCls } from "@/components/ui/field-classes";
import { formatDay } from "@/lib/precog/dates";
import { setRelationLevel } from "@/lib/precog/continuity/coverage";
import { usePractice, usePracticeActions, useTemplate } from "@/lib/precog/practice-context";
import { procedureDutyConflicts } from "@/lib/precog/procedures/duty-conflicts";
import {
  backupProofs,
  levelRaiseOffer,
  proofIsStale,
  type LevelRaise,
} from "@/lib/precog/procedures/proof";
import { PROCEDURE_LIMITS } from "@/lib/precog/procedures/normalize";
import type { Procedure } from "@/lib/precog/procedures/types";
import { firstName, joinWithAnd } from "@/lib/precog/text";

/**
 * Who has shown they can follow this procedure without the usual person, and
 * a form to record a run. After an unaided run the owner is offered the level
 * change on Who knows what; it is logged in the Journal when accepted.
 */
export function ProofSection({ procedure, today }: { procedure: Procedure; today: string }) {
  const tpl = useTemplate();
  const { profile } = usePractice();
  const { recordProcedureProof, setCustomRelations, addDecision } = usePracticeActions();
  const people = tpl.people.filter((p) => p.active);
  const nameOf = (id: string) =>
    tpl.people.find((p) => p.id === id)?.name ?? "someone who has left";
  const candidates = people.filter((p) => p.id !== procedure.ownerPersonId);
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState(procedure.backupPersonIds[0] ?? candidates[0]?.id ?? "");
  const [on, setOn] = useState(today);
  const [alone, setAlone] = useState(true);
  const [note, setNote] = useState("");
  const [offer, setOffer] = useState<{ personId: string; on: string; raises: LevelRaise[] } | null>(
    null,
  );
  const proofs = backupProofs(procedure);
  const itemName = (id: string) => tpl.knowledge.find((k) => k.id === id)?.name ?? id;

  function record() {
    if (!personId || !on || on > today) return;
    recordProcedureProof(procedure.id, {
      personId,
      on,
      alone,
      ...(note.trim() ? { note: note.trim().slice(0, PROCEDURE_LIMITS.proofNote) } : {}),
    });
    const raises = levelRaiseOffer(tpl.relations, procedure, personId, alone);
    setOffer(raises.length ? { personId, on, raises } : null);
    setOpen(false);
    setNote("");
  }

  function acceptRaise() {
    if (!offer) return;
    setCustomRelations((current) =>
      offer.raises.reduce(
        (acc, r) => setRelationLevel(acc, offer.personId, r.knowledgeId, r.to),
        current,
      ),
    );
    const items = offer.raises.map((r) => itemName(r.knowledgeId));
    addDecision({
      subject: `${nameOf(offer.personId)} can do "${procedure.title}" alone`,
      kind: "remediate",
      note: `Followed the procedure without help on ${formatDay(offer.on)}. Marked as able to do ${joinWithAnd(items.map((n) => `"${n}"`))} alone on Who knows what.`,
      linkedTab: "procedures",
      linkedId: procedure.id,
    });
    setOffer(null);
  }

  return (
    <section className="space-y-2" aria-labelledby={`proof-${procedure.id}`}>
      <h3
        id={`proof-${procedure.id}`}
        className="text-xs font-medium uppercase tracking-wide text-muted"
      >
        Backup proved it
      </h3>
      {proofs.length === 0 ? (
        <p className="text-xs text-muted">
          Name who should be able to follow it when the usual person is out, then record a run when
          they do it.
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {proofs.map((p) => {
            const conflicts = procedureDutyConflicts(
              tpl,
              profile.dualRelease,
              procedure,
              p.personId,
              profile.staff,
            );
            return (
              <li key={p.personId} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {p.on && !proofIsStale(p.on, today) ? (
                    <CheckCircle2 className="size-4 text-ok" aria-hidden />
                  ) : (
                    <ClipboardCheck className="size-4 text-warn" aria-hidden />
                  )}
                  <span>{nameOf(p.personId)}</span>
                  <span className="text-xs text-muted">
                    {p.on
                      ? proofIsStale(p.on, today)
                        ? `last did it alone ${formatDay(p.on)}; due to prove it again`
                        : `did it alone ${formatDay(p.on)}`
                      : "has not done it alone yet"}
                  </span>
                </div>
                {conflicts.length > 0 && (
                  <DutyConflictNote name={nameOf(p.personId)} conflicts={conflicts} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {offer && (
        <div
          role="status"
          className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm"
        >
          <p>
            {firstName(nameOf(offer.personId))} did this alone. Mark them as able to do{" "}
            {joinWithAnd(offer.raises.map((r) => `"${itemName(r.knowledgeId)}"`))} alone on Who
            knows what? The change is logged in the Decisions log.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={acceptRaise}>
              Mark as able to do it alone
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOffer(null)}>
              Not now
            </Button>
          </div>
        </div>
      )}
      {open ? (
        <form
          className="grid gap-2 rounded-lg border border-border p-3 text-xs sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            record();
          }}
        >
          <label className="flex flex-col gap-1 text-muted">
            Who followed it
            <select
              className={fieldCls}
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
            >
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-muted">
            On
            <input
              type="date"
              className={fieldCls}
              value={on}
              max={today}
              onChange={(e) => setOn(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-muted sm:col-span-2">
            <input type="checkbox" checked={alone} onChange={(e) => setAlone(e.target.checked)} />
            They did it without help
          </label>
          <label className="flex flex-col gap-1 text-muted sm:col-span-2">
            Note (optional)
            <input
              className={fieldCls}
              value={note}
              maxLength={PROCEDURE_LIMITS.proofNote}
              placeholder="e.g. Covered the Friday deposit while Dana was out"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" type="submit" disabled={!personId || !on || on > today}>
              Record the run
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={candidates.length === 0}
          onClick={() => setOpen(true)}
        >
          <ClipboardCheck className="size-3.5" /> Record a run by someone else
        </Button>
      )}
    </section>
  );
}

/** The duty conflicts a backup would newly hold if they covered this procedure. */
export function DutyConflictNote({
  name,
  conflicts,
}: {
  name: string;
  conflicts: ReturnType<typeof procedureDutyConflicts>;
}) {
  return (
    <div className="space-y-1 rounded-md border border-warn/40 bg-warn/10 p-2 text-xs">
      {conflicts.map((c) => (
        <div key={c.id}>
          <p className="flex items-start gap-1.5 font-medium text-warn">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Covering this, {name} would also hold {c.labelA.toLowerCase()} and{" "}
            {c.labelB.toLowerCase()}: {c.title.toLowerCase()}.
          </p>
          <p className="pl-5 text-muted">{c.why}</p>
          {c.compensatingControls[0] && (
            <p className="pl-5 text-muted">
              Fine for temporary cover if: {c.compensatingControls[0]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
