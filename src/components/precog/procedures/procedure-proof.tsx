import { useEffect, useReducer, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldCls } from "@/components/ui/field-classes";
import { formatDay } from "@/lib/precog/dates";
import { setRelationLevel } from "@/lib/precog/continuity/coverage";
import { usePractice, usePracticeActions, useTemplate } from "@/lib/precog/practice-context";
import { procedureDutyConflicts } from "@/lib/precog/procedures/duty-conflicts";
import { backupProofs, levelRaiseOffer, proofIsStale } from "@/lib/precog/procedures/proof";
import { PROCEDURE_LIMITS } from "@/lib/precog/procedures/normalize";
import type { Procedure } from "@/lib/precog/procedures/types";
import { firstName, joinWithAnd } from "@/lib/precog/text";

/**
 * Runs whose level offer the owner answered "Not now" to in this session, by
 * procedure and run, so the offer stays answered when they switch procedures.
 */
const declinedOffers = new Set<string>();

/**
 * Who has shown they can follow this procedure without the usual person, and
 * a form to record a run. After an unaided run the owner is offered the level
 * change on Who knows what; it is logged in the Journal when accepted. The
 * offer is worked out from the latest run each time, so leaving the
 * procedure and coming back does not lose it.
 */
export function ProofSection({
  procedure,
  today,
  defaultOpen = false,
}: {
  procedure: Procedure;
  today: string;
  /** Open the form to record a run straight away, as after following the steps. */
  defaultOpen?: boolean;
}) {
  const tpl = useTemplate();
  const { profile } = usePractice();
  const { recordProcedureProof, setCustomRelations, addDecision } = usePracticeActions();
  const people = tpl.people.filter((p) => p.active);
  const nameOf = (id: string) =>
    tpl.people.find((p) => p.id === id)?.name ?? "someone who has left";
  const candidates = people.filter((p) => p.id !== procedure.ownerPersonId);
  const [open, setOpen] = useState(defaultOpen);
  const [personId, setPersonId] = useState(procedure.backupPersonIds[0] ?? candidates[0]?.id ?? "");
  const [on, setOn] = useState(today);
  const [alone, setAlone] = useState(true);
  const [note, setNote] = useState("");
  // "Not now" is kept outside the component, so this only redraws it.
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const latest = procedure.proofs[0];
  const offerKey = latest ? `${procedure.id}:${latest.id}` : "";
  const raises =
    latest && latest.alone && !proofIsStale(latest.on, today) && !declinedOffers.has(offerKey)
      ? levelRaiseOffer(tpl.relations, procedure, latest.personId, true)
      : [];
  const offer =
    latest && raises.length ? { personId: latest.personId, on: latest.on, raises } : null;
  // Keyboard focus follows the form and the offer as they appear and go.
  const recordButton = useRef<HTMLButtonElement>(null);
  const offerBox = useRef<HTMLDivElement>(null);
  const [focusNext, setFocusNext] = useState<"offer" | "record" | null>(null);
  useEffect(() => {
    if (!focusNext) return;
    if (focusNext === "offer" && offerBox.current) offerBox.current.focus();
    else recordButton.current?.focus();
    setFocusNext(null);
  }, [focusNext]);
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
    setOpen(false);
    setNote("");
    setFocusNext(
      levelRaiseOffer(tpl.relations, procedure, personId, alone).length ? "offer" : "record",
    );
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
      note: `Followed the procedure without help on ${formatDay(offer.on)}. Who knows what now shows them as able to do ${joinWithAnd(items.map((n) => `"${n}"`))} alone.`,
      linkedTab: "procedures",
      linkedId: procedure.id,
    });
    setFocusNext("record");
  }

  function declineRaise() {
    declinedOffers.add(offerKey);
    redraw();
    setFocusNext("record");
  }

  return (
    <section
      id={`proof-section-${procedure.id}`}
      className="scroll-mt-40 space-y-2"
      aria-labelledby={`proof-${procedure.id}`}
    >
      <h3
        id={`proof-${procedure.id}`}
        className="text-xs font-medium uppercase tracking-wide text-muted"
      >
        Stand-in proved it
      </h3>
      {proofs.length === 0 ? (
        <p className="text-xs text-muted">
          Name a stand-in, then record a run when the stand-in follows it.
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
          ref={offerBox}
          role="status"
          tabIndex={-1}
          className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <p>
            {firstName(nameOf(offer.personId))} did this alone. Mark them as able to do{" "}
            {joinWithAnd(offer.raises.map((r) => `"${itemName(r.knowledgeId)}"`))} alone on Who
            knows what? Precog logs the change in the Decisions log.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={acceptRaise}>
              Mark as able to do it alone
            </Button>
            <Button size="sm" variant="ghost" onClick={declineRaise}>
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
              // Opened after following the steps: start the keyboard here.
              autoFocus={defaultOpen}
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
              placeholder="For example: Covered the Friday deposit while Dana was out"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" type="submit" disabled={!personId || !on || on > today}>
              Record the run
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                setOpen(false);
                setFocusNext("record");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={candidates.length === 0}
          ref={recordButton}
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
