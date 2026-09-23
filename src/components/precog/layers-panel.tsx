import type { MatrixLayerId } from "@/lib/precog/types";
import { LAYER_META } from "@/lib/precog/templates/layer-meta";
import { usePractice } from "@/lib/precog/practice-context";
import { getIndustryCopy } from "@/lib/precog/templates/industry-copy";
import { useTemplate } from "@/lib/precog/use-template";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONTROL_CONFIRM_TAB, CONTROL_IN_PLACE_TAB } from "@/lib/precog/active-template";
import { dateAfter } from "@/lib/precog/decisions/follow-through";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const ORDER: MatrixLayerId[] = [
  "surface",
  "process",
  "knowledge",
  "control",
  "source",
  "continuity",
];

export function LayersPanel({
  active,
  onSelect,
}: {
  active: MatrixLayerId;
  onSelect: (id: MatrixLayerId) => void;
}) {
  const { processes, controls, knowledge } = useTemplate();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {ORDER.map((id, index) => {
        const meta = LAYER_META[id];
        const selected = active === id;
        const counts =
          id === "process"
            ? `${processes.length} processes`
            : id === "knowledge"
              ? `${knowledge.length} knowledge items`
              : id === "control"
                ? `${controls.filter((c) => !c.segregated).length} SoD gaps`
                : id === "surface"
                  ? "Live operations view"
                  : id === "source"
                    ? "Systems & vendors"
                    : "Fragility paths";

        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(id)}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors",
              selected
                ? "border-primary/50 bg-primary/10 glow-primary"
                : "border-border bg-surface hover:border-border-strong hover:bg-elevated",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <Badge variant={selected ? "primary" : "default"}>L{index + 1}</Badge>
              <span className="text-[10px] tracking-wider text-subtle uppercase">
                {meta.matrixName}
              </span>
            </div>
            <h3 className="mt-3 font-semibold">{meta.name}</h3>
            <p className="mt-1 text-sm text-muted">{meta.blurb}</p>
            <p className="mt-3 text-xs text-subtle">{counts}</p>
          </button>
        );
      })}
    </div>
  );
}

/** The tab that shows each layer in full, for the link under its list. */
const FULL_VIEW: Partial<Record<MatrixLayerId, { tab: string; label: string }>> = {
  control: { tab: "sod", label: "Open Who controls what" },
  knowledge: { tab: "knowledge", label: "Open Who knows what" },
  process: { tab: "map", label: "Open How work flows" },
};

export function LayerDetail({
  layer,
  onOpenTab,
}: {
  layer: MatrixLayerId;
  /** Opens the tab that shows this layer in full. */
  onOpenTab?: (tab: string) => void;
}) {
  const full = FULL_VIEW[layer];
  const action =
    full && onOpenTab ? { label: full.label, onClick: () => onOpenTab(full.tab) } : undefined;
  const { profile, addDecision } = usePractice();
  const { processes, controls, knowledge } = useTemplate();
  const layerCopy = getIndustryCopy(profile.industry).layerCopy;
  const meta = LAYER_META[layer];

  if (layer === "process") {
    return (
      <LayerShell title={meta.name} subtitle={meta.blurb} action={action}>
        <ul className="space-y-2">
          {processes.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
            >
              <span className="font-medium">{p.name}</span>
              <span className="mt-0.5 block text-muted">{p.description}</span>
            </li>
          ))}
        </ul>
      </LayerShell>
    );
  }

  if (layer === "control") {
    const ownBusiness = Boolean(profile.customPeople);
    return (
      <LayerShell title={meta.name} subtitle={meta.blurb} action={action}>
        <ul className="space-y-2">
          {controls.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.name}</span>
                {!c.segregated && <Badge variant="danger">SoD gap</Badge>}
                {c.starter && <Badge variant="default">Starter · not confirmed</Badge>}
                {c.residualRiskAccepted && <Badge variant="warn">Residual accepted</Badge>}
              </div>
              <p className="mt-1 text-muted">{c.description}</p>
              {c.starter && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-subtle">
                    From the industry example. Nobody has confirmed this control runs in your
                    business, so the app does not score it yet.
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      addDecision({
                        subject: `Control: ${c.name}`,
                        kind: "monitor",
                        note: `Confirmed this control runs here: ${c.description} Review whether it still runs, and who does it.`,
                        reviewBy: dateAfter(new Date(), 90),
                        linkedTab: CONTROL_CONFIRM_TAB,
                        linkedId: c.id,
                      })
                    }
                  >
                    <CheckCircle2 className="size-3.5" />
                    This runs here
                  </Button>
                </div>
              )}
              {c.compensatingControls.length > 0 && (
                <p className="mt-1 text-xs text-subtle">
                  {ownBusiness ? "Already in place" : "Compensating"}:{" "}
                  {c.compensatingControls.join("; ")}
                  {ownBusiness &&
                    " (from your decisions log; remove an entry there to take it off)"}
                </p>
              )}
              {ownBusiness && !c.starter && !c.segregated && (
                <InPlaceForm
                  onRecord={(text) =>
                    addDecision({
                      subject: `In place: ${c.name}`,
                      kind: "monitor",
                      note: text,
                      reviewBy: dateAfter(new Date(), 90),
                      linkedTab: CONTROL_IN_PLACE_TAB,
                      linkedId: c.id,
                    })
                  }
                />
              )}
            </li>
          ))}
        </ul>
      </LayerShell>
    );
  }

  if (layer === "knowledge") {
    return (
      <LayerShell title={meta.name} subtitle="Who can do each task, and who alone." action={action}>
        <ul className="space-y-2">
          {knowledge.map((k) => (
            <li
              key={k.id}
              className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
            >
              <span className="font-medium">{k.name}</span>
              <span className="mt-0.5 block text-muted">
                {k.criticality} · {k.category}
              </span>
            </li>
          ))}
        </ul>
      </LayerShell>
    );
  }

  return (
    <LayerShell title={meta.name} subtitle={meta.blurb} action={action}>
      <ul className="space-y-2">
        {(layerCopy[layer] ?? []).map((line) => (
          <li
            key={line}
            className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-muted"
          >
            {line}
          </li>
        ))}
      </ul>
    </LayerShell>
  );
}

function LayerShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        {action && (
          <Button size="sm" variant="secondary" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/**
 * "We already do something here": records a control the owner already has
 * against a duty gap (for example "The CFO reviews each bank reconciliation").
 * It lands in the decisions log with a review date, lowers the linked
 * findings' scores a little, and never closes the gap: the pair of duties is
 * still held by one person.
 */
function InPlaceForm({ onRecord }: { onRecord: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpen(true)}>
        <ShieldCheck className="size-3.5" />
        We already do something here
      </Button>
    );
  }
  const trimmed = text.trim();
  return (
    <form
      className="mt-2 space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        onRecord(trimmed);
        setText("");
        setOpen(false);
      }}
    >
      <label className="block text-xs text-muted">
        What does someone else do that would catch a problem here?
        <input
          className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg"
          placeholder="e.g. The CFO reviews each bank reconciliation and its statement"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
      </label>
      <p className="text-[11px] text-subtle">
        It goes in your decisions log with a review date in 90 days. It lowers these findings&apos;
        scores a little but does not close them: one person still holds both duties.
      </p>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={!trimmed}>
          Record it
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
