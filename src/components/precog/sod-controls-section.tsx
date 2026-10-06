import { CheckCircle2, ShieldOff } from "lucide-react";
import { confirmControlEntry, inPlaceEntry } from "@/lib/precog/control-entries";
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
 * already in place against a duty gap.
 */
export function SodControlsSection({ onNavigate }: { onNavigate?: NavFn }) {
  const tabName = useTabName();
  const { profile, addDecision } = usePractice();
  const { controls } = useTemplate();
  const meta = LAYER_META.control;
  const ownBusiness = teamSource(profile) === "own";
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
            {onNavigate && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`What if ${c.name} fails?`}
                onClick={() => onNavigate("precog", `failure:control:${c.id}`)}
              >
                <ShieldOff className="size-3.5" aria-hidden />
                What if this fails?
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
            {c.compensatingControls.length > 0 && (
              <p className="mt-1 text-xs text-subtle">
                Already in place: {c.compensatingControls.join("; ")}
                {ownBusiness &&
                  ` (from your ${tabName("journal")}; remove an entry there to take it off)`}
              </p>
            )}
            {ownBusiness && !c.starter && !c.segregated && (
              <InPlaceForm onRecord={(text) => addDecision(inPlaceEntry(c, text))} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
