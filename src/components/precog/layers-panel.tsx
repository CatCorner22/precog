import type { MatrixLayerId } from "@/lib/precog/types";
import { LAYER_META } from "@/lib/precog/templates/layer-meta";
import { usePractice } from "@/lib/precog/practice-context";
import { getIndustryCopy } from "@/lib/precog/templates/industry-copy";
import { useTemplate } from "@/lib/precog/use-template";
import { Badge } from "@/components/ui/badge";
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

export function LayerDetail({ layer }: { layer: MatrixLayerId }) {
  const { profile } = usePractice();
  const { processes, controls, knowledge } = useTemplate();
  const layerCopy = getIndustryCopy(profile.industry).layerCopy;
  const meta = LAYER_META[layer];

  if (layer === "process") {
    return (
      <LayerShell title={meta.name} subtitle={meta.blurb}>
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
    return (
      <LayerShell title={meta.name} subtitle={meta.blurb}>
        <ul className="space-y-2">
          {controls.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.name}</span>
                {!c.segregated && <Badge variant="danger">SoD gap</Badge>}
                {c.residualRiskAccepted && <Badge variant="warn">Residual accepted</Badge>}
              </div>
              <p className="mt-1 text-muted">{c.description}</p>
              {c.compensatingControls.length > 0 && (
                <p className="mt-1 text-xs text-subtle">
                  Compensating: {c.compensatingControls.join("; ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </LayerShell>
    );
  }

  if (layer === "knowledge") {
    return (
      <LayerShell title={meta.name} subtitle="Use the Knowledge map tab for the full graph.">
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
    <LayerShell title={meta.name} subtitle={meta.blurb}>
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
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
