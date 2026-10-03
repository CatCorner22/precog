import { useState } from "react";
import { usePracticeState } from "@/lib/precog/practice-context";
import { AdvancedReasoningPanel } from "@/components/precog/advanced-reasoning-panel";
import { MetaAnalysisPanel } from "@/components/precog/meta-analysis-panel";
import { SignalsPanel } from "@/components/precog/signals-panel";
import { Button } from "@/components/ui/button";
import { Brain, Radar, Sparkles } from "lucide-react";
import type { NavFn } from "@/lib/precog/navigation";

type PatternsView = "signals" | "reasoning" | "meta";

/**
 * The Patterns views, the actionable one first: what Precog watches and the
 * first move, then the order of fixes, then what Precog can and cannot see.
 * The number-pattern screen for a CSV lives in the Monthly review.
 */
const VIEWS: { id: PatternsView; label: string; icon: typeof Brain }[] = [
  { id: "signals", label: "Signals + guidance", icon: Brain },
  { id: "reasoning", label: "Order of fixes", icon: Sparkles },
  { id: "meta", label: "What Precog can see", icon: Radar },
];

export function IntelligencePanel({ onNavigate }: { onNavigate?: NavFn }) {
  const { profile } = usePracticeState();
  const [view, setView] = useState<PatternsView>("signals");

  return (
    <div className="space-y-4">
      {/* Each view below has its own heading; this names the tab. */}
      <h1 className="sr-only">Patterns</h1>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Patterns view">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            size="sm"
            variant={view === id ? "default" : "secondary"}
            aria-pressed={view === id}
            onClick={() => setView(id)}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </Button>
        ))}
      </div>

      {view === "signals" && <SignalsPanel key={profile.industry} onNavigate={onNavigate} />}
      {view === "reasoning" && <AdvancedReasoningPanel />}
      {view === "meta" && <MetaAnalysisPanel onNavigate={onNavigate} />}
    </div>
  );
}
