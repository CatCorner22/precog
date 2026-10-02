import { lazy, Suspense } from "react";
import { Brain, Gauge, Grid3x3 } from "lucide-react";
import { TabLoading } from "@/components/precog/home-shell-parts";
import { Button } from "@/components/ui/button";
import type { DeepLinkTarget } from "@/lib/precog/coso";
import { tabLabel, type AliasId } from "@/lib/precog/navigation";
import { usePresentation } from "@/lib/precog/presentation";

type ScoresView = "residual" | "coverage" | "patterns";

/** Each view, the alias whose wording names it, and its icon. */
const VIEWS: { id: ScoresView; alias: AliasId; icon: typeof Brain }[] = [
  { id: "residual", alias: "residual", icon: Gauge },
  { id: "coverage", alias: "coso", icon: Grid3x3 },
  { id: "patterns", alias: "intel", icon: Brain },
];

/** Heading (tactical) and one-line purpose, in both wordings, for the views that open on a heading. */
const VIEW_INTROS = {
  residual: {
    heading: "Residual risk radar",
    plain:
      "Which risks remain after the controls you have today, scored from your business profile.",
    tactical: "Transparent scoring from the business profile.",
  },
  coverage: {
    heading: "COSO control system",
    plain:
      "How well your controls cover each part of a sound control system, with a link to each gap.",
    tactical: "Component health with deep links.",
  },
} satisfies Partial<Record<ScoresView, { heading: string; plain: string; tactical: string }>>;

function isScoresView(value: string | null): value is ScoresView {
  return VIEWS.some((v) => v.id === value);
}

/**
 * How Precog scores: the views that show how the figures come about. What
 * is still exposed after your controls, how the controls cover a sound
 * control system, and the patterns Precog reads. `view` comes from the
 * address, so a link or a reload opens the same view.
 */
export function ScoresArea({
  view,
  openTab,
  onNavigate,
}: {
  view: string | null;
  openTab: (tab: string, item?: string | null) => void;
  onNavigate: (target: DeepLinkTarget) => void;
}) {
  const { say } = usePresentation();
  const active: ScoresView = isScoresView(view) ? view : "residual";
  const activeView = VIEWS.find((v) => v.id === active)!;

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={`${tabLabel("scores", say)} view`}
      >
        {VIEWS.map(({ id, alias, icon: Icon }) => (
          <Button
            key={id}
            size="sm"
            variant={active === id ? "default" : "secondary"}
            aria-pressed={active === id}
            onClick={() => openTab("scores", id)}
          >
            <Icon className="size-4" aria-hidden />
            {tabLabel(alias, say)}
          </Button>
        ))}
      </div>
      <Suspense fallback={<TabLoading />}>
        {active === "patterns" ? (
          <IntelligencePanel onNavigate={openTab} />
        ) : (
          <div className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold">
                {say(tabLabel(activeView.alias), VIEW_INTROS[active].heading)}
              </h1>
              <p className="text-sm text-muted">
                {say(VIEW_INTROS[active].plain, VIEW_INTROS[active].tactical)}
              </p>
            </div>
            {active === "residual" ? (
              <ResidualRadar onNavigate={onNavigate} />
            ) : (
              <CosoHeatmap onNavigate={onNavigate} />
            )}
          </div>
        )}
      </Suspense>
    </div>
  );
}

const ResidualRadar = lazy(() =>
  import("@/components/precog/residual-radar").then((module) => ({
    default: module.ResidualRadar,
  })),
);
const CosoHeatmap = lazy(() =>
  import("@/components/precog/coso-heatmap").then((module) => ({ default: module.CosoHeatmap })),
);
const IntelligencePanel = lazy(() =>
  import("@/components/precog/intelligence-panel").then((module) => ({
    default: module.IntelligencePanel,
  })),
);
