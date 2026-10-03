import { useId, useState } from "react";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { inPlaceEntry } from "@/lib/precog/control-entries";
import { formatDay } from "@/lib/precog/dates";
import {
  conflictDecisionEntry,
  notValidEntry,
  notValidReady,
} from "@/lib/precog/decisions/conflict-entries";
import { cardDecision, notValidCounts, notValidReasonText } from "@/lib/precog/decisions/not-valid";
import { useTemplate } from "@/lib/precog/practice-context";
import { teamSource } from "@/lib/precog/team-source";
import { useTabName } from "@/lib/precog/presentation";
import {
  DECISION_KIND_LABEL,
  DISPOSITION_REASON_LABEL,
  type DecisionKind,
  type DispositionReason,
} from "@/lib/precog/practice-profile";
import type { DetectedConflict } from "@/lib/precog/sod/detect";
import { Button } from "@/components/ui/button";
import { fieldCls } from "@/components/ui/field-classes";
import { cn } from "@/lib/utils";
import { InPlaceForm } from "./in-place-form";
import type { SodPanelModel } from "./use-sod-panel";

const KINDS: DecisionKind[] = ["remediate", "accept_residual", "monitor", "insure"];
const REASONS = Object.keys(DISPOSITION_REASON_LABEL) as DispositionReason[];
const REVIEW_DAYS = [30, 60, 90, 180] as const;

/**
 * Deciding on one duty conflict from its card: what was logged against it,
 * then "We already do something here", "Log a decision" and "Not valid".
 * Every entry goes in the Decisions log, linked to the finding's rule.
 */
export function ConflictDecision({
  conflict: c,
  model,
}: {
  conflict: DetectedConflict;
  model: SodPanelModel;
}) {
  const { profile, addDecision } = model;
  const { controls } = useTemplate();
  const [open, setOpen] = useState<null | "decide" | "not_valid">(null);
  const logged = cardDecision(c, profile.decisions, profile.industry);
  const control = c.linkedControlId ? controls.find((x) => x.id === c.linkedControlId) : undefined;
  const showInPlace = Boolean(control && teamSource(profile) === "own" && !c.ownerHeld);

  return (
    <div className="mt-2 space-y-2">
      {logged.decision && (
        <p className="text-xs text-muted">
          Decision: {DECISION_KIND_LABEL[logged.decision.kind]}
          {logged.decision.reviewBy ? ` · review ${formatDay(logged.decision.reviewBy)}` : ""}
        </p>
      )}
      {logged.notValid && (
        <p className="text-xs text-muted">
          Judged not valid: {notValidReasonText(logged.notValid.disposition)}
          {!notValidCounts(c.severity) && (
            <span className="ml-1 font-medium text-warn">· Awaiting a second person</span>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-1">
        {showInPlace && control && (
          <InPlaceForm onRecord={(text) => addDecision(inPlaceEntry(control, text))} />
        )}
        {open === null && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setOpen("decide")}
            >
              Log a decision
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setOpen("not_valid")}
            >
              Not valid
            </Button>
          </>
        )}
      </div>
      {open === "decide" && (
        <DecideForm
          onCancel={() => setOpen(null)}
          onSave={(kind, note, days) => {
            addDecision(conflictDecisionEntry(c, kind, note, days));
            setOpen(null);
          }}
        />
      )}
      {open === "not_valid" && (
        <NotValidForm
          critical={!notValidCounts(c.severity)}
          onCancel={() => setOpen(null)}
          onSave={(reason, note, by) => {
            addDecision(notValidEntry(c, reason, note, by));
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function DecideForm({
  onSave,
  onCancel,
}: {
  onSave: (kind: DecisionKind, note: string, reviewDays: number) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<DecisionKind>("remediate");
  const [note, setNote] = useState("");
  const [days, setDays] = useState<number>(90);
  return (
    <form
      className="space-y-2 rounded-md border border-border bg-elevated p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(kind, note, days);
      }}
    >
      <div role="group" aria-label="Decision" className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs",
              kind === k ? "border-primary/40 bg-primary/10" : "border-border bg-bg text-muted",
            )}
          >
            {DECISION_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <label className="block text-xs text-muted">
        Note
        <textarea
          className={cn(fieldCls, "mt-1 block w-full")}
          rows={2}
          maxLength={800}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="For example: who owns it, and what makes it acceptable"
        />
      </label>
      <label className="block text-xs text-muted">
        Review in
        <select
          className={cn(fieldCls, "mt-1 block")}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {REVIEW_DAYS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          Save decision
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function NotValidForm({
  critical,
  onSave,
  onCancel,
}: {
  critical: boolean;
  onSave: (
    reason: DispositionReason,
    note: string,
    by: { userId: string; name: string } | null,
  ) => void;
  onCancel: () => void;
}) {
  const user = useCurrentUser();
  const tabName = useTabName();
  const group = useId();
  const [reason, setReason] = useState<DispositionReason | null>(null);
  const [note, setNote] = useState("");
  const ready = notValidReady(reason, note);
  return (
    <form
      className="space-y-2 rounded-md border border-border bg-elevated p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason || !ready) return;
        onSave(
          reason,
          note,
          user ? { userId: user.id, name: user.displayName || user.primaryEmail || "" } : null,
        );
      }}
    >
      <fieldset className="space-y-1">
        <legend className="text-xs text-muted">Why is this duty conflict not valid?</legend>
        {REASONS.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm">
            <input type="radio" name={group} checked={reason === r} onChange={() => setReason(r)} />
            {DISPOSITION_REASON_LABEL[r]}
          </label>
        ))}
      </fieldset>
      <label className="block text-xs text-muted">
        {reason === "other" ? "Say why" : "Note (optional)"}
        <textarea
          className={cn(fieldCls, "mt-1 block w-full")}
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required={reason === "other"}
        />
      </label>
      {critical && (
        <p className="text-xs text-warn">
          This is a critical duty conflict. It stays counted with no decision until a second person
          agrees it is not valid.
        </p>
      )}
      <p className="text-xs text-subtle">
        It goes in your {tabName("journal")}. The duty conflict stays in the open count while one
        person holds both duties.
      </p>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={!ready}>
          Record as not valid
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
