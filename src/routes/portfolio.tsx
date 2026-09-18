import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import { loadPortfolio, type BusinessSummary } from "@/lib/precog/practice-profile";
import { INDUSTRIES, industryMeta, type IndustryId } from "@/lib/precog/industry";
import { summarizeEvidence } from "@/lib/precog/builder/evidence";
import { useHydrated } from "@/lib/use-hydrated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Clock,
  Eye,
  Loader2,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/portfolio")({
  component: PortfolioGate,
  head: () => ({
    meta: [
      { title: "Portfolio · Precog Pioneer" },
      { name: "description", content: "Every business you manage, ranked by process-map health." },
    ],
  }),
});

function PortfolioGate() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <div className="min-h-dvh bg-bg p-8 text-sm text-muted" aria-busy="true">
        Loading portfolio…
      </div>
    );
  }
  return <PortfolioPage />;
}

type SortKey = "health" | "name" | "overdue" | "updated";

interface Row extends BusinessSummary {
  trend: number[];
  delta: number | null;
  overdueEvidence: number;
  evidenceCoverage: number | null;
  active: boolean;
}

function PortfolioPage() {
  const { profile, businesses, switchBusiness, createBusiness, switchingBusiness } = usePractice();
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortKey>("health");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState<IndustryId>("general");
  const activeId = profile.businessId ?? "biz_default";

  const rows = useMemo<Row[]>(() => {
    const local = loadPortfolio();
    return businesses.map((b) => {
      const p = b.id === activeId ? profile : local[b.id];
      const history = p?.mapHealthHistory ?? [];
      const trend = history.map((h) => h.score);
      const delta = trend.length >= 2 ? trend[trend.length - 1] - trend[0] : null;
      const ev = p?.customProcesses ? summarizeEvidence(p.customProcesses) : null;
      return {
        ...b,
        healthScore: b.id === activeId && trend.length ? trend[trend.length - 1] : b.healthScore,
        trend,
        delta,
        overdueEvidence: ev ? ev.overdue + ev.never : 0,
        evidenceCoverage: ev && ev.total ? ev.coverage : null,
        active: b.id === activeId,
      };
    });
  }, [businesses, profile, activeId]);

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "overdue") return b.overdueEvidence - a.overdueEvidence;
      if (sort === "updated") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return (a.healthScore ?? 101) - (b.healthScore ?? 101); // weakest first
    });
    return list;
  }, [rows, sort]);

  const avgHealth = rows.filter((r) => r.healthScore !== null).length
    ? Math.round(
        rows.reduce((s, r) => s + (r.healthScore ?? 0), 0) /
          rows.filter((r) => r.healthScore !== null).length,
      )
    : null;
  const totalOverdue = rows.reduce((s, r) => s + r.overdueEvidence, 0);
  const weakest = [...rows].filter((r) => r.healthScore !== null).sort((a, b) => (a.healthScore ?? 0) - (b.healthScore ?? 0))[0];

  async function open(id: string) {
    if (id !== activeId) {
      await switchBusiness(id);
      toast(`Switched to ${rows.find((r) => r.id === id)?.name ?? "business"}`);
    }
    void navigate({ to: "/" });
  }

  function submitNew() {
    createBusiness(industry, name);
    setAdding(false);
    setName("");
    toast.success(`Added ${name.trim() || industryMeta(industry).demoName}`);
    void navigate({ to: "/" });
  }

  return (
    <div className="min-h-[calc(100dvh-var(--grok-banner-h,0px))] bg-bg">
      <header className="border-b border-border bg-bg/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Back to dashboard
          </Link>
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <span className="inline-flex size-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
              <Eye className="size-3.5" />
            </span>
            Precog Pioneer
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
          <Badge variant="accent">Portfolio</Badge>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            {rows.length === 1 ? "Your business" : `${rows.length} businesses`}, ranked by map health
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            One view for an advisor or multi-location owner: who's healthy, who's slipping, and
            where control evidence is overdue. Weakest first by default.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Kpi label="Average health" value={avgHealth === null ? "—" : String(avgHealth)} hint={avgHealth === null ? "no scores yet" : bandLabel(avgHealth)} />
            <Kpi label="Overdue evidence" value={String(totalOverdue)} hint="across all businesses" tone={totalOverdue ? "warn" : "ok"} />
            <Kpi label="Needs attention" value={weakest ? weakest.name : "—"} hint={weakest?.healthScore !== null && weakest ? `health ${weakest.healthScore}` : ""} small />
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
            {(["health", "overdue", "updated", "name"] as SortKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={cn(
                  "px-2.5 py-1 capitalize",
                  k !== "health" && "border-l border-border",
                  sort === k ? "bg-elevated text-fg" : "text-muted hover:text-fg",
                )}
              >
                {k === "health" ? "Weakest first" : k === "updated" ? "Recently edited" : k}
              </button>
            ))}
          </div>
          {adding ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                className="rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-xs text-fg placeholder:text-subtle focus:border-primary/50 focus:outline-none"
                placeholder="Business name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitNew()}
                autoFocus
              />
              <select
                className="rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-xs text-fg"
                value={industry}
                onChange={(e) => setIndustry(e.target.value as IndustryId)}
              >
                {INDUSTRIES.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={submitNew}>
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" /> Add a business
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((r) => (
            <BusinessCard key={r.id} row={r} busy={switchingBusiness} onOpen={() => void open(r.id)} />
          ))}
        </div>
      </main>
    </div>
  );
}

function bandLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Healthy";
  if (score >= 55) return "Fair";
  if (score >= 40) return "At risk";
  return "Critical";
}

function scoreColor(score: number | null) {
  if (score === null) return "var(--color-border-strong)";
  if (score >= 85) return "var(--color-ok)";
  if (score >= 70) return "var(--color-primary)";
  if (score >= 55) return "var(--color-warn)";
  return "var(--color-danger)";
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return <div className="h-8 w-full" />;
  const w = 120;
  const h = 32;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / span) * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BusinessCard({ row, busy, onOpen }: { row: Row; busy: boolean; onOpen: () => void }) {
  const color = scoreColor(row.healthScore);
  return (
    <Card className={cn("transition-colors hover:border-border-strong", row.active && "border-primary/40")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
              <Building2 className="size-3.5 shrink-0 text-muted" />
              <span className="truncate">{row.name}</span>
              {row.active && <Check className="size-3.5 shrink-0 text-primary" aria-label="Active" />}
            </p>
            <p className="text-xs text-muted">{industryMeta(row.industry).label}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular" style={{ color }}>
              {row.healthScore ?? "—"}
            </p>
            <p className="text-[10px] text-subtle">{row.healthScore === null ? "not scored" : bandLabel(row.healthScore)}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Sparkline points={row.trend} color={color} />
          {row.delta !== null && row.delta !== 0 && (
            <span className={cn("inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium tabular", row.delta > 0 ? "text-ok" : "text-danger")}>
              {row.delta > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {row.delta > 0 ? "+" : ""}
              {row.delta}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <Badge variant="default">{row.processCount} processes</Badge>
          {row.overdueEvidence > 0 ? (
            <Badge variant="warn">
              <Clock className="mr-1 size-3" />
              {row.overdueEvidence} evidence due
            </Badge>
          ) : row.evidenceCoverage !== null ? (
            <Badge variant="ok">{row.evidenceCoverage}% evidence current</Badge>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-subtle">
            edited {new Date(row.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          <Button size="sm" variant={row.active ? "secondary" : "default"} onClick={onOpen} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
            {row.active ? "Open" : "Switch & open"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
  small,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "ok" | "warn";
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-elevated p-3">
      <p className="text-[10px] font-medium tracking-wide text-subtle uppercase">{label}</p>
      <p
        className={cn(
          "mt-1 truncate font-semibold tabular tracking-tight",
          small ? "text-base" : "text-2xl",
          tone === "warn" && "text-warn",
          tone === "ok" && "text-ok",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}
