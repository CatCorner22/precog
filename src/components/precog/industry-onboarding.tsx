import { useState } from "react";
import { INDUSTRIES, type IndustryId } from "@/lib/precog/industry";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { usePractice } from "@/lib/precog/practice-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  ChefHat,
  Building2,
  ShoppingBag,
  Stethoscope,
} from "lucide-react";

const ICONS: Record<IndustryId, typeof Stethoscope> = {
  dental: Stethoscope,
  retail: ShoppingBag,
  professional_services: Briefcase,
  restaurant: ChefHat,
  general: Building2,
};

/** First-visit industry picker — loads the demo template before exploring the app. */
export function IndustryOnboarding() {
  const { completeOnboarding } = usePractice();
  const [selected, setSelected] = useState<IndustryId>("dental");

  function start() {
    completeOnboarding(selected);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="industry-onboarding-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") completeOnboarding("dental");
      }}
    >
      <Card className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto border-border bg-surface shadow-2xl">
        <CardHeader>
          <Badge variant="accent" className="w-fit">
            Welcome to Precog Pioneer
          </Badge>
          <CardTitle id="industry-onboarding-title" className="text-xl sm:text-2xl">
            What kind of business are you exploring?
          </CardTitle>
          <CardDescription>
            Pick an industry to load a demo process map, knowledge graph, SoD conflicts, and
            scenarios. You can switch anytime in Business profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {INDUSTRIES.map((ind) => {
              const Icon = ICONS[ind.id];
              const tpl = getIndustryTemplate(ind.id);
              const active = selected === ind.id;
              return (
                <button
                  key={ind.id}
                  type="button"
                  onClick={() => setSelected(ind.id)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    active
                      ? "border-primary/50 bg-primary/10 glow-primary"
                      : "border-border bg-elevated hover:border-border-strong",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                        active ? "bg-primary/20 text-primary" : "bg-panel text-muted",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">{ind.label}</p>
                      <p className="mt-0.5 text-xs text-muted">{ind.tagline}</p>
                      <p className="mt-2 text-[10px] text-subtle">
                        {tpl.processes.length} processes · {tpl.people.length} people ·{" "}
                        {tpl.scenarios.length} scenarios
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <Button className="w-full" onClick={start} autoFocus>
            Load {INDUSTRIES.find((i) => i.id === selected)?.label} demo
          </Button>
          <p className="text-center text-[11px] text-subtle">
            Then open <span className="text-muted">Process map → Build</span> to replace the demo
            with your own processes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
