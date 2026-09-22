import { useEffect, useMemo, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  Clock3,
  DollarSign,
  ShieldCheck,
  TriangleAlert,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_VALUE_CASE,
  calculateValueCase,
  normalizeValueCase,
  createValueCaseMemo,
  applyVerifiedAnnualHours,
  VALUE_CASE_STORAGE_KEY,
  type ValueCaseInputs,
  hasOwnObservations,
} from "@/lib/precog/value-case";
import { formatUsd } from "@/lib/utils";
import { ValueEvidenceRegister } from "./value-evidence-register";
import {
  normalizeValueEvidence,
  summarizeValueEvidence,
  VALUE_EVIDENCE_STORAGE_KEY,
  type ValueEvidence,
} from "@/lib/precog/value-evidence";

export function ValueProofCenter() {
  const [inputs, setInputs] = useState<ValueCaseInputs>(DEFAULT_VALUE_CASE);
  const [loaded, setLoaded] = useState(false);
  const [evidence, setEvidence] = useState<ValueEvidence[]>([]);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VALUE_CASE_STORAGE_KEY);
      if (stored) setInputs(normalizeValueCase(JSON.parse(stored)));
      const storedEvidence = window.localStorage.getItem(VALUE_EVIDENCE_STORAGE_KEY);
      if (storedEvidence) setEvidence(normalizeValueEvidence(JSON.parse(storedEvidence)));
    } catch {
      window.localStorage.removeItem(VALUE_CASE_STORAGE_KEY);
      window.localStorage.removeItem(VALUE_EVIDENCE_STORAGE_KEY);
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    const restore = (event: Event) => {
      const detail = (event as CustomEvent<{ valueCase?: unknown; evidence?: unknown }>).detail;
      setInputs(
        detail.valueCase
          ? normalizeValueCase(detail.valueCase as Partial<ValueCaseInputs>)
          : DEFAULT_VALUE_CASE,
      );
      setEvidence(normalizeValueEvidence(detail.evidence));
    };
    window.addEventListener("precog:value-proof-restored", restore);
    return () => window.removeEventListener("precog:value-proof-restored", restore);
  }, []);
  useEffect(() => {
    if (loaded) {
      window.localStorage.setItem(VALUE_CASE_STORAGE_KEY, JSON.stringify(inputs));
      window.localStorage.setItem(VALUE_EVIDENCE_STORAGE_KEY, JSON.stringify(evidence));
    }
  }, [inputs, evidence, loaded]);
  const value = useMemo(() => calculateValueCase(inputs), [inputs]);
  const ownObservations = useMemo(
    () => hasOwnObservations(inputs) || evidence.length > 0,
    [inputs, evidence],
  );
  const evidenceSummary = useMemo(() => summarizeValueEvidence(evidence), [evidence]);
  const update = (key: keyof ValueCaseInputs, next: number) =>
    setInputs((current) => normalizeValueCase({ ...current, [key]: next }));
  const exportMemo = () => {
    const blob = new Blob([createValueCaseMemo(inputs, new Date(), evidence)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `precog-value-case-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <Badge variant="accent">Executive value proof</Badge>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">
            Show what changed—without claiming every quiet year as savings
          </h2>
          <button
            type="button"
            onClick={exportMemo}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-xs font-medium hover:border-border-strong"
          >
            <Download className="size-4" />
            Export executive memo
          </button>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Separate auditable labor savings and recoveries from modeled risk reduction. The first is
          observed value; the second is a transparent scenario, never booked savings.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={Clock3}
          label="Hours returned"
          value={`${value.observed.hoursSaved.toLocaleString()} hrs`}
          note="Observed annual capacity"
        />
        <Metric
          icon={DollarSign}
          label="Observed value"
          value={formatUsd(value.observed.total)}
          note="Labor + direct recoveries"
        />
        <Metric
          icon={ShieldCheck}
          label="Modeled risk reduction"
          value={formatUsd(value.modeled.base)}
          note="Scenario—not realized savings"
          warning
        />
        <Metric
          icon={Calculator}
          label="Assumed loss baseline"
          value={formatUsd(value.modeled.expectedLossBefore)}
          note="Your exposure × your probability assumption"
          warning
        />
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
          {ownObservations ? (
            <>
              <MetricInline label="Net observed value" value={formatUsd(value.observed.net)} />
              <MetricInline
                label="Observed ROI"
                value={
                  value.observed.roi === null ? "—" : `${(value.observed.roi * 100).toFixed(0)}%`
                }
              />
              <MetricInline
                label="Observed payback"
                value={
                  value.observed.paybackMonths === null
                    ? "—"
                    : `${value.observed.paybackMonths.toFixed(1)} months`
                }
              />
            </>
          ) : (
            <p className="text-sm text-muted sm:col-span-3">
              No observed value yet. The figures on this tab start as the app&apos;s own
              assumptions; enter your own review hours, costs and recoveries below, or add an item
              to the evidence register, and the net value, return and payback appear here.
            </p>
          )}
        </CardContent>
      </Card>

      <ValueEvidenceRegister
        items={evidence}
        onChange={(items) => setEvidence(normalizeValueEvidence(items))}
      />

      {evidenceSummary.recoveries !== inputs.directRecoveries && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm">
          <div>
            <p className="font-medium">Recovery evidence does not match the value case</p>
            <p className="mt-0.5 text-xs text-muted">
              Verified evidence totals {formatUsd(evidenceSummary.recoveries)}; the value assumption
              is {formatUsd(inputs.directRecoveries)}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => update("directRecoveries", evidenceSummary.recoveries)}
            className="rounded-lg border border-warn/40 bg-bg px-3 py-2 text-xs font-medium text-warn hover:bg-warn/10"
          >
            Use verified total
          </button>
        </div>
      )}

      {evidenceSummary.hours > 0 && evidenceSummary.hours !== value.observed.hoursSaved && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm">
          <div>
            <p className="font-medium">Time evidence does not match the value case</p>
            <p className="mt-0.5 text-xs text-muted">
              Verified evidence totals {evidenceSummary.hours.toLocaleString()} annual hours; the
              value case calculates {value.observed.hoursSaved.toLocaleString()}.
            </p>
          </div>
          <button
            type="button"
            disabled={inputs.annualReviews === 0}
            onClick={() => setInputs(applyVerifiedAnnualHours(inputs, evidenceSummary.hours))}
            className="rounded-lg border border-warn/40 bg-bg px-3 py-2 text-xs font-medium text-warn hover:bg-warn/10 disabled:opacity-40"
          >
            Use verified hours
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Value assumptions</CardTitle>
            <CardDescription>
              The starting figures are the app&apos;s own assumptions, not measured results; replace
              each one with your own evidence where you have it. Values save in this browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Hours per review — before"
              value={inputs.reviewHoursBefore}
              onChange={(v) => update("reviewHoursBefore", v)}
            />
            <Field
              label="Hours per review — with Precog"
              value={inputs.reviewHoursAfter}
              onChange={(v) => update("reviewHoursAfter", v)}
            />
            <Field
              label="Loaded hourly cost"
              value={inputs.hourlyCost}
              prefix="$"
              onChange={(v) => update("hourlyCost", v)}
            />
            <Field
              label="Reviews per year"
              value={inputs.annualReviews}
              onChange={(v) => update("annualReviews", v)}
            />
            <Field
              label="Documented recoveries"
              value={inputs.directRecoveries}
              prefix="$"
              onChange={(v) => update("directRecoveries", v)}
            />
            <Field
              label="Annual program cost"
              value={inputs.annualProgramCost}
              prefix="$"
              onChange={(v) => update("annualProgramCost", v)}
            />
            <Field
              label="Annual loss exposure"
              value={inputs.annualExposure}
              prefix="$"
              onChange={(v) => update("annualExposure", v)}
            />
            <Field
              label="Baseline event probability"
              value={inputs.eventProbability * 100}
              suffix="%"
              step={0.1}
              onChange={(v) => update("eventProbability", v / 100)}
            />
            <Field
              label="Estimated control reduction"
              value={inputs.controlEffectiveness * 100}
              suffix="%"
              step={1}
              onChange={(v) => update("controlEffectiveness", v / 100)}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Modeled range</CardTitle>
              <CardDescription>
                Low / base / high sensitivity around control effectiveness.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(
                [
                  ["Low", value.modeled.low, "w-1/3"],
                  ["Base", value.modeled.base, "w-2/3"],
                  ["High", value.modeled.high, "w-full"],
                ] as const
              ).map(([label, amount, width]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted">{label}</span>
                    <span className="font-semibold tabular">{formatUsd(amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-elevated">
                    <div className={`h-full rounded-full bg-warn ${width}`} />
                  </div>
                </div>
              ))}
              <div className="flex gap-2 rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs leading-relaxed text-muted">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
                <p>
                  Do not add this modeled range to observed value. Validate exposure, probability,
                  and effectiveness independently.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Board-ready evidence ladder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                "Baseline review time documented",
                "Closed findings and recoveries linked to evidence",
                "Control coverage and completion tracked over time",
                "Actual access reconciled to approved access",
                "Comparative outcome study completed",
              ].map((item, index) => (
                <div
                  key={item}
                  className="flex items-start gap-2 rounded-lg border border-border bg-elevated p-2.5 text-xs"
                >
                  <CheckCircle2
                    className={`mt-0.5 size-4 shrink-0 ${index < 2 ? "text-ok" : "text-subtle"}`}
                  />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <span className="flex items-center rounded-lg border border-border bg-elevated px-3 focus-within:border-primary/60">
        {prefix && <span className="text-sm text-subtle">{prefix}</span>}
        <input
          className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm tabular outline-none"
          type="number"
          min="0"
          step={step}
          value={Number(value.toFixed(2))}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix && <span className="text-sm text-subtle">{suffix}</span>}
      </span>
    </label>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  note,
  warning = false,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  note: string;
  warning?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">{label}</p>
          <Icon className={`size-4 ${warning ? "text-warn" : "text-primary"}`} />
        </div>
        <p className="mt-2 text-2xl font-semibold tabular">{value}</p>
        <p className="mt-1 text-[11px] text-subtle">{note}</p>
      </CardContent>
    </Card>
  );
}

function MetricInline({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular">{value}</p>
    </div>
  );
}
