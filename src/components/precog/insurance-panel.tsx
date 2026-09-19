import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import {
  LINE_LABEL,
  buildInsuranceReport,
  priceWithMoves,
  questionnaireCsv,
  questionnaireText,
  scenarioGaps,
  type CoverageStatus,
  type InsuranceInput,
  type InsuranceMove,
} from "@/lib/precog/insurance/model";
import { REVENUE_BANDS, type InsuranceLine } from "@/lib/precog/insurance/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatUsd } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  FileQuestion,
  Minus,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Umbrella,
  Wand2,
  X,
} from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-xs text-fg placeholder:text-subtle focus:border-primary/50 focus:outline-none";

const STATUS_META: Record<CoverageStatus, { label: string; variant: "ok" | "primary" | "warn" | "danger"; icon: typeof ShieldCheck }> = {
  available: { label: "Standard terms", variant: "ok", icon: ShieldCheck },
  sublimited: { label: "Restricted", variant: "warn", icon: AlertTriangle },
  at_risk: { label: "Exclusions likely", variant: "danger", icon: ShieldOff },
  likely_declined: { label: "Likely declined", variant: "danger", icon: ShieldOff },
};

function gradeTone(g: string) {
  return g === "A" ? "text-ok" : g === "B" ? "text-primary" : g === "C" ? "text-warn" : "text-danger";
}

export function InsurancePanel({ onOpenTab }: { onOpenTab: (tab: string, id?: string) => void }) {
  const { profile, setInsurance, setRiskVariables, applyInsuranceMove, templateRevision } = usePractice();
  const tpl = useTemplate();
  const insurance = profile.insurance!;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [section, setSection] = useState<"moves" | "coverage" | "questions" | "gaps">("moves");
  const [whatIfDeductible, setWhatIfDeductible] = useState<number | null>(null);
  const [whatIfLimit, setWhatIfLimit] = useState<number | null>(null);

  const input = useMemo<InsuranceInput>(
    () => ({
      profile: insurance,
      staff: profile.staff,
      riskVariables: profile.riskVariables,
      dualRelease: profile.dualRelease,
      processes: tpl.processes,
      controls: tpl.controls,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [insurance, profile.staff, profile.riskVariables, profile.dualRelease, tpl.processes, tpl.controls, templateRevision],
  );
  const report = useMemo(() => buildInsuranceReport(input), [input]);
  const combined = useMemo(() => (picked.size ? priceWithMoves(input, report.answers, picked) : null), [input, report.answers, picked]);
  const combinedTotal = combined ? combined.premiums.filter((p) => p.carried).reduce((s, p) => s + p.mid, 0) : report.totalMid;
  const gapsWhatIf = useMemo(
    () =>
      whatIfDeductible !== null || whatIfLimit !== null
        ? scenarioGaps(input, {
            ...(whatIfDeductible !== null ? { deductible: whatIfDeductible } : {}),
            ...(whatIfLimit !== null ? { policyLimit: whatIfLimit } : {}),
          })
        : null,
    [input, whatIfDeductible, whatIfLimit],
  );

  function togglePick(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function apply(move: InsuranceMove) {
    const r = applyInsuranceMove(move);
    if (r === "applied") toast.success("Applied to your profile", { description: `${move.title} — scores, scenarios, and premiums re-priced.` });
    else if (r === "attested") toast.success("Recorded as in place", { description: "Keep the written procedure — carriers ask for it at claim time." });
    else {
      toast("Fix this on the map", { description: "Open the builder and resolve the SoD conflict or assign duties." });
      onOpenTab("sod");
    }
    setPicked((s) => {
      const n = new Set(s);
      n.delete(move.questionId);
      return n;
    });
  }

  function download(name: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const slug = profile.practiceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "business";

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Insurance impact</Badge>
          <Badge variant="default">Indicative — not a quote</Badge>
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
          See how each control change moves your premium and your coverage
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Underwriters ask the same twenty questions. The map already answers the big ones; you attest the rest.
          Every answer carries a credit or surcharge and — for the gating ones — a coverage consequence. Change an answer and
          watch the price, the exclusions, and your readiness move.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi
            label="Indicative annual premium"
            value={formatUsd(report.totalMid)}
            hint={`${formatUsd(report.totalLow)} – ${formatUsd(report.totalHigh)} · ${report.premiums.filter((p) => p.carried).length} line(s) carried`}
            tone="primary"
          />
          {report.readiness.map((r) => (
            <Kpi
              key={r.line}
              label={r.label.split(" (")[0].split(" /")[0]}
              value={`${r.score}`}
              hint={`grade ${r.grade} · ${r.answered}/${r.total} answered`}
              tone={r.score >= 70 ? "ok" : r.score >= 50 ? "warn" : "danger"}
            />
          ))}
          <Kpi
            label="Answers documented"
            value={`${report.documentedShare}%`}
            hint="backed by current evidence"
            tone={report.documentedShare >= 60 ? "ok" : "warn"}
          />
        </div>
      </section>

      {/* Facts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Umbrella className="size-4 text-primary" /> Your programme
          </CardTitle>
          <CardDescription>Revenue band and claims history set the base; limits and deductibles shape both price and what you keep.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs">
            <span className="text-muted">Annual revenue</span>
            <select className={cn(inputCls, "mt-1")} value={insurance.revenueBand} onChange={(e) => setInsurance({ revenueBand: e.target.value as typeof insurance.revenueBand })}>
              {REVENUE_BANDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-muted">Claims in last 3 years</span>
            <input type="number" min={0} max={10} className={cn(inputCls, "mt-1")} value={insurance.priorClaims3y} onChange={(e) => setInsurance({ priorClaims3y: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} />
          </label>
          <LineTerms
            title="Crime / employee dishonesty"
            carry={insurance.crime.carry}
            onCarry={(v) => setInsurance({ crime: { carry: v } })}
            limit={profile.riskVariables.policyLimit}
            deductible={profile.riskVariables.deductible}
            onLimit={(v) => setRiskVariables((r) => ({ ...r, policyLimit: v }))}
            onDeductible={(v) => setRiskVariables((r) => ({ ...r, deductible: v }))}
            extra={
              <label className="mt-1 block text-[11px] text-muted">
                Base premium (from your renewal)
                <input type="number" min={0} step={100} className={cn(inputCls, "mt-0.5")} value={profile.riskVariables.basePremiumAnnual} onChange={(e) => setRiskVariables((r) => ({ ...r, basePremiumAnnual: Math.max(0, Number(e.target.value) || 0) }))} />
              </label>
            }
          />
          <LineTerms
            title="Cyber liability"
            carry={insurance.cyber.carry}
            onCarry={(v) => setInsurance({ cyber: { ...insurance.cyber, carry: v } })}
            limit={insurance.cyber.limit}
            deductible={insurance.cyber.deductible}
            onLimit={(v) => setInsurance({ cyber: { ...insurance.cyber, limit: v } })}
            onDeductible={(v) => setInsurance({ cyber: { ...insurance.cyber, deductible: v } })}
            extra={
              <label className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                <input type="checkbox" className="size-3.5 accent-[var(--color-primary)]" checked={insurance.socialEngineering.carry} onChange={(e) => setInsurance({ socialEngineering: { ...insurance.socialEngineering, carry: e.target.checked } })} />
                Social engineering rider · sublimit
                <input type="number" min={0} step={5000} className={cn(inputCls, "w-24")} value={insurance.socialEngineering.sublimit} onChange={(e) => setInsurance({ socialEngineering: { ...insurance.socialEngineering, sublimit: Math.max(0, Number(e.target.value) || 0) } })} />
              </label>
            }
          />
        </CardContent>
      </Card>

      {/* Premium breakdown */}
      <div className="grid gap-3 lg:grid-cols-3">
        {report.premiums.map((p) => (
          <Card key={p.line} className={cn(!p.carried && "opacity-70")}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-muted">{p.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular tracking-tight">{formatUsd(p.mid)}</p>
                  <p className="text-[11px] text-subtle">
                    {formatUsd(p.low)} – {formatUsd(p.high)} / yr{p.carried ? "" : " · not carried"}
                  </p>
                </div>
                <div className="text-right text-[11px] tabular">
                  <p className="text-ok">−{p.creditPct}% credits</p>
                  <p className="text-danger">+{p.surchargePct}% surcharges</p>
                  {p.claimsLoadPct > 0 && <p className="text-warn">+{p.claimsLoadPct}% claims</p>}
                </div>
              </div>
              <ul className="mt-2 space-y-0.5">
                {p.drivers.slice(0, 4).map((d) => (
                  <li key={d.label} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-muted">{d.label}</span>
                    <span className={cn("shrink-0 tabular", d.pct < 0 ? "text-ok" : "text-danger")}>
                      {d.pct > 0 ? "+" : ""}
                      {d.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Section tabs */}
      <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
        {(
          [
            ["moves", "What changes your rate"],
            ["coverage", "Coverage outlook"],
            ["questions", "Questionnaire"],
            ["gaps", "Scenario gaps"],
          ] as const
        ).map(([id, label], i) => (
          <button key={id} type="button" onClick={() => setSection(id)} className={cn("px-3 py-1.5", i > 0 && "border-l border-border", section === id ? "bg-elevated text-fg" : "text-muted hover:text-fg")}>
            {label}
          </button>
        ))}
      </div>

      {section === "moves" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="size-4 text-accent" /> What changes your rate
            </CardTitle>
            <CardDescription>
              Each row is one control you don't have yet. Tick several to see the combined effect; <strong className="text-fg">Apply</strong> makes it real —
              flipping the flag in your profile or recording an attestation. Ranked by value per hour of effort.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {combined && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs">
                <span>
                  With {picked.size} change(s): <strong className="tabular text-fg">{formatUsd(combinedTotal)}</strong>/yr{" "}
                  <span className="text-ok tabular">(−{formatUsd(report.totalMid - combinedTotal)}, −{report.totalMid ? Math.round(((report.totalMid - combinedTotal) / report.totalMid) * 100) : 0}%)</span>
                  {" · "}
                  readiness {combined.readiness.map((r) => `${r.label.split(" ")[0]} ${r.score}`).join(" · ")}
                </span>
                <span className="flex flex-wrap gap-1">
                  {combined.coverage.map((c) => (
                    <Badge key={c.line} variant={STATUS_META[c.status].variant}>
                      {c.label.split(" ")[0]}: {STATUS_META[c.status].label}
                    </Badge>
                  ))}
                  <button type="button" onClick={() => setPicked(new Set())} className="ml-1 text-subtle hover:text-fg" aria-label="Clear">
                    <X className="size-3.5" />
                  </button>
                </span>
              </div>
            )}
            {report.moves.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-ok">
                <CheckCircle2 className="size-4" /> Every question is answered yes. You're in the best-rated bucket this model knows about.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {report.moves.map((m) => (
                  <MoveRow key={m.id} move={m} picked={picked.has(m.questionId)} onPick={() => togglePick(m.questionId)} onApply={() => apply(m)} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {section === "coverage" && (
        <div className="grid gap-3 lg:grid-cols-3">
          {report.coverage.map((c) => {
            const meta = STATUS_META[c.status];
            const Icon = meta.icon;
            return (
              <Card key={c.line}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Icon className={cn("size-4", meta.variant === "ok" ? "text-ok" : meta.variant === "warn" ? "text-warn" : "text-danger")} />
                    {c.label}
                  </CardTitle>
                  <Badge variant={meta.variant} className="w-fit">
                    {meta.label}
                  </Badge>
                  <CardDescription>{c.headline}</CardDescription>
                </CardHeader>
                <CardContent>
                  {c.effects.length === 0 ? (
                    <p className="text-xs text-muted">No gating gaps. Standard exclusions still apply — read the policy.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {c.effects.map((e, i) => (
                        <li key={`${e.questionId}-${i}`} className="rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[11px]">
                          <div className="flex items-center gap-1.5 font-medium text-fg">
                            <Badge variant={e.kind === "decline" ? "danger" : e.kind === "exclusion" ? "danger" : "warn"} className="px-1 py-0 text-[9px] uppercase">
                              {e.kind.replace("_", " ")}
                            </Badge>
                            {e.coverage}
                          </div>
                          <p className="mt-0.5 text-muted">{e.detail}</p>
                          <p className="mt-0.5 text-subtle">Because: {e.prompt}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {section === "questions" && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileQuestion className="size-4 text-primary" /> Underwriting questionnaire
                </CardTitle>
                <CardDescription>
                  Map-derived answers update automatically. Attestations are yours to confirm — be honest; carriers rescind at claim time.{" "}
                  <span className="text-ok">Documented</span> means current evidence on the map backs the answer.
                </CardDescription>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard.writeText(questionnaireText(report, profile.practiceName)).then(() => toast.success("Questionnaire copied"))}>
                  <Copy className="size-3.5" /> Copy
                </Button>
                <Button size="sm" variant="secondary" onClick={() => download(`${slug}-underwriting-questionnaire.csv`, questionnaireCsv(report, profile.practiceName), "text/csv;charset=utf-8")}>
                  <Download className="size-3.5" /> CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(["crime", "cyber", "social_engineering"] as InsuranceLine[]).map((line) => {
              const r = report.readiness.find((x) => x.line === line)!;
              const rows = report.answers.filter((a) => a.q.lines[0] === line);
              if (!rows.length) return null;
              return (
                <div key={line}>
                  <p className="mb-1 flex items-center gap-2 text-xs font-medium">
                    {LINE_LABEL[line]}
                    <span className={cn("tabular", gradeTone(r.grade))}>
                      {r.score} · {r.grade}
                    </span>
                    <span className="text-subtle">· {r.documentedShare}% documented</span>
                  </p>
                  <ul className="space-y-1">
                    {rows.map((a) => (
                      <li key={a.q.id} className="flex items-start gap-2 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs">
                        <span className="mt-0.5 shrink-0">
                          {a.answer === true ? <Check className="size-3.5 text-ok" /> : a.answer === false ? <X className="size-3.5 text-danger" /> : <Minus className="size-3.5 text-subtle" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-fg">
                            {a.q.prompt}
                            {a.documented && <Badge variant="ok" className="ml-1.5 inline-flex px-1 py-0 text-[9px]">documented</Badge>}
                            {a.q.lines.length > 1 && <span className="ml-1.5 text-[10px] text-subtle">also {a.q.lines.filter((l) => l !== line).map((l) => LINE_LABEL[l].split(" ")[0]).join(", ")}</span>}
                          </div>
                          <p className="text-[11px] text-muted">{a.q.why}</p>
                        </div>
                        {a.q.source === "attestation" && a.q.attestation ? (
                          <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border text-[11px]">
                            {[
                              ["Yes", true],
                              ["No", false],
                            ].map(([lbl, v], i) => (
                              <button
                                key={String(lbl)}
                                type="button"
                                onClick={() => setInsurance((cur) => ({ ...cur, attestations: { ...cur.attestations, [a.q.attestation!]: v as boolean } }))}
                                className={cn("px-2 py-1", i > 0 && "border-l border-border", a.answer === v ? (v ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger") : "text-muted hover:text-fg")}
                              >
                                {String(lbl)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <button type="button" onClick={() => onOpenTab(a.q.id === "segregation" ? "sod" : a.q.source === "map" ? "sod" : "command")} className="shrink-0 text-[11px] text-primary hover:underline">
                            from {a.q.source === "map" ? "map" : "profile"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {section === "gaps" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" /> What your top scenarios would leave you holding
            </CardTitle>
            <CardDescription>
              Expected and severe-case loss per Precog scenario against your crime terms. Slide the deductible and limit to see the trade — a lower deductible costs premium; a low limit leaves the tail with you.
            </CardDescription>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Range label="Deductible (what-if)" value={whatIfDeductible ?? profile.riskVariables.deductible} min={0} max={50000} step={500} onChange={setWhatIfDeductible} />
              <Range label="Limit (what-if)" value={whatIfLimit ?? profile.riskVariables.policyLimit} min={25000} max={1000000} step={25000} onChange={setWhatIfLimit} />
            </div>
            {(whatIfDeductible !== null || whatIfLimit !== null) && (
              <div className="mt-1 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setRiskVariables((r) => ({ ...r, deductible: whatIfDeductible ?? r.deductible, policyLimit: whatIfLimit ?? r.policyLimit }));
                    setWhatIfDeductible(null);
                    setWhatIfLimit(null);
                    toast.success("Terms updated", { description: "Scenario retention and premium re-priced." });
                  }}
                >
                  Adopt these terms
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setWhatIfDeductible(null); setWhatIfLimit(null); }}>
                  Reset
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] tracking-wide text-subtle uppercase">
                  <th className="py-1.5 pr-2">Scenario</th>
                  <th className="py-1.5 pr-2 text-right">Expected loss</th>
                  <th className="py-1.5 pr-2 text-right">Insurer pays</th>
                  <th className="py-1.5 pr-2 text-right">You keep</th>
                  <th className="py-1.5 text-right">Severe case you keep</th>
                </tr>
              </thead>
              <tbody>
                {(gapsWhatIf ?? report.gaps).map((g, i) => {
                  const base = report.gaps[i];
                  const delta = gapsWhatIf && base ? g.retainedExpected - base.retainedExpected : 0;
                  return (
                    <tr key={g.scenarioId} className="border-b border-border align-top">
                      <td className="py-1.5 pr-2">
                        <button type="button" onClick={() => onOpenTab("precog", g.scenarioId)} className="text-left font-medium text-fg hover:underline">
                          {g.title}
                        </button>
                        {g.aboveLimit && <p className="text-[10px] text-danger">Severe case exceeds deductible + limit</p>}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular text-muted">{formatUsd(g.grossExpected)}</td>
                      <td className="py-1.5 pr-2 text-right tabular text-ok">{formatUsd(g.transferredExpected)}</td>
                      <td className="py-1.5 pr-2 text-right tabular">
                        <span className={cn("font-semibold", g.retainedShare >= 60 ? "text-danger" : g.retainedShare >= 30 ? "text-warn" : "text-fg")}>{formatUsd(g.retainedExpected)}</span>
                        <span className="ml-1 text-[10px] text-subtle">({g.retainedShare}%)</span>
                        {delta !== 0 && (
                          <span className={cn("ml-1 inline-flex items-center text-[10px] tabular", delta < 0 ? "text-ok" : "text-danger")}>
                            {delta < 0 ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
                            {formatUsd(Math.abs(delta))}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular text-muted">{formatUsd(g.retainedHigh)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-subtle">
              Retained = deductible + any coinsurance share + everything above the limit. Loss figures come from the Precog scenario engine for your staff and controls.
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-subtle">
        Educational model of common small-business underwriting practice. Credits, surcharges, sublimits, and base rates are illustrative market patterns, not any carrier's rating plan or policy wording. Confirm with your broker before relying on any figure.
      </p>
    </div>
  );
}

function MoveRow({ move, picked, onPick, onApply }: { move: InsuranceMove; picked: boolean; onPick: () => void; onApply: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={cn("rounded-lg border bg-elevated", picked ? "border-accent/50" : "border-border")}>
      <div className="flex items-center gap-2 px-2.5 py-2 text-xs">
        <input type="checkbox" checked={picked} onChange={onPick} className="size-3.5 shrink-0 accent-[var(--color-accent)]" aria-label={`Include ${move.title}`} />
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight className={cn("size-3 shrink-0 text-subtle transition-transform", open && "rotate-90")} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-fg">{move.title}</span>
            <span className="block truncate text-[10px] text-subtle">
              {move.effort} effort · {move.costHint}
              {move.unlocks.length ? ` · unlocks ${move.unlocks.length} coverage item(s)` : ""}
            </span>
          </span>
        </button>
        <span className={cn("w-24 shrink-0 text-right tabular", move.premiumDelta > 0 ? "text-ok" : "text-subtle")}>
          {move.premiumDelta > 0 ? `−${formatUsd(move.premiumDelta)}` : "—"}
          <span className="block text-[10px] text-subtle">{move.premiumDelta > 0 ? `−${move.premiumDeltaPct}% / yr` : "coverage only"}</span>
        </span>
        <Button size="sm" variant={move.applicable === "attest" ? "secondary" : "default"} onClick={onApply}>
          {move.applicable === "attest" ? "We do this" : move.applicable === "map" ? "Fix on map" : "Apply"}
        </Button>
      </div>
      {open && (
        <div className="space-y-1.5 border-t border-border px-2.5 py-2 text-[11px]">
          <p className="text-muted">{move.why}</p>
          {move.unlocks.length > 0 && (
            <ul className="space-y-0.5">
              {move.unlocks.map((u, i) => (
                <li key={i} className="flex items-start gap-1.5 text-fg">
                  <ShieldCheck className="mt-0.5 size-3 shrink-0 text-ok" />
                  <span>
                    Removes <span className="font-medium">{u.kind.replace("_", " ")}</span> on {u.coverage}: <span className="text-muted">{u.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function LineTerms({
  title,
  carry,
  onCarry,
  limit,
  deductible,
  onLimit,
  onDeductible,
  extra,
}: {
  title: string;
  carry: boolean;
  onCarry: (v: boolean) => void;
  limit: number;
  deductible: number;
  onLimit: (v: number) => void;
  onDeductible: (v: number) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-2.5 text-xs">
      <label className="flex items-center gap-2 font-medium text-fg">
        <input type="checkbox" className="size-3.5 accent-[var(--color-primary)]" checked={carry} onChange={(e) => onCarry(e.target.checked)} />
        {title}
      </label>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <label className="text-[11px] text-muted">
          Limit
          <input type="number" min={0} step={25000} className={cn(inputCls, "mt-0.5")} value={limit} onChange={(e) => onLimit(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="text-[11px] text-muted">
          Deductible
          <input type="number" min={0} step={500} className={cn(inputCls, "mt-0.5")} value={deductible} onChange={(e) => onDeductible(Math.max(0, Number(e.target.value) || 0))} />
        </label>
      </div>
      {extra}
    </div>
  );
}

function Range({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-xs">
      <span className="flex justify-between text-muted">
        <span>{label}</span>
        <span className="tabular text-fg">{formatUsd(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-primary)]" />
    </label>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "ok" | "warn" | "danger" | "primary" }) {
  return (
    <div className="rounded-xl border border-border bg-elevated p-3">
      <p className="text-[10px] font-medium tracking-wide text-subtle uppercase">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular tracking-tight", tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "danger" && "text-danger", tone === "primary" && "text-primary")}>{value}</p>
      <p className="text-[11px] text-muted">{hint}</p>
    </div>
  );
}
