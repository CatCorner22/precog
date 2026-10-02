import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Calculator,
  CheckCircle2,
  Circle,
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
  MODELED_RANGE_NOTE,
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
  modeledTileValues,
} from "@/lib/precog/value-case";
import {
  evidenceChecklist,
  hoursCheck,
  observedValueParts,
  recoveryCheck,
} from "@/lib/precog/value-proof-checks";
import { formatUsd, formatPct } from "@/lib/utils";
import { ValueEvidenceRegister } from "./value-evidence-register";
import {
  normalizeValueEvidence,
  summarizeValueEvidence,
  type ValueEvidence,
} from "@/lib/precog/value-evidence";
import { readValueProof, writeValueProof } from "@/lib/precog/value-proof-store";
import { useWorkspace } from "@/lib/precog/workspace-context";
import { usePracticeState } from "@/lib/precog/practice-context";
import { downloadText } from "@/lib/download";
import { localDateKey } from "@/lib/precog/dates";
import { DEFAULT_BUSINESS_ID } from "@/lib/precog/business-id";

const NOT_YET = "Not yet observed";

export function ValueProofCenter() {
  const workspace = useWorkspace();
  const { profile } = usePracticeState();
  const businessId = profile.businessId ?? DEFAULT_BUSINESS_ID;
  const [inputs, setInputs] = useState<ValueCaseInputs>(DEFAULT_VALUE_CASE);
  // Inputs the owner typed into, so a figure they enter that happens to equal
  // the app default still counts as theirs.
  const [typed, setTyped] = useState<ValueInputKey[]>([]);
  // The business whose figures are on screen; nothing is saved until they
  // are, so one business's figures never land under another's.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  // True once the owner changes a figure or the register. Until then nothing
  // is written, so the app's defaults are never stored as the owner's figures.
  const [dirty, setDirty] = useState(false);
  const [evidence, setEvidence] = useState<ValueEvidence[]>([]);
  // False once the browser refuses a write (blocked site data, full quota):
  // the figures still work here, but only until this tab closes.
  const [kept, setKept] = useState(true);
  useEffect(() => {
    // Each business has its own figures; a business with none starts from the
    // defaults. A stored value that is unreadable or malformed is ignored.
    const stored = readValueProof(businessId, workspace.local);
    const storedCase =
      stored.valueCase && typeof stored.valueCase === "object"
        ? (stored.valueCase as Partial<ValueCaseInputs> & { entered?: unknown })
        : null;
    setInputs(storedCase ? normalizeValueCase(storedCase) : DEFAULT_VALUE_CASE);
    setTyped(normalizeEnteredInputs(storedCase?.entered));
    setEvidence(normalizeValueEvidence(stored.evidence));
    setDirty(false);
    setLoadedFor(businessId);
  }, [businessId, workspace.local]);
  useEffect(() => {
    // A restored snapshot has already written its figures; show them.
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
    if (loadedFor !== businessId || !dirty) return;
    setKept(
      writeValueProof(
        businessId,
        { valueCase: { ...inputs, entered: typed }, evidence },
        workspace.local,
      ),
    );
  }, [inputs, typed, evidence, loadedFor, businessId, workspace.local, dirty]);
  const value = useMemo(() => calculateValueCase(inputs), [inputs]);
  const status = useMemo(() => observedValueStatus(inputs, typed), [inputs, typed]);
  const isDefault = (key: ValueInputKey) => !status.entered.has(key);
  const modeledTiles = useMemo(() => modeledTileValues(inputs, typed), [inputs, typed]);
  const evidenceSummary = useMemo(() => summarizeValueEvidence(evidence), [evidence]);
  const hours = hoursCheck(evidenceSummary.hours, inputs);
  const recoveries = recoveryCheck(evidenceSummary.recoveries, inputs.directRecoveries);
  const checklist = evidenceChecklist({ hoursObserved: status.hours.observed, evidence, profile });
  const modeledTop = Math.max(value.modeled.high, 1);
  /** Sets one figure as the owner's own and returns what was kept after the input's limits. */
  const update = (key: ValueInputKey, next: number): number => {
    const result = normalizeValueCase({ ...inputs, [key]: next })[key];
    setTyped((current) => (current.includes(key) ? current : [...current, key]));
    setInputs((current) => normalizeValueCase({ ...current, [key]: next }));
    setDirty(true);
    return result;
  };
  const exportMemo = () => {
    downloadText(
      `precog-value-case-${localDateKey(new Date())}.md`,
      createValueCaseMemo(inputs, new Date(), evidence, typed),
      "text/markdown;charset=utf-8",
    );
  };

  return (
    <div className="space-y-5">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <Badge variant="accent">Value proof</Badge>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold">
            What Precog has returned so far, and what it might prevent
          </h1>
          <button
            type="button"
            onClick={exportMemo}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-xs font-medium hover:border-border-strong"
          >
            <Download className="size-4" aria-hidden />
            Export executive memo
          </button>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Two kinds of figure. What you observed: hours returned and money recovered. What the model
          estimates: loss avoided. Report the second as a scenario, never as savings.
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
          label="Hours returned per year"
          value={
            status.hours.observed ? `${value.observed.hoursSaved.toLocaleString()} hrs` : NOT_YET
          }
          note={
            status.hours.observed
              ? usesDefaults(status.hours, "Your review hours × reviews per year")
              : `Precog default assumption: ${value.observed.hoursSaved.toLocaleString()} hrs (${inputs.reviewHoursBefore} → ${inputs.reviewHoursAfter} hrs × ${inputs.annualReviews} reviews). Enter your own review hours.`
          }
        />
        <Metric
          icon={DollarSign}
          label="Observed value"
          value={status.value.observed ? formatUsd(status.value.value ?? 0) : NOT_YET}
          note={
            status.value.observed
              ? usesDefaults(status.value, observedValueParts(inputs, typed))
              : `Precog default assumption: ${formatUsd(value.observed.total)} of time returned. Enter your review hours and hourly cost, or cash recovered.`
          }
        />
        <Metric
          icon={ShieldCheck}
          label="Modeled risk reduction"
          value={modeledTiles.riskReduction}
          note={
            modeledTiles.entered
              ? "Scenario, not realized savings"
              : "Scenario, not realized savings. Enter the money at risk or the event probability below."
          }
          warning
        />
        <Metric
          icon={Calculator}
          label="Assumed loss baseline"
          value={modeledTiles.lossBaseline}
          note={
            modeledTiles.entered
              ? `${isDefault("annualExposure") ? "Precog default exposure" : "Your exposure"} × ${isDefault("eventProbability") ? "Precog default probability" : "your probability assumption"}`
              : "Your exposure × your probability, once you enter either"
          }
          warning
        />
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          {status.anyObservation || evidence.length > 0 ? (
            <>
              <ObservedInline
                label="Net observed value"
                figure={status.net}
                show={(v) => formatUsd(v)}
              />
              <ObservedInline
                label="Cash-only ROI"
                figure={status.cashRoi}
                show={(v) => formatPct(v)}
              />
              <ObservedInline
                label="ROI including time"
                figure={status.roi}
                show={(v) => formatPct(v)}
              />
              <ObservedInline
                label="Observed payback"
                figure={status.payback}
                show={(v) => `${v.toFixed(1)} months`}
              />
            </>
          ) : (
            <p className="text-sm text-muted sm:col-span-2 lg:col-span-4">
              Not yet observed. Every figure on this tab starts as a Precog default; enter your own
              review hours, costs and money recovered below, or add an item to the evidence
              register, and the net value, return and payback appear here once the figures behind
              them are yours.
            </p>
          )}
        </CardContent>
      </Card>

      <ValueEvidenceRegister
        items={evidence}
        onChange={(items) => {
          setEvidence(normalizeValueEvidence(items));
          setDirty(true);
        }}
      />

      {recoveries.kind === "unbacked" && (
        <Notice title="No verified item backs the money recovered">
          You entered {formatUsd(inputs.directRecoveries)} of money recovered. Add the recovery to
          the evidence register with its source and date, and mark it verified.
        </Notice>
      )}
      {recoveries.kind === "differs" && (
        <Notice
          title="Money recovered does not match the evidence register"
          action={{
            label: "Use verified total",
            onClick: () => update("directRecoveries", evidenceSummary.recoveries),
          }}
        >
          Verified money recovered in the last twelve months totals{" "}
          {formatUsd(evidenceSummary.recoveries)}; the value case uses{" "}
          {formatUsd(inputs.directRecoveries)}.
        </Notice>
      )}

      {hours.kind !== "match" && (
        <Notice
          title="Hours returned per year do not match the evidence register"
          action={
            hours.kind === "apply"
              ? {
                  label: "Use verified hours",
                  onClick: () => {
                    setTyped((current) =>
                      current.includes("reviewHoursAfter")
                        ? current
                        : [...current, "reviewHoursAfter"],
                    );
                    setInputs(applyVerifiedAnnualHours(inputs, evidenceSummary.hours));
                    setDirty(true);
                  },
                }
              : undefined
          }
        >
          Verified hours in the last twelve months total{" "}
          {Math.round(evidenceSummary.hours).toLocaleString()}; the value case calculates{" "}
          {Math.round(value.observed.hoursSaved).toLocaleString()}.
          {hours.kind === "no-reviews" && " Set reviews per year first."}
          {hours.kind === "unreachable" &&
            ` That is more than your review figures allow (${Math.round(hours.most).toLocaleString()} hours: hours per review before × reviews per year); raise one of them first.`}
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Value assumptions</CardTitle>
            <CardDescription>
              Figures marked Precog default are Precog&apos;s starting figures, not measured
              results; replace each one with your own where you have it. Values save in this
              browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Hours per review — before"
              value={inputs.reviewHoursBefore}
              appDefault={isDefault("reviewHoursBefore")}
              onCommit={(v) => update("reviewHoursBefore", v)}
            />
            <Field
              label="Hours per review — with Precog"
              value={inputs.reviewHoursAfter}
              appDefault={isDefault("reviewHoursAfter")}
              onCommit={(v) => update("reviewHoursAfter", v)}
            />
            <Field
              label="Hourly cost (wages plus benefits)"
              value={inputs.hourlyCost}
              prefix="$"
              appDefault={isDefault("hourlyCost")}
              onCommit={(v) => update("hourlyCost", v)}
            />
            <Field
              label="Reviews per year"
              value={inputs.annualReviews}
              appDefault={isDefault("annualReviews")}
              onCommit={(v) => update("annualReviews", v)}
            />
            <Field
              label="Money recovered (documented)"
              value={inputs.directRecoveries}
              prefix="$"
              appDefault={isDefault("directRecoveries")}
              onCommit={(v) => update("directRecoveries", v)}
            />
            <Field
              label="What you pay for Precog and the review time each year"
              value={inputs.annualProgramCost}
              prefix="$"
              appDefault={isDefault("annualProgramCost")}
              onCommit={(v) => update("annualProgramCost", v)}
            />
            <Field
              label="Money at risk in a year if a scheme ran"
              value={inputs.annualExposure}
              prefix="$"
              appDefault={isDefault("annualExposure")}
              onCommit={(v) => update("annualExposure", v)}
            />
            <Field
              label="Baseline event probability"
              value={inputs.eventProbability * 100}
              suffix="%"
              step={0.1}
              appDefault={isDefault("eventProbability")}
              onCommit={(v) => update("eventProbability", v / 100) * 100}
            />
            <Field
              label="Estimated control reduction"
              value={inputs.controlEffectiveness * 100}
              suffix="%"
              step={1}
              appDefault={isDefault("controlEffectiveness")}
              onCommit={(v) => update("controlEffectiveness", v / 100) * 100}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Modeled range</CardTitle>
              <CardDescription>{MODELED_RANGE_NOTE}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(
                [
                  ["Low", value.modeled.low],
                  ["Base", value.modeled.base],
                  ["High", value.modeled.high],
                ] as const
              ).map(([label, amount]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted">{label}</span>
                    <span className="font-semibold tabular">{formatUsd(amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-elevated" aria-hidden>
                    <div
                      className="h-full rounded-full bg-warn"
                      style={{ width: `${(amount / modeledTop) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="flex gap-2 rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs leading-relaxed text-muted">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <p>
                  Do not add this modeled range to observed value. Validate exposure, probability,
                  and effectiveness independently.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Evidence checklist</CardTitle>
              <CardDescription>
                Each line turns green once your own records show it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {checklist.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-start gap-2 rounded-lg border border-border bg-elevated p-2.5 text-xs"
                  >
                    {item.done ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                    ) : (
                      <Circle className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
                    )}
                    <span>
                      {item.label}
                      <span className="sr-only">{item.done ? ": done" : ": not yet"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
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
          <Icon className={`size-4 ${warning ? "text-warn" : "text-primary"}`} aria-hidden />
        </div>
        <p className="mt-2 text-2xl font-semibold tabular">{value}</p>
        <p className="mt-1 text-xs text-subtle">{note}</p>
      </CardContent>
    </Card>
  );
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
          Uses the Precog default for {inputList(figure.defaultsUsed)}
        </p>
      )}
      {!figure.observed && figure.missing.length > 0 && (
        <p className="mt-0.5 text-xs text-subtle">Enter {inputList(figure.missing)}</p>
      )}
    </div>
  );
}

/** A warning strip between the register and the assumptions, with an optional fix. */
function Notice({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm">
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{children}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-lg border border-warn/40 bg-bg px-3 py-2 text-xs font-medium text-warn hover:bg-warn/10"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * A number input that keeps what the owner types until they leave the field
 * or press Enter, so clearing it to retype does not snap it to 0. An empty
 * field goes back to the saved figure. `onCommit` returns the figure kept
 * after the input's limits, and the field says so when that differs.
 */
function Field({
  label,
  value,
  onCommit,
  prefix,
  suffix,
  step = 1,
  appDefault = false,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => number;
  prefix?: string;
  suffix?: string;
  step?: number;
  appDefault?: boolean;
}) {
  const shown = String(Number(value.toFixed(2)));
  const [text, setText] = useState<string | null>(null);
  const [limited, setLimited] = useState<{ kept: number; over: boolean } | null>(null);
  function commit() {
    if (text === null) return;
    const typedNumber = Number(text);
    setText(null);
    if (text.trim() === "" || !Number.isFinite(typedNumber)) return;
    const kept = onCommit(typedNumber);
    setLimited(Math.abs(kept - typedNumber) > 1e-6 ? { kept, over: typedNumber > kept } : null);
  }
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-muted">
        {label}
        {appDefault && (
          <span className="rounded border border-border px-1.5 py-0.5 text-xs font-normal text-subtle">
            Precog default
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
          value={text ?? shown}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") setText(null);
          }}
        />
        {suffix && <span className="text-sm text-subtle">{suffix}</span>}
      </span>
      {limited && (
        <span className="mt-1 block text-xs text-warn" role="status">
          Kept at {prefix ?? ""}
          {Number(limited.kept.toFixed(2)).toLocaleString("en-US")}
          {suffix ?? ""}, the {limited.over ? "most" : "least"} this figure accepts.
        </span>
      )}
    </label>
  );
}

/** The note under an observed figure, naming any app default it still uses. */
function usesDefaults(figure: ObservedFigure, plain: string): string {
  return figure.defaultsUsed.length
    ? `${plain}; uses the Precog default for ${inputList(figure.defaultsUsed)}`
    : plain;
}
