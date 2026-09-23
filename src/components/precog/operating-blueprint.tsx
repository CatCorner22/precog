import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Crown, Layers3, LifeBuoy } from "lucide-react";
import {
  PRACTICE_PROCESS_BLUEPRINTS,
  type PracticeProcessDomain,
} from "@/lib/precog/operating-blueprint";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTemplate } from "@/lib/precog/use-template";
import { INDUSTRIES, industryMeta } from "@/lib/precog/industry";
import { Button } from "@/components/ui/button";

const DOMAINS: (PracticeProcessDomain | "all")[] = [
  "all",
  "revenue",
  "cash",
  "purchasing",
  "payroll",
  "clinical",
  "technology",
  "governance",
];

/**
 * The screens that already apply to a business with no blueprint of its own,
 * by the tab each opens. Nothing here is blueprint content: each line says
 * what that screen does with the owner's own team, map and register.
 */
const APPLIES_WITHOUT_BLUEPRINT: { tab: string; label: string; what: string }[] = [
  {
    tab: "map",
    label: "How work flows",
    what: "Your processes, who owns each, and what is written down for them.",
  },
  {
    tab: "sod",
    label: "Who controls what",
    what: "Which duties one person should not hold together, and the Power map to move them.",
  },
  {
    tab: "knowledge",
    label: "Who knows what",
    what: "Who can run each duty, task and piece of know-how, and who to train next.",
  },
  {
    tab: "coso",
    label: "Coverage check",
    what: "How the controls on your map cover the five COSO components.",
  },
  {
    tab: "precog",
    label: "What could happen",
    what: "Loss scenarios for your line of business, with every assumption labelled.",
  },
];

export function OperatingBlueprint({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const tpl = useTemplate();
  const industryLabel = INDUSTRIES.find((i) => i.id === tpl.id)?.label ?? tpl.id;
  const [domain, setDomain] = useState<(typeof DOMAINS)[number]>("all");
  const [openId, setOpenId] = useState(PRACTICE_PROCESS_BLUEPRINTS[0].id);
  const filtered = useMemo(
    () =>
      PRACTICE_PROCESS_BLUEPRINTS.filter(
        (process) => domain === "all" || process.domain === domain,
      ),
    [domain],
  );

  if (tpl.id !== "dental") {
    return (
      <Card>
        <CardHeader>
          <Badge variant="default" className="w-fit">
            Not written yet
          </Badge>
          <CardTitle as="h1" className="mt-2">
            No operating blueprint for {industryLabel} yet
          </CardTitle>
          <CardDescription>
            This tab holds a step-by-step process and control blueprint, and so far one exists only
            for dental and medical offices. Rather than show that one to a{" "}
            {industryMeta(tpl.id).teamLabel}, the tab stays empty until a blueprint is written for
            your line of business. These screens already work from your own team, map and register:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {APPLIES_WITHOUT_BLUEPRINT.map((screen) => (
              <li
                key={screen.tab}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-elevated p-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{screen.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{screen.what}</span>
                </span>
                {onNavigate && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    aria-label={`Open ${screen.label}`}
                    onClick={() => onNavigate(screen.tab)}
                  >
                    Open <ArrowRight className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <Badge variant="accent">Target operating model</Badge>
        <h1 className="mt-3 text-xl font-semibold">Standard process and control blueprint</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          A practical baseline for a small dental practice: minimum good practice, leading practice,
          optimal structure, and an acceptable compensating fallback when staffing prevents full
          separation.
        </p>
      </section>
      <div className="flex flex-wrap gap-2">
        {DOMAINS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setDomain(item)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs capitalize",
              domain === item
                ? "border-primary/50 bg-primary/10 text-fg"
                : "border-border bg-elevated text-muted",
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="grid gap-3">
        {filtered.map((process, index) => {
          const open = process.id === openId;
          return (
            <Card key={process.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? "" : process.id)}
                className="w-full text-left"
              >
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">{String(index + 1).padStart(2, "0")}</Badge>
                      <Badge variant="primary">{process.domain}</Badge>
                    </div>
                    <CardTitle className="mt-2 text-base">{process.name}</CardTitle>
                    <CardDescription className="mt-1">{process.objective}</CardDescription>
                  </div>
                  <span className="text-xs text-muted">
                    {open ? "Collapse" : "Compare practices"}
                  </span>
                </CardHeader>
              </button>
              {open && (
                <CardContent className="space-y-4 border-t border-border pt-4">
                  <div className="grid gap-2 sm:grid-cols-3 text-xs">
                    <Info label="Primary owner" value={process.primaryOwner} />
                    <Info label="Independent reviewer" value={process.independentReviewer} />
                    <Info label="Cadence" value={process.cadence} />
                  </div>
                  <div className="grid gap-3 lg:grid-cols-4">
                    <Tier
                      icon={CheckCircle2}
                      title="Best practice"
                      tone="text-primary"
                      items={process.standard}
                    />
                    <Tier
                      icon={Layers3}
                      title="Leading practice"
                      tone="text-accent"
                      items={process.leading}
                    />
                    <Tier
                      icon={Crown}
                      title="Optimal structure"
                      tone="text-ok"
                      items={process.optimal}
                    />
                    <Tier
                      icon={LifeBuoy}
                      title="Acceptable fallback"
                      tone="text-warn"
                      items={process.fallback}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-subtle">
                      Evidence to retain
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {process.evidence.map((item) => (
                        <Badge key={item} variant="default">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-subtle">
        Educational baseline only. Tailor ownership, thresholds, cadence, and evidence to actual
        systems, contracts, law, risk, and team capacity.
      </p>
    </div>
  );
}

function Tier({
  icon: Icon,
  title,
  tone,
  items,
}: {
  icon: typeof CheckCircle2;
  title: string;
  tone: string;
  items: string[];
}) {
  return (
    <div className="rounded-xl border border-border bg-elevated p-3">
      <p className={cn("flex items-center gap-2 text-xs font-semibold", tone)}>
        <Icon className="size-3.5" />
        {title}
      </p>
      <ul className="mt-2 space-y-1.5 text-xs text-muted">
        {items.map((item) => (
          <li key={item}>· {item}</li>
        ))}
      </ul>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-2">
      <p className="text-subtle">{label}</p>
      <p className="mt-0.5 text-fg">{value}</p>
    </div>
  );
}
