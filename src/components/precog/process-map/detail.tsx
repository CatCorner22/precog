/**
 * The side panel for a selected process, the vision-mode chips and the legends of the process map.
 */
import { type ReactNode } from "react";
import { useTemplate } from "@/lib/precog/use-template";
import "@xyflow/react/dist/style.css";
import { HEAT_BANDS, type MapGraphNode, type ProcessMapSnapshot } from "@/lib/precog/process-graph";
import {
  PRIORITY_BAND_LABEL,
  predatorThermalColor,
  type MapVisionMode,
  type PriorityTarget,
} from "@/lib/precog/map-vision";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import type { NavFn } from "@/lib/precog/navigation";
import { heatColorStandard, UNSCORED_ACCENT } from "@/components/precog/process-map/style";

export function VisionChip({
  active,
  onClick,
  icon,
  label,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  accent?: "predator" | "terminator";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active && !accent && "border-primary/40 bg-primary/15 text-fg",
        active && accent === "predator" && "border-orange-400/40 bg-orange-500/15 text-orange-100",
        active && accent === "terminator" && "border-red-500/50 bg-red-600/20 text-red-200",
        !active && "border-border bg-elevated text-muted hover:text-fg",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function T1000Buddy() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="t1000-buddy relative flex size-16 items-center justify-center">
        {/* Friendly chrome face */}
        <div className="absolute inset-2 rounded-[40%] bg-gradient-to-b from-white/40 to-transparent" />
        <div className="relative z-[1] flex gap-2">
          <span className="size-2 rounded-full bg-red-500/90 shadow-[0_0_6px_#f44]" />
          <span className="size-2 rounded-full bg-red-500/90 shadow-[0_0_6px_#f44]" />
        </div>
        <div className="absolute bottom-4 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-red-400/50" />
      </div>
      <span className="text-xs tracking-wide text-red-400/80 uppercase">T-1000 · risk</span>
    </div>
  );
}

export function StandardLegend() {
  return (
    <div className="max-w-[220px] rounded-xl border border-border bg-surface/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="font-semibold text-fg">Map legend</p>
      <p className="mt-1 text-muted">Border heat: cool → hot (danger)</p>
      <div
        className="mt-1.5 h-1.5 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, var(--color-border-strong), var(--color-primary), var(--color-warn), var(--color-danger))",
        }}
      />
    </div>
  );
}

export function PredatorLegend() {
  return (
    <div className="max-w-[240px] rounded-xl border border-orange-500/30 bg-black/80 px-3 py-2 text-xs text-orange-100/90 shadow-lg predator-hud">
      <p className="font-semibold tracking-widest">THERMAL KEY</p>
      <div className="predator-thermal-bar mt-1.5 h-2 rounded-full" />
      <p className="mt-1 text-white/50">White-hot = high heat × high impact. Hunt those first.</p>
    </div>
  );
}

/** `immediate` is null while the map is not assessed: there is nothing to count yet. */
export function TerminatorLegend({ immediate }: { immediate: number | null }) {
  return (
    <div className="max-w-[240px] rounded-xl border border-red-800/50 bg-black/85 px-3 py-2 text-xs terminator-hud shadow-lg">
      <p className="font-semibold tracking-widest">THREAT ANALYSIS</p>
      <p className="mt-1 normal-case tracking-normal text-red-300/90">
        {immediate === null
          ? "Not assessed yet: nothing to lock on until the map is assessed."
          : `${immediate} target${immediate === 1 ? " requires" : "s require"} immediate attention. Pulsing lock = act this week.`}
      </p>
    </div>
  );
}

export function ProcessDetail({
  snapshot,
  selectedNode,
  unscored,
  priority,
  vision,
  onNavigate,
  onSelectProcess,
}: {
  snapshot: ProcessMapSnapshot;
  selectedNode?: MapGraphNode;
  /** A starter process nobody has assessed: shown without heat or priority. */
  unscored: boolean;
  priority?: PriorityTarget;
  vision: MapVisionMode;
  onNavigate?: NavFn;
  onSelectProcess: (id: string) => void;
}) {
  const { processes } = useTemplate();
  const p = snapshot.process;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="size-3 rounded-full"
            style={{
              background: unscored
                ? UNSCORED_ACCENT
                : priority
                  ? predatorThermalColor(priority.priority)
                  : heatColorStandard(snapshot.heat),
            }}
          />
          {unscored ? (
            <Badge variant="default">Starter · not assessed</Badge>
          ) : (
            <Badge variant={snapshot.heat >= HEAT_BANDS.hot ? "danger" : "primary"}>
              heat {snapshot.heat}
            </Badge>
          )}
          {priority && (
            <Badge
              variant={priority.immediate || priority.band === "white_hot" ? "danger" : "warn"}
            >
              {PRIORITY_BAND_LABEL[priority.band]} · P{priority.priority}
            </Badge>
          )}
          {vision !== "standard" && <Badge variant="default">{vision}</Badge>}
        </div>
        <CardTitle className="text-base">{p.name}</CardTitle>
        <CardDescription>{p.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {unscored && (
          <p className="text-xs text-muted">
            A starter process from the industry example, as yet untouched. Its risks and notes are
            what such a process usually carries, not findings about your business; assign an owner
            or edit it and it is scored.
          </p>
        )}
        {priority && (
          <div className="rounded-lg border border-border bg-panel px-3 py-2 text-xs">
            <p className="font-medium text-fg">{priority.impactHint}</p>
            <p className="mt-1 text-muted">{priority.reasons.join(" · ")}</p>
          </div>
        )}
        {selectedNode && selectedNode.kind !== "process" && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <p className="text-xs tracking-wide text-subtle uppercase">
              Selected · {selectedNode.kind}
            </p>
            <p className="font-medium">{selectedNode.label}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-medium text-subtle uppercase">Flow</p>
          <p className="mt-1 text-xs text-muted">
            <span className="text-fg">In:</span> {(p.inputs ?? []).join(" · ") || "—"}
          </p>
          <p className="text-xs text-muted">
            <span className="text-fg">Out:</span> {(p.outputs ?? []).join(" · ") || "—"}
          </p>
          {p.dependencies.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Depends on:{" "}
              {p.dependencies.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="mr-1 text-primary underline-offset-2 hover:underline"
                  onClick={() => onSelectProcess(d)}
                >
                  {processes.find((x) => x.id === d)?.name ?? d}
                </button>
              ))}
            </p>
          )}
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-subtle uppercase">
            <AlertTriangle className="size-3" /> Risks ({snapshot.risks.length})
          </p>
          <ul className="space-y-1.5">
            {snapshot.risks.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-danger/20 bg-danger/5 px-2 py-1.5 text-xs"
              >
                <span className="font-medium">{r.title}</span>
                <Badge variant="danger" className="ml-1">
                  S{r.severity}×L{r.likelihood}
                </Badge>
                <p className="mt-0.5 text-muted">{r.note}</p>
                {r.linkedScenarioId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 h-7 px-2 text-xs"
                    onClick={() => onNavigate?.("precog", r.linkedScenarioId)}
                  >
                    Precog
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
        {snapshot.ideas.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-subtle uppercase">
              Ideas ({snapshot.ideas.length})
            </p>
            <ul className="space-y-1 text-xs text-muted">
              {snapshot.ideas.map((i) => (
                <li key={i.id}>
                  <span className="text-fg">{i.title}</span> — {i.status}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
