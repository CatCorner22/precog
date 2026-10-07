import { useId, useMemo, useState } from "react";
import { KeyRound, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePractice } from "@/lib/precog/practice-context";
import { teamSource } from "@/lib/precog/team-source";
import { useTabName } from "@/lib/precog/presentation";
import {
  leaverAccessItems,
  leaverLabel,
  leaverLine,
  openAccessChecks,
  type LeaverAccessItemDef,
} from "@/lib/precog/continuity/access-removal";
import { localDateKey } from "@/lib/precog/dates";
import type { IndustryId } from "@/lib/precog/industry";

/** Whose records a leaver could still copy, in each line of business's words. */
const RECORDS: Partial<Record<IndustryId, string>> = {
  dental: "patient records",
  professional_services: "client files",
  nonprofit: "donor records",
};

const why = (industry: IndustryId) =>
  `Someone who has left but whose sign-in, card or PIN still works can move money or copy ${RECORDS[industry] ?? "customer records"}. Checking each one takes a few minutes.`;

/** The logins and pay to check for someone who has left, ticked one by one before confirming. */
function AccessChecklist({
  items,
  idPrefix,
  onConfirm,
  confirmLabel,
  children,
}: {
  items: readonly LeaverAccessItemDef[];
  idPrefix: string;
  onConfirm: () => void;
  confirmLabel: string;
  children?: React.ReactNode;
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const allTicked = items.every((item) => ticked.has(item.id));
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <label
              htmlFor={`${idPrefix}-${item.id}`}
              className="flex items-start gap-2 text-sm leading-snug pointer-coarse:min-h-11 pointer-coarse:items-center"
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
          <span className="text-xs text-muted">Tick each one once you have done it.</span>
        )}
      </div>
    </div>
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
  const titleId = useId();
  const today = localDateKey(new Date());
  if (open.length === 0) {
    return explainOnSample && teamSource(profile) === "sample" ? (
      <p className="flex items-center gap-2 text-sm text-muted">
        <KeyRound className="size-4 shrink-0" aria-hidden />
        On your own business, marking someone as left also asks you to confirm that you have stopped
        their pay and their sign-ins.
      </p>
    ) : null;
  }
  return (
    <section aria-labelledby={titleId} className="rounded-lg border border-warn/30 bg-warn/5 p-4">
      <p id={titleId} className="flex items-center gap-2 text-sm font-medium">
        <UserMinus className="size-4 shrink-0" aria-hidden />
        {open.length === 1
          ? "1 person who left still needs their pay and sign-ins checked"
          : `${open.length} people who left still need their pay and sign-ins checked`}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{why(profile.industry)}</p>
      <ul className="mt-3 space-y-2">
        {open.map((check) => (
          <li key={check.id} className="rounded-md border border-border bg-surface px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                <span className="font-medium">{leaverLabel(check)}</span>
                <span className="text-muted">
                  {" "}
                  ·{" "}
                  {leaverLine(
                    check,
                    template.people.find((person) => person.id === check.personId),
                    today,
                  )}
                </span>
              </span>
              <Button
                size="sm"
                variant={expanded === check.id ? "secondary" : "default"}
                aria-expanded={expanded === check.id}
                onClick={() => setExpanded(expanded === check.id ? null : check.id)}
              >
                {expanded === check.id ? "Close" : "Check pay and sign-ins"}
              </Button>
            </div>
            {expanded === check.id && (
              <div className="mt-2">
                <AccessChecklist
                  items={leaverAccessItems(check.industry)}
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
