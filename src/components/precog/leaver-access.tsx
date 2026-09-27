import { useMemo, useState } from "react";
import { KeyRound, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePractice } from "@/lib/precog/practice-context";
import { useTabName } from "@/lib/precog/presentation";
import {
  LEAVER_ACCESS_ITEMS,
  leaverLabel,
  openAccessChecks,
  unpromptedAccessChecks,
  type LeaverAccessItem,
} from "@/lib/precog/continuity/access-removal";
import { joinWithAnd } from "@/lib/precog/text";
import { formatDay } from "@/lib/precog/dates";

const WHY =
  "A former employee whose login, card or PIN still works can move money or copy customer records after they leave. Checking each one takes a few minutes.";

/** The logins and pay to check for someone who has left, ticked one by one before confirming. */
function AccessChecklist({
  idPrefix,
  onConfirm,
  confirmLabel,
  children,
}: {
  idPrefix: string;
  onConfirm: () => void;
  confirmLabel: string;
  children?: React.ReactNode;
}) {
  const [ticked, setTicked] = useState<Set<LeaverAccessItem>>(new Set());
  const allTicked = LEAVER_ACCESS_ITEMS.every((item) => ticked.has(item.id));
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {LEAVER_ACCESS_ITEMS.map((item) => (
          <li key={item.id}>
            <label
              htmlFor={`${idPrefix}-${item.id}`}
              className="flex items-start gap-2 text-sm leading-snug"
            >
              <input
                id={`${idPrefix}-${item.id}`}
                type="checkbox"
                className="mt-0.5 size-4 shrink-0"
                checked={ticked.has(item.id)}
                onChange={(e) =>
                  setTicked((current) => {
                    const next = new Set(current);
                    if (e.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    return next;
                  })
                }
              />
              {item.label}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!allTicked} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        {children}
        {!allTicked && (
          <span className="text-xs text-muted">Tick each one once it is done to confirm.</span>
        )}
      </div>
    </div>
  );
}

/**
 * Asked once, under the header, as soon as someone is known to have left:
 * are they off payroll, and are their logins gone? Either answer ends the
 * prompt; an unconfirmed check stays open on Start here and on the leaver
 * view of Who knows what.
 */
export function LeaverAccessPrompt() {
  const tabName = useTabName();
  const { profile, template, confirmLeaverAccess, markLeaverPrompted } = usePractice();
  const pending = useMemo(
    () => unpromptedAccessChecks(profile.leaverAccessChecks, profile.industry, template.people),
    [profile.leaverAccessChecks, profile.industry, template.people],
  );
  if (profile.onboardingComplete === false || pending.length === 0) return null;
  const ids = pending.map((check) => check.id);
  const one = pending.length === 1;
  const names = one
    ? leaverLabel(pending[0])
    : joinWithAnd(
        pending.map((check) => check.name),
        2,
      );
  return (
    <Card
      className="rounded-none border-x-0 border-warn/30 bg-warn/10 shadow-none"
      role="region"
      aria-labelledby="leaver-access-prompt-title"
    >
      <div className="mx-auto max-w-7xl space-y-2 px-4 py-3 sm:px-6">
        <p id="leaver-access-prompt-title" className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4 shrink-0" aria-hidden />
          {one
            ? `${names} has left. Stop their pay and remove their logins.`
            : `${pending.length} people have left: ${names}. Stop their pay and remove their logins.`}
        </p>
        <p className="max-w-3xl text-sm text-muted">{WHY}</p>
        <AccessChecklist
          idPrefix="leaver-prompt"
          confirmLabel={one ? "Confirm: done for them" : `Confirm: done for all ${pending.length}`}
          onConfirm={() => {
            confirmLeaverAccess(ids);
            toast.success(
              one ? `Recorded for ${pending[0].name}.` : `Recorded for ${pending.length} people.`,
              { description: `Dated in the ${tabName("journal")}.` },
            );
          }}
        >
          <Button size="sm" variant="secondary" onClick={() => markLeaverPrompted(ids)}>
            Not yet: keep it on Start here
          </Button>
        </AccessChecklist>
      </div>
    </Card>
  );
}

/**
 * The leavers whose pay and logins the owner has not confirmed yet, each
 * with its own checklist. Renders nothing when there are none, except that
 * with `explainOnSample` the sample team (whose people are nobody's staff and
 * never raise a check) gets one line saying what happens on the owner's own
 * business.
 */
export function LeaverAccessList({ explainOnSample = false }: { explainOnSample?: boolean }) {
  const tabName = useTabName();
  const { profile, template, confirmLeaverAccess } = usePractice();
  const open = useMemo(
    () => openAccessChecks(profile.leaverAccessChecks, profile.industry, template.people),
    [profile.leaverAccessChecks, profile.industry, template.people],
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  if (open.length === 0) {
    return explainOnSample && !profile.customPeople ? (
      <p className="flex items-center gap-2 text-sm text-muted">
        <KeyRound className="size-4 shrink-0" aria-hidden />
        On your own business, marking someone as left also asks you to confirm their pay and logins
        are stopped.
      </p>
    ) : null;
  }
  return (
    <section
      aria-labelledby="leaver-access-list-title"
      className="rounded-lg border border-warn/30 bg-warn/5 p-4"
    >
      <p id="leaver-access-list-title" className="flex items-center gap-2 text-sm font-medium">
        <UserMinus className="size-4 shrink-0" aria-hidden />
        {open.length === 1
          ? "1 person who left still needs their pay and logins checked"
          : `${open.length} people who left still need their pay and logins checked`}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{WHY}</p>
      <ul className="mt-3 space-y-2">
        {open.map((check) => (
          <li key={check.id} className="rounded-md border border-border bg-surface px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                <span className="font-medium">{leaverLabel(check)}</span>
                <span className="text-muted">
                  {" "}
                  ·{" "}
                  {check.source === "roster"
                    ? `listed as no longer working here in the roster you pasted on ${formatDay(check.notedOn)}`
                    : `marked as left on ${formatDay(check.notedOn)}`}
                </span>
              </span>
              <Button
                size="sm"
                variant={expanded === check.id ? "secondary" : "default"}
                aria-expanded={expanded === check.id}
                onClick={() => setExpanded(expanded === check.id ? null : check.id)}
              >
                {expanded === check.id ? "Close" : "Check pay and logins"}
              </Button>
            </div>
            {expanded === check.id && (
              <div className="mt-2">
                <AccessChecklist
                  idPrefix={`leaver-${check.id}`}
                  confirmLabel={`Confirm for ${check.name}`}
                  onConfirm={() => {
                    confirmLeaverAccess([check.id]);
                    setExpanded(null);
                    toast.success(`Recorded for ${check.name}.`, {
                      description: `Dated in the ${tabName("journal")}.`,
                    });
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
