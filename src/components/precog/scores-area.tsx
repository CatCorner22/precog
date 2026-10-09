import { lazy, Suspense } from "react";
import { Brain, Gauge, Grid3x3 } from "lucide-react";
import { TabLoading } from "@/components/precog/home-shell-parts";
import { PageIntro } from "@/components/precog/page-intro";
import { Button } from "@/components/ui/button";
import type { DeepLinkTarget } from "@/lib/precog/coso";
import { tabLabel, type AliasId } from "@/lib/precog/navigation";
import { usePresentation } from "@/lib/precog/presentation";

type ScoresView = "residual" | "coverage" | "patterns" | "csv";

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
  return value === "csv" || VIEWS.some((v) => v.id === value);
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
  const activeView = VIEWS.find((v) => v.id === active);
  const intro = active === "residual" || active === "coverage" ? VIEW_INTROS[active] : null;

  return (
    <div className="space-y-4">
      <PageIntro
        tab="scores"
        purpose={{
          plain:
            "How Precog arrives at each figure: what is still exposed after your controls, how well they cover a sound control system, and the patterns it reads.",
          tactical:
            "How each figure is produced: residual risk, COSO component coverage, and the pattern screens.",
        }}
        method={
          <p>
            {say(
              "What is still exposed scores each risk from your business profile after the controls you have; Coverage check maps those controls onto the five parts of a sound control system; Patterns reads the signals, reasoning and reach behind them. Each figure shows the inputs it came from, with a sensitivity range where the weights matter.",
              "Residual scores each risk from the business profile after the controls in place; COSO maps those controls onto the five components; Intel holds the signal, reasoning and meta-analysis screens. Each figure exposes its inputs, with a ±20% weight-sensitivity range.",
            )}
          </p>
        }
      />
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
        <Button
          size="sm"
          variant={active === "csv" ? "default" : "secondary"}
          aria-pressed={active === "csv"}
          onClick={() => openTab("scores", "csv")}
        >
          <Brain className="size-4" aria-hidden />
          Number patterns
        </Button>
      </div>
      {active === "csv" ? (
        <section
          id="number-patterns"
          aria-labelledby="number-patterns-heading"
          className="space-y-3"
        >
          <h2 id="number-patterns-heading" className="text-lg font-semibold">
            Number patterns in a CSV
          </h2>
          <Suspense fallback={<TabLoading />}>
            <ForensicPanel headingLevel={3} />
          </Suspense>
        </section>
      ) : (
        <Suspense fallback={<TabLoading />}>
          {intro && activeView ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">
                  {say(tabLabel(activeView.alias), intro.heading)}
                </h2>
                <p className="text-sm text-muted">{say(intro.plain, intro.tactical)}</p>
              </div>
              {active === "residual" ? (
                <ResidualRadar onNavigate={onNavigate} />
              ) : (
                <CosoHeatmap onNavigate={onNavigate} />
              )}
            </div>
          ) : (
            <IntelligencePanel onNavigate={openTab} />
          )}
        </Suspense>
      )}
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
const ForensicPanel = lazy(() =>
  import("@/components/precog/forensic-panel").then((module) => ({
    default: module.ForensicPanel,
  })),
);
