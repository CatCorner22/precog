import { CheckCircle2, ShieldOff } from "lucide-react";
import { setupControlsInPlace, type SetupControlInPlace } from "@/lib/precog/active-template";
import { controlFailureModes } from "@/lib/precog/control-failure-modes";
import {
  confirmControlEntry,
  inPlaceEntry,
  takeOffSetupControlPrompt,
} from "@/lib/precog/control-entries";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { teamSource } from "@/lib/precog/team-source";
import { useTabName } from "@/lib/precog/presentation";
import type { NavFn } from "@/lib/precog/navigation";
import { LAYER_META } from "@/lib/precog/templates/layer-meta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InPlaceForm } from "./in-place-form";

/**
 * The Controls view of Who controls what: every control in the template, the
 * sample ones the owner can confirm with "This runs here", and the controls
 * already in place against a duty gap: those recorded in the journal, and
 * those a setup answer credits, each of which the owner can take off.
 */
export function SodControlsSection({ onNavigate }: { onNavigate?: NavFn }) {
  const { profile, addDecision, withdrawSetupControl } = usePractice();
  const { controls } = useTemplate();
  const meta = LAYER_META.control;
  const ownBusiness = teamSource(profile) === "own";
  // The credits the setup answers still give, by control: the template
  // already leaves out the ones taken off (`setupControlsWithdrawn`).
  const withdrawn = new Set(profile.setupControlsWithdrawn ?? []);
  const fromSetup = setupControlsInPlace(profile.setupAnswers, profile.industry).filter(
    (credit) => !withdrawn.has(credit.id),
  );
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-semibold">{meta.name}</h2>
      <p className="mt-1 text-sm text-muted">{meta.blurb}</p>
      <ul className="mt-4 space-y-2">
        {controls.map((c) => (
          <li key={c.id} className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{c.name}</span>
              {!c.segregated && <Badge variant="danger">Duty conflict</Badge>}
              {c.starter && <Badge variant="default">Sample · not confirmed</Badge>}
              {c.residualRiskAccepted && <Badge variant="warn">Residual risk accepted</Badge>}
            </div>
            <p className="mt-1 text-muted">{c.description}</p>
            <div className="mt-2">
              <p className="text-xs font-medium tracking-wide text-subtle uppercase">
                How this fails in practice
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
                {controlFailureModes(c.id).map((mode) => (
                  <li key={mode}>{mode}</li>
                ))}
              </ul>
            </div>
            {onNavigate && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`What if ${c.name} fails?`}
                onClick={() => onNavigate("precog", `failure:control:${c.id}`)}
              >
                <ShieldOff className="size-3.5" aria-hidden />
                See what this failure would cost
              </Button>
            )}
            {c.starter && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-xs text-subtle">
                  From the industry sample. Nobody has confirmed this control runs in your business,
                  so Precog does not score it yet.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => addDecision(confirmControlEntry(c))}
                >
                  <CheckCircle2 className="size-3.5" />
                  This runs here
                </Button>
              </div>
            )}
            <InPlaceLines
              control={c}
              fromSetup={fromSetup.filter((credit) => credit.controlId === c.id)}
              ownBusiness={ownBusiness}
              onTakeOff={(credit) => {
                if (window.confirm(takeOffSetupControlPrompt(c.name, credit.text))) {
                  withdrawSetupControl(credit.id);
                }
              }}
            />
            {ownBusiness && !c.starter && !c.segregated && (
              <InPlaceForm onRecord={(text) => addDecision(inPlaceEntry(c, text))} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What is already in place against a control: the journal's entries on one
 * line (taken off in the journal), and each credit a setup answer gives on
 * its own, with "Take it off" (the answer stands; the control stops
 * counting it).
 */
function InPlaceLines({
  control,
  fromSetup,
  ownBusiness,
  onTakeOff,
}: {
  control: { compensatingControls: readonly string[] };
  fromSetup: readonly SetupControlInPlace[];
  ownBusiness: boolean;
  onTakeOff: (credit: SetupControlInPlace) => void;
}) {
  const tabName = useTabName();
  const setupTexts = new Set(fromSetup.map((credit) => credit.text));
  const journal = control.compensatingControls.filter((text) => !setupTexts.has(text));
  return (
    <>
      {journal.length > 0 && (
        <p className="mt-1 text-xs text-subtle">
          Already in place: {journal.join("; ")}
          {ownBusiness &&
            ` (from your ${tabName("journal")}; remove an entry there to take it off)`}
        </p>
      )}
      {fromSetup.map((credit) => (
        <p key={credit.id} className="mt-1 text-xs text-subtle">
          Already in place: {credit.text}{" "}
          <button
            type="button"
            className="font-medium text-primary underline underline-offset-2 pointer-coarse:min-h-11"
            aria-label={`Take it off: ${credit.text}`}
            onClick={() => onTakeOff(credit)}
          >
            Take it off
          </button>
        </p>
      ))}
    </>
  );
}
