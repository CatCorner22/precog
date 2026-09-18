import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity,
  Blocks,
  Hammer,
  Link2,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

const TOUR_KEY = "precog.builderTour.v1";

export type TourAction = "add" | "blocks" | "validate" | "health" | "none";

interface TourStep {
  icon: typeof Hammer;
  title: string;
  body: string;
  cta?: { label: string; action: TourAction };
}

const STEPS: TourStep[] = [
  {
    icon: Hammer,
    title: "Welcome to the map builder",
    body: "This is your business as a value stream. Every edit re-scores residual risk, SoD gaps, and the map health score live — nothing is saved until you make a change, and everything is undoable.",
  },
  {
    icon: Plus,
    title: "Add or insert a process",
    body: "Add a blank process and name it, or open Blocks for pre-built control patterns like dual-control payments and owner bank reconciliation. Each block previews how it moves your health score.",
    cta: { label: "Open Blocks", action: "blocks" },
  },
  {
    icon: Link2,
    title: "Wire the flow on the canvas",
    body: "Drag from the right handle of one process box to the left handle of another to make a dependency. Select a dependency line and press Delete to remove it. Drag boxes to arrange — positions are saved.",
  },
  {
    icon: ShieldCheck,
    title: "Validate and quick-fix",
    body: "Validate finds cycles, missing owners, unmapped controls, and broken links. Each issue has a Fix button with a preview of the health change. Fix them all in one undoable step.",
    cta: { label: "Run Validate", action: "validate" },
  },
  {
    icon: Activity,
    title: "Watch the health score",
    body: "The pill at the top of this panel tracks map health while you build. Back on the Dashboard the full card shows dimension bars, a trend line, and links straight to the weak spots.",
    cta: { label: "Got it", action: "none" },
  },
];

export function useBuilderTour() {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    try {
      setSeen(localStorage.getItem(TOUR_KEY) === "1");
    } catch {
      setSeen(true);
    }
  }, []);
  const dismiss = () => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // ignore
    }
    setSeen(true);
  };
  const restart = () => {
    try {
      localStorage.removeItem(TOUR_KEY);
    } catch {
      // ignore
    }
    setSeen(false);
  };
  return { show: !seen, dismiss, restart };
}

export function BuilderTour({
  onDismiss,
  onAction,
}: {
  onDismiss: () => void;
  onAction: (action: TourAction) => void;
}) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const Icon = step.icon;
  const last = i === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-label="Map builder tour"
      className="relative overflow-hidden rounded-xl border border-accent/40 bg-gradient-to-br from-accent/10 via-panel to-panel p-3"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Skip tour"
        className="absolute top-2 right-2 rounded p-1 text-subtle hover:bg-elevated hover:text-fg"
      >
        <X className="size-3.5" />
      </button>
      <div className="flex items-start gap-2.5 pr-6">
        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-accent uppercase">
            <Sparkles className="size-3" /> Quick tour · {i + 1} / {STEPS.length}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-fg">{step.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{step.body}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {STEPS.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setI(idx)}
              aria-label={`Step ${idx + 1}`}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                idx === i ? "bg-accent" : "bg-border hover:bg-border-strong",
              )}
            />
          ))}
        </div>
        <div className="flex gap-1.5">
          {step.cta && step.cta.action !== "none" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onAction(step.cta!.action)}
            >
              {step.cta.action === "blocks" && <Blocks className="size-3.5" />}
              {step.cta.action === "validate" && <ShieldCheck className="size-3.5" />}
              {step.cta.label}
            </Button>
          )}
          {i > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setI((v) => v - 1)}>
              Back
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => (last ? onDismiss() : setI((v) => v + 1))}
          >
            {last ? "Start building" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
