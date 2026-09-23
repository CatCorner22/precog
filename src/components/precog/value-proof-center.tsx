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
  type ValueCaseInputs,
  type ValueInputKey,
  type ObservedFigure,
  normalizeEnteredInputs,
  observedValueStatus,
  inputList,
} from "@/lib/precog/value-case";
import { formatUsd } from "@/lib/utils";
import { ValueEvidenceRegister } from "./value-evidence-register";
import {
  normalizeValueEvidence,
  summarizeValueEvidence,
  type ValueEvidence,
} from "@/lib/precog/value-evidence";
import { readValueProof, writeValueProof } from "@/lib/precog/value-proof-store";
import { usePractice } from "@/lib/precog/practice-context";

export function ValueProofCenter() {
  const { profile } = usePractice();
  const businessId = profile.businessId ?? "biz_default";
  const [inputs, setInputs] = useState<ValueCaseInputs>(DEFAULT_VALUE_CASE);
  // Inputs the owner typed into, so a figure they enter that happens to equal
  // the app default still counts as theirs.
  const [typed, setTyped] = useState<ValueInputKey[]>([]);
  // The business whose figures are on screen; nothing is saved until they
  // are, so one business's figures never land under another's.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<ValueEvidence[]>([]);
  // False once the browser refuses a write (blocked site data, full quota):
  // the figures still work here, but only until this tab closes.
  const [kept, setKept] = useState(true);
  useEffect(() => {
    // Each business has its own figures; a business with none starts from the
    // defaults. A stored value that is unreadable or malformed is ignored.
    const stored = readValueProof(businessId);
    const storedCase =
      stored.valueCase && typeof stored.valueCase === "object"
        ? (stored.valueCase as Partial<ValueCaseInputs> & { entered?: unknown })
        : null;
    setInputs(storedCase ? normalizeValueCase(storedCase) : DEFAULT_VALUE_CASE);
    setTyped(normalizeEnteredInputs(storedCase?.entered));
    setEvidence(normalizeValueEvidence(stored.evidence));
    setLoadedFor(businessId);
  }, [businessId]);
  useEffect(() => {
    const restore = (event: Event) => {
      const detail = (event as CustomEvent<{ valueCase?: unknown; evidence?: unknown }>).detail;
      setInputs(
        detail.valueCase
          ? normalizeValueCase(detail.valueCase as Partial<ValueCaseInputs>)
          : DEFAULT_VALUE_CASE,
      );
      setTyped(normalizeEnteredInputs((detail.valueCase as { entered?: unknown } | null)?.entered));
      setEvidence(normalizeValueEvidence(detail.evidence));
    };
    window.addEventListener("precog:value-proof-restored", restore);
    return () => window.removeEventListener("precog:value-proof-restored", restore);
  }, []);
  useEffect(() => {
    if (loadedFor !== businessId) return;
    setKept(writeValueProof(businessId, { valueCase: { ...inputs, entered: typed }, evidence }));
  }, [inputs, typed, evidence, loadedFor, businessId]);
  const value = useMemo(() => calculateValueCase(inputs), [inputs]);
  const status = useMemo(() => observedValueStatus(inputs, typed), [inputs, typed]);
  const isDefault = (key: ValueInputKey) => !status.entered.has(key);
  const evidenceSummary = useMemo(() => summarizeValueEvidence(evidence), [evidence]);
  const update = (key: keyof ValueCaseInputs, next: number) => {
    setTyped((current) => (current.includes(key) ? current : [...current, key]));
    setInputs((current) => normalizeValueCase({ ...current, [key]: next }));
  };
  const exportMemo = () => {
    const blob = new Blob([createValueCaseMemo(inputs, new Date(), evidence, typed)], {
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
          <h1 className="text-xl font-semibold">
            Show what changed—without claiming every quiet year as savings
          </h1>
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
        {!kept && (
          <p className="mt-3 max-w-3xl text-sm text-warn" role="status">
            This browser is not keeping data for this site, so the figures and evidence below last
            only until this tab closes. Export the executive memo to keep a copy.
          </p>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={Clock3}
          label="Hours returned"
          value={
            status.hours.observed ? `${value.observed.hoursSaved.toLocaleString()} hrs` : NOT_YET
          }
          note={
            status.hours.observed
              ? usesDefaults(status.hours, "Your review hours × reviews per year")
              : `App default assumption: ${value.observed.hoursSaved.toLocaleString()} hrs (${inputs.reviewHoursBefore} → ${inputs.reviewHoursAfter} hrs × ${inputs.annualReviews} reviews). Enter your own review hours.`
          }
        />
        <Metric
          icon={DollarSign}
          label="Observed value"
          value={status.value.observed ? formatUsd(status.value.value ?? 0) : NOT_YET}
          note={
            status.value.observed
              ? usesDefaults(status.value, "Labor + documented recoveries")
              : `App default assumption: ${formatUsd(value.observed.total)} of labor. Enter your review hours and hourly cost, or a recovery.`
          }
        />
        <Metric
          icon={ShieldCheck}
          label="Modeled risk reduction"
          value={formatUsd(value.modeled.base)}
          note={
            isDefault("annualExposure") &&
            isDefault("eventProbability") &&
            isDefault("controlEffectiveness")
              ? "Scenario, not realized savings; every input is an app default"
              : "Scenario, not realized savings"
          }
          warning
        />
        <Metric
          icon={Calculator}
          label="Assumed loss baseline"
          value={formatUsd(value.modeled.expectedLossBefore)}
          note={`${isDefault("annualExposure") ? "App default exposure" : "Your exposure"} × ${isDefault("eventProbability") ? "app default probability" : "your probability assumption"}`}
          warning
        />
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
          {status.anyObservation || evidence.length > 0 ? (
            <>
              <ObservedInline
                label="Net observed value"
                figure={status.net}
                show={(v) => formatUsd(v)}
              />
              <ObservedInline
                label="Observed ROI"
                figure={status.roi}
                show={(v) => `${(v * 100).toFixed(0)}%`}
              />
              <ObservedInline
                label="Observed payback"
                figure={status.payback}
                show={(v) => `${v.toFixed(1)} months`}
              />
            </>
          ) : (
            <p className="text-sm text-muted sm:col-span-3">
              Not yet observed. Every figure on this tab starts as an app default; enter your own
              review hours, costs and recoveries below, or add an item to the evidence register, and
              the net value, return and payback appear here once the figures behind them are yours.
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
              Verified evidence observed in the last twelve months totals{" "}
              {formatUsd(evidenceSummary.recoveries)}; the value assumption is{" "}
              {formatUsd(inputs.directRecoveries)}.
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
              Verified evidence observed in the last twelve months totals{" "}
              {evidenceSummary.hours.toLocaleString()} annual hours; the value case calculates{" "}
              {value.observed.hoursSaved.toLocaleString()}.
            </p>
          </div>
          <button
            type="button"
            disabled={inputs.annualReviews === 0}
            onClick={() => {
              setTyped((current) =>
                current.includes("reviewHoursAfter") ? current : [...current, "reviewHoursAfter"],
              );
              setInputs(applyVerifiedAnnualHours(inputs, evidenceSummary.hours));
            }}
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
              Figures marked app default are the app&apos;s starting figures, not measured results;
              replace each one with your own where you have it. Values save in this browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Hours per review — before"
              value={inputs.reviewHoursBefore}
              appDefault={isDefault("reviewHoursBefore")}
              onChange={(v) => update("reviewHoursBefore", v)}
            />
            <Field
              label="Hours per review — with Precog"
              value={inputs.reviewHoursAfter}
              appDefault={isDefault("reviewHoursAfter")}
              onChange={(v) => update("reviewHoursAfter", v)}
            />
            <Field
              label="Loaded hourly cost"
              value={inputs.hourlyCost}
              prefix="$"
              appDefault={isDefault("hourlyCost")}
              onChange={(v) => update("hourlyCost", v)}
            />
            <Field
              label="Reviews per year"
              value={inputs.annualReviews}
              appDefault={isDefault("annualReviews")}
              onChange={(v) => update("annualReviews", v)}
            />
            <Field
              label="Documented recoveries"
              value={inputs.directRecoveries}
              prefix="$"
              appDefault={isDefault("directRecoveries")}
              onChange={(v) => update("directRecoveries", v)}
            />
            <Field
              label="Annual program cost"
              value={inputs.annualProgramCost}
              prefix="$"
              appDefault={isDefault("annualProgramCost")}
              onChange={(v) => update("annualProgramCost", v)}
            />
            <Field
              label="Annual loss exposure"
              value={inputs.annualExposure}
              prefix="$"
              appDefault={isDefault("annualExposure")}
              onChange={(v) => update("annualExposure", v)}
            />
            <Field
              label="Baseline event probability"
              value={inputs.eventProbability * 100}
              suffix="%"
              step={0.1}
              appDefault={isDefault("eventProbability")}
              onChange={(v) => update("eventProbability", v / 100)}
            />
            <Field
              label="Estimated control reduction"
              value={inputs.controlEffectiveness * 100}
              suffix="%"
              step={1}
              appDefault={isDefault("controlEffectiveness")}
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
  appDefault = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  appDefault?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-muted">
        {label}
        {appDefault && (
          <span className="rounded border border-border px-1.5 py-0.5 text-xs font-normal text-subtle">
            app default
          </span>
        )}
      </span>
      <span className="flex items-center rounded-lg border border-border bg-elevated px-3 focus-within:border-primary/60">
        {prefix && <span className="text-sm text-subtle">{prefix}</span>}
        <input
          className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm tabular"
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
        <p className="mt-1 text-xs text-subtle">{note}</p>
      </CardContent>
    </Card>
  );
}

const NOT_YET = "Not yet observed";

/** The note under an observed figure, naming any app default it still uses. */
function usesDefaults(figure: ObservedFigure, plain: string): string {
  return figure.defaultsUsed.length
    ? `${plain}; uses the app default for ${inputList(figure.defaultsUsed)}`
    : plain;
}

function ObservedInline({
  label,
  figure,
  show,
}: {
  label: string;
  figure: ObservedFigure;
  show: (value: number) => string;
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular">
        {figure.observed && figure.value !== null ? show(figure.value) : NOT_YET}
      </p>
      {figure.observed && figure.defaultsUsed.length > 0 && (
        <p className="mt-0.5 text-xs text-subtle">
          Uses the app default for {inputList(figure.defaultsUsed)}
        </p>
      )}
      {!figure.observed && figure.missing.length > 0 && (
        <p className="mt-0.5 text-xs text-subtle">Enter {inputList(figure.missing)}</p>
      )}
    </div>
  );
}
