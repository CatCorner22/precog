import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  buildThreatAssessment,
  type ThreatTarget,
} from "@/lib/precog/threat-scoring";
import { usePractice } from "@/lib/precog/practice-context";
import {
  PRIORITY_BAND_LABEL,
  predatorThermalColor,
  terminatorThreatColor,
} from "@/lib/precog/map-vision";
import { formatUsd, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ArrowLeft,
  Crosshair,
  Radio,
  Shield,
  Target,
  Zap,
} from "lucide-react";

function clockString() {
  const d = new Date();
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

function bandClass(band: string) {
  if (band === "white_hot" || band === "critical") return "text-red-300 border-red-500/50 bg-red-950/40";
  if (band === "elevated") return "text-amber-200 border-amber-500/40 bg-amber-950/30";
  if (band === "watch") return "text-emerald-200 border-emerald-500/30 bg-emerald-950/20";
  return "text-muted border-border bg-elevated";
}

export function ThreatAssessmentPanel() {
  const { profile } = usePractice();
  const [now, setNow] = useState(clockString);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const report = useMemo(
    () =>
      buildThreatAssessment({
        practiceName: profile.practiceName,
        staff: profile.staff,
        riskVariables: profile.riskVariables,
        dualRelease: profile.dualRelease,
      }),
    [profile.practiceName, profile.staff, profile.riskVariables, profile.dualRelease],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(clockString()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selectedId && report.targetDeck[0]) {
      setSelectedId(report.targetDeck[0].id);
    }
  }, [report.targetDeck, selectedId]);

  const selected =
    report.targetDeck.find((t) => t.id === selectedId) ?? report.targetDeck[0] ?? null;

  const force =
    report.overallThreatIndex >= 75
      ? "RED"
      : report.overallThreatIndex >= 50
        ? "AMBER"
        : "GREEN";

  return (
    <div className="threat-ops min-h-[calc(100dvh-var(--grok-banner-h,0px))] bg-[#050806] text-[#c8e6c8]">
      <header className="border-b border-[#1f3d28] bg-[#0a120e]/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded border border-[#2a5a35] bg-[#0c1510] px-2.5 py-1 text-[11px] tracking-widest text-[#7dff9a] hover:border-[#4ade80]/50"
            >
              <ArrowLeft className="size-3" />
              RTB
            </Link>
            <div className="flex items-center gap-2">
              <Crosshair className="size-4 text-[#4ade80]" />
              <div>
                <p className="text-[10px] tracking-[0.2em] text-[#5a9a68]">
                  OP · PRECOG-PIONEER
                </p>
                <p className="font-mono text-sm font-semibold tracking-widest">
                  THREAT ASSESSMENT
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tracking-wider">
            <span className="text-[#5a9a68]">
              AO · <span className="text-[#c8e6c8]">{report.ao}</span>
            </span>
            <span className="tabular text-[#4ade80]">{now}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-semibold",
                force === "RED" && "border-red-500/60 bg-red-950/50 text-red-300",
                force === "AMBER" && "border-amber-500/60 bg-amber-950/40 text-amber-200",
                force === "GREEN" && "border-[#4ade80]/50 bg-[#0c1f12] text-[#7dff9a]",
              )}
            >
              <span className="size-1.5 animate-pulse rounded-full bg-current" />
              FORCE {force}
            </span>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl gap-4 overflow-x-auto px-4 pb-2 font-mono text-[10px] tracking-[0.15em] text-[#5a9a68] sm:px-6">
          <span>CLASS · PRACTICE INTERNAL · EDUCATIONAL</span>
          <span>·</span>
          <span>NO PHI</span>
          <span>·</span>
          <span>
            INDEX {report.overallThreatIndex} · {report.classificationLabel} ·{" "}
            {report.targetDeck.length} TARGETS
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6">
        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Sitrep label="THREAT INDEX" value={String(report.overallThreatIndex)} hint={report.classificationLabel} />
          <Sitrep label="LEADING PRESSURE" value={String(report.leadingPressure)} hint={report.leadingBand} />
          <Sitrep label="WHITE HOT / CRIT" value={String(report.targetDeck.filter((t) => t.band === "white_hot" || t.band === "critical").length)} hint="Immediate priority" />
          <Sitrep label="TARGETS TRACKED" value={String(report.targetDeck.length)} hint="Control gaps · residual · SPOFs" />
        </section>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="threat-panel">
            <div className="mb-3 flex items-center gap-2 border-b border-[#1f3d28] pb-2">
              <Target className="size-4 text-[#4ade80]" />
              <h2 className="font-mono text-sm tracking-[0.18em]">PRIORITY QUEUE</h2>
            </div>
            <ul className="max-h-[520px] space-y-1.5 overflow-y-auto">
              {report.targetDeck.map((t, i) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded border px-3 py-2.5 text-left transition-colors",
                      selected?.id === t.id
                        ? "border-[#4ade80]/50 bg-[#0c1f12]"
                        : "border-[#1a3320] bg-[#080c09] hover:border-[#2a5a35]",
                    )}
                  >
                    <span className="w-5 shrink-0 font-mono text-[11px] text-[#5a9a68]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="mt-1 size-2.5 shrink-0 rounded-full"
                      style={{
                        background:
                          t.band === "white_hot" || t.band === "critical"
                            ? terminatorThreatColor(t.priority)
                            : predatorThermalColor(t.priority),
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px]", bandClass(t.band))}>
                          {PRIORITY_BAND_LABEL[t.band]}
                        </span>
                        <span className="font-mono text-[10px] text-[#5a9a68]">{t.domain.toUpperCase()}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm font-medium text-[#e8f5e8]">{t.label}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-[#5a9a68]">
                        P{t.priority} · {t.impactHint}
                      </span>
                    </span>
                    <span className="font-mono text-lg tabular text-[#4ade80]">{t.priority}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div className="space-y-4">
            {selected && (
              <section className="threat-panel">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={selected.band === "white_hot" || selected.band === "critical" ? "danger" : "warn"}>
                    {PRIORITY_BAND_LABEL[selected.band]}
                  </Badge>
                  <span className="font-mono text-xs tracking-widest text-[#7dff9a]">{selected.domain.toUpperCase()}</span>
                </div>
                <h3 className="text-base font-semibold text-[#e8f5e8]">{selected.label}</h3>
                <p className="mt-1 font-mono text-[11px] text-[#5a9a68]">{selected.impactHint}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono">
                  <Mini label="PRIORITY" value={String(selected.priority)} />
                  <Mini label="HEAT" value={String(selected.heat)} />
                  <Mini label="DOMAIN" value={selected.domain.toUpperCase()} />
                </div>
                <div className="mt-3">
                  <p className="font-mono text-[10px] tracking-widest text-[#5a9a68]">INTEL</p>
                  <ul className="mt-1 space-y-1 font-mono text-[11px] text-[#a8d4a8]">
                    {selected.reasons.map((r) => (
                      <li key={r}>▸ {r}</li>
                    ))}
                  </ul>
                </div>
                <div className="mt-3 rounded border border-[#2a5a35] bg-[#0c1f12] px-3 py-2">
                  <p className="font-mono text-[10px] tracking-widest text-[#4ade80]">RULES OF ENGAGEMENT</p>
                  <ul className="mt-1 space-y-1 font-mono text-[11px] text-[#c8e6c8]">
                    {selected.roe.map((r) => (
                      <li key={r}>· {r}</li>
                    ))}
                  </ul>
                </div>
                {selected.expectedLoss != null && (
                  <p className="mt-2 font-mono text-[11px] text-[#5a9a68]">
                    Expected retained {formatUsd(selected.expectedLoss)}
                    {selected.p50Days != null ? ` · p50 ${selected.p50Days}d` : ""}
                  </p>
                )}
              </section>
            )}

            <section className="threat-panel">
              <div className="mb-2 flex items-center gap-2">
                <Zap className="size-4 text-amber-300" />
                <h2 className="font-mono text-sm tracking-[0.18em]">STANDING ROE</h2>
              </div>
              <ul className="space-y-1.5 font-mono text-[11px] text-[#a8d4a8]">
                {report.roeSummary.map((r, i) => (
                  <li key={r}>
                    <span className="text-[#4ade80]">{String(i + 1).padStart(2, "0")}</span> {r}
                  </li>
                ))}
              </ul>
            </section>

            <section className="threat-panel">
              <div className="mb-2 flex items-center gap-2">
                <Radio className="size-4 text-[#4ade80]" />
                <h2 className="font-mono text-sm tracking-[0.18em]">MISSION BRIEF</h2>
              </div>
              <ul className="space-y-1.5 font-mono text-[11px] text-[#a8d4a8]">
                {report.missionBrief.map((line) => (
                  <li key={line}>▸ {line}</li>
                ))}
              </ul>
            </section>

            <div className="flex items-start gap-3 rounded border border-red-900/40 bg-black/60 p-3">
              <div className="t1000-buddy relative flex size-12 shrink-0 items-center justify-center">
                <div className="absolute inset-1.5 rounded-[40%] bg-gradient-to-b from-white/40 to-transparent" />
                <div className="relative z-[1] flex gap-1.5">
                  <span className="size-1.5 rounded-full bg-red-500/90 shadow-[0_0_6px_#f44]" />
                  <span className="size-1.5 rounded-full bg-red-500/90 shadow-[0_0_6px_#f44]" />
                </div>
              </div>
              <div className="min-w-0 font-mono text-[11px] text-red-300/90">
                <p className="tracking-widest text-red-200">FRIENDLY UNIT · T-1000 RISK</p>
                <p className="mt-1 normal-case tracking-normal text-red-300/80">
                  Mission: residual reduction to a reasonable level — not zero, not panic. White-hot
                  targets first. I'll be back after dual release is locked.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="pb-6 text-center font-mono text-[10px] tracking-widest text-[#2a5a35]">
          EDUCATIONAL DECISION SUPPORT · NOT A FORENSIC OPINION · NOT LEGAL ADVICE
        </p>
      </main>
    </div>
  );
}

function Sitrep({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="threat-panel">
      <p className="font-mono text-[9px] tracking-[0.15em] text-[#5a9a68]">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular text-[#4ade80]">{value}</p>
      <p className="mt-0.5 truncate font-mono text-[10px] text-[#5a9a68]">{hint}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[#1f3d28] bg-[#080c09] px-2 py-2">
      <p className="text-[9px] tracking-widest text-[#5a9a68]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-[#c8e6c8]">{value}</p>
    </div>
  );
}

/** Alias for route imports that expect ThreatAssessment */
export function ThreatAssessment() {
  return <ThreatAssessmentPanel />;
}
