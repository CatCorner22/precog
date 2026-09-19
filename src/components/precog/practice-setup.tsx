import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import { INDUSTRIES, industryMeta } from "@/lib/precog/industry";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { SyncStatusBadge } from "@/components/precog/sync-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Gauge, Settings2, ShieldCheck } from "lucide-react";
import { APPETITES, type RiskAppetite } from "@/lib/precog/appetite";
import { cn } from "@/lib/utils";

/** Business profile editor — feeds staff into residual scores, scenarios, and Pioneer. */
export function PracticeSetup({ onOpenDualRelease }: { onOpenDualRelease?: () => void }) {
  const { profile, setPracticeName, setIndustry, setStaff, setDualRelease, resetProfile, setAppetite } =
    usePractice();
  const s = profile.staff;
  const appetite = profile.riskAppetite ?? "balanced";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4 text-primary" />
            Business profile
          </CardTitle>
          <SyncStatusBadge />
        </div>
        <CardDescription>
          Industry sets the demo template (process map, knowledge graph, scenarios). Team size
          and control posture drive residual scores and your AI advisor. Sign in to sync across
          devices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-sm">
          <span className="text-muted">Industry</span>
          <select
            value={profile.industry}
            onChange={(e) => {
              const next = e.target.value as typeof profile.industry;
              if (next === profile.industry) return;
              const label = INDUSTRIES.find((i) => i.id === next)?.label ?? next;
              const ok = window.confirm(
                `Switch to ${label}? This loads that industry's demo processes, people, scenarios, and staff defaults. Your decision log is kept.`,
              );
              if (ok) {
                setIndustry(next);
                const tpl = getIndustryTemplate(next);
                const meta = industryMeta(next);
                toast.success(`Loaded ${meta.label} template`, {
                  description: `${tpl.processes.length} processes · ${tpl.people.length} people · ${tpl.scenarios.length} scenarios`,
                });
              }
            }}
            className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
          >
            {INDUSTRIES.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted">Business name</span>
          <input
            value={profile.practiceName}
            onChange={(e) => setPracticeName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
          />
        </label>
        <div className="block text-sm">
          <span className="flex items-center gap-1.5 text-muted">
            <Gauge className="size-3.5" /> Risk appetite
          </span>
          <div className="mt-1 grid gap-1.5 sm:grid-cols-3">
            {(Object.keys(APPETITES) as RiskAppetite[]).map((id) => {
              const a = APPETITES[id];
              const on = appetite === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (on) return;
                    setAppetite(id);
                    toast.success(`${a.label} appetite`, {
                      description: `Hot ≥ ${a.hotHeat} · target health ${a.targetHealth} · ${a.weeklyActions} weekly actions`,
                    });
                  }}
                  className={cn(
                    "rounded-lg border p-2 text-left transition-colors",
                    on ? "border-primary/50 bg-primary/10" : "border-border bg-elevated hover:border-border-strong",
                  )}
                >
                  <p className="text-xs font-medium text-fg">{a.label}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-muted">{a.tagline}</p>
                  <p className="mt-1 text-[10px] tabular text-subtle">
                    hot ≥ {a.hotHeat} · target {a.targetHealth}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Slider
            label="Team size"
            value={s.teamSize}
            min={2}
            max={20}
            onChange={(v) => setStaff({ ...s, teamSize: v })}
          />
          <Slider
            label="Segregation score"
            value={s.segregationScore}
            min={0}
            max={100}
            onChange={(v) => setStaff({ ...s, segregationScore: v })}
          />
          <Slider
            label="Sole-owner knowledge items"
            value={s.soleOwnerKnowledgeCount}
            min={0}
            max={8}
            onChange={(v) => setStaff({ ...s, soleOwnerKnowledgeCount: v })}
          />
          <Slider
            label="Avg tenure (years)"
            value={Math.round(s.avgTenureYears * 10) / 10}
            min={0}
            max={15}
            step={0.5}
            onChange={(v) => setStaff({ ...s, avgTenureYears: v })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.dualControlPayments || profile.dualRelease.enabled}
            onChange={(e) => {
              const on = e.target.checked;
              setStaff({ ...s, dualControlPayments: on });
              setDualRelease({ ...profile.dualRelease, enabled: on });
            }}
            className="size-4 accent-[var(--color-primary)]"
          />
          Dual control / dual release (master)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.independentBankRec}
            onChange={(e) =>
              setStaff({ ...s, independentBankRec: e.target.checked })
            }
            className="size-4 accent-[var(--color-primary)]"
          />
          Independent bank reconciliation
        </label>
        {onOpenDualRelease && (
          <Button size="sm" variant="secondary" onClick={onOpenDualRelease}>
            <ShieldCheck className="size-3.5" />
            Configure dual-release thresholds
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={resetProfile}>
          Reset to demo defaults
        </Button>
      </CardContent>
    </Card>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="flex justify-between text-muted">
        <span>{label}</span>
        <span className="tabular text-fg">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--color-primary)]"
      />
    </label>
  );
}
