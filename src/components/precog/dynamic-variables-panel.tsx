import { useEffect, useState } from "react";
import { InsuranceRecordPanel } from "./insurance-record-panel";
import { POLICY_FIELDS, normalizeInsuranceRecord } from "@/lib/precog/scoring/insurance-record";
import {
  APP_DEFAULT_POLICY,
  DEFAULT_RISK_VARIABLES,
  VARIABLE_CATALOG,
  assumedAnnualFrequency,
  insuranceBasis,
  insuranceFigureNote,
  policyFieldIsDefault,
  type PolicyField,
  type RiskVariableState,
} from "@/lib/precog/scoring/dynamic-variables";
import type { PrecogResult } from "@/lib/precog/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd, cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

export function DynamicVariablesPanel({
  value,
  onChange,
  result,
  ownBusiness = false,
}: {
  value: RiskVariableState;
  onChange: (next: RiskVariableState) => void;
  result?: PrecogResult | null;
  /** Real business versus demonstration; unknown coverage is never labeled uninsured. */
  ownBusiness?: boolean;
}) {
  function setNum<K extends keyof RiskVariableState>(key: K, n: number) {
    if (!Number.isFinite(n) || value[key] === n) return;
    const insurance = normalizeInsuranceRecord(value.insurance);
    onChange({
      ...value,
      [key]: n,
      ...(insurance && (POLICY_FIELDS as readonly string[]).includes(key)
        ? {
            insurance: {
              ...insurance,
              confirmedFields: insurance.confirmedFields.filter((field) => field !== key),
              modeledScenarioIds: [],
            },
          }
        : {}),
    });
  }
  function setBool<K extends keyof RiskVariableState>(key: K, b: boolean) {
    onChange({ ...value, [key]: b });
  }

  const d = result?.dynamic;
  const basis = insuranceBasis(value, ownBusiness);
  const note = insuranceFigureNote(value, ownBusiness, result?.scenarioId);
  const hint = (text: string) => (note ? `${text} · ${note}` : text);
  const isDefault = (key: PolicyField) => policyFieldIsDefault(value, key);
  const frequency = d
    ? `${(assumedAnnualFrequency(d.likelihoodMultiplier) * 100).toFixed(1)}%`
    : "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Dynamic risk variables</CardTitle>
              <CardDescription>
                Change policy terms or operational controls. Insurance finances a loss; it does not
                automatically change its likelihood (educational model, not a quote).
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onChange({ ...DEFAULT_RISK_VARIABLES })}
            >
              <RefreshCw className="size-3.5" />
              Reset to app defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {d && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Mini
                label="Likelihood ×"
                value={d.likelihoodMultiplier.toFixed(2)}
                hint="vs base opportunity"
              />
              <Mini
                label="Gross severity ×"
                value={d.grossSeverityMultiplier.toFixed(2)}
                hint="before insurance"
              />
              <Mini
                label="Detection lag ×"
                value={d.detectionLagMultiplier.toFixed(2)}
                hint="timeline pressure"
              />
              <Mini
                label="Modeled premium / yr"
                value={formatUsd(d.premiumAnnualNet)}
                hint={hint(
                  basis === "none"
                    ? "reported no policy"
                    : `modeled from confirmed terms; −${d.discountPctApplied}% credits`,
                )}
              />
              <Mini
                label="Assumed loss if it happens"
                value={formatUsd(d.grossExpected)}
                hint="before retention"
              />
              <Mini
                label="Assumed retained loss"
                value={formatUsd(d.retainedExpected)}
                hint={hint(
                  basis === "none"
                    ? "all of it"
                    : `transferred ${formatUsd(d.transferredExpected)}`,
                )}
              />
              <Mini
                label="Annual cost of risk"
                value={formatUsd(d.expectedAnnualCostOfRisk)}
                hint={hint(
                  basis === "none"
                    ? `retained loss × assumed ${frequency} chance a year`
                    : `premium + retained loss × assumed ${frequency} chance a year`,
                )}
              />
              <Mini
                label="Event + 1yr premium"
                value={formatUsd(d.eventPlusPremiumExpected)}
                hint={hint("retained loss of one event plus a year of premium")}
              />
            </div>
          )}

          <InsuranceRecordPanel value={value} onChange={onChange} scenarioId={result?.scenarioId} />
          <p className="rounded-lg border border-border bg-panel p-3 text-xs leading-relaxed text-muted">
            {basis === "app_default"
              ? `The sample uses an illustrative policy (${APP_DEFAULT_POLICY}).`
              : note}
          </p>
          <Section title="Insurance transfer">
            <CurrencyField
              label="Base annual premium"
              value={value.basePremiumAnnual}
              onChange={(n) => setNum("basePremiumAnnual", n)}
              min={0}
              max={50000}
              step={100}
              appDefault={isDefault("basePremiumAnnual")}
            />
            <CurrencyField
              label="Deductible"
              value={value.deductible}
              onChange={(n) => setNum("deductible", n)}
              min={0}
              max={100000}
              step={500}
              appDefault={isDefault("deductible")}
            />
            <CurrencyField
              label="Policy limit"
              value={value.policyLimit}
              onChange={(n) => setNum("policyLimit", n)}
              min={0}
              max={1000000}
              step={5000}
              appDefault={isDefault("policyLimit")}
            />
            <PercentField
              label="Unreimbursed share above deductible"
              value={value.coinsurancePct}
              onChange={(n) => setNum("coinsurancePct", n)}
              max={50}
            />
            <PercentField
              label="Max stackable discount"
              value={value.maxDiscountPct}
              onChange={(n) => setNum("maxDiscountPct", n)}
              max={40}
            />
            <NumberField
              label="Claims load factor"
              value={value.claimsLoadFactor}
              onChange={(n) => setNum("claimsLoadFactor", n)}
              min={0.8}
              max={2.5}
              step={0.05}
            />
            <CurrencyField
              label="Extra underwriting load / yr"
              value={value.underwritingLoadAnnual}
              onChange={(n) => setNum("underwritingLoadAnnual", n)}
              min={0}
              max={20000}
              step={50}
            />
          </Section>

          <Section title="Controls that change likelihood & unlock discounts">
            <BoolRow
              label="Security cameras (cash / safe / front)"
              checked={value.hasSecurityCameras}
              onChange={(b) => setBool("hasSecurityCameras", b)}
              effect="↓ likelihood · faster detection · premium credit"
            />
            <PercentField
              label="Insurer discount if cameras"
              value={value.discountCamerasPct}
              onChange={(n) => setNum("discountCamerasPct", n)}
              max={20}
            />
            <BoolRow
              label="Dual control on payments / deposits"
              checked={value.hasDualControl}
              onChange={(b) => setBool("hasDualControl", b)}
              effect="↓↓ fraud likelihood · ↓ scheme size · premium credit"
            />
            <PercentField
              label="Insurer discount if dual control"
              value={value.discountDualControlPct}
              onChange={(n) => setNum("discountDualControlPct", n)}
              max={20}
            />
            <BoolRow
              label="Independent bank reconciliation"
              checked={value.hasIndependentBankRec}
              onChange={(b) => setBool("hasIndependentBankRec", b)}
              effect="↓ detection lag · ↓ cumulative severity · premium credit"
            />
            <PercentField
              label="Insurer discount if bank rec / CPA"
              value={value.discountBankRecPct}
              onChange={(n) => setNum("discountBankRecPct", n)}
              max={15}
            />
            <BoolRow
              label="Alarm / access control"
              checked={value.hasAlarmAccess}
              onChange={(b) => setBool("hasAlarmAccess", b)}
              effect="↓ external theft likelihood · premium credit"
            />
            <PercentField
              label="Insurer discount if alarm"
              value={value.discountAlarmPct}
              onChange={(n) => setNum("discountAlarmPct", n)}
              max={10}
            />
            <BoolRow
              label="Bonded / background-checked cash handlers"
              checked={value.hasBondedCashHandlers}
              onChange={(b) => setBool("hasBondedCashHandlers", b)}
              effect="↓ dishonesty likelihood · premium credit"
            />
            <PercentField
              label="Insurer discount if bonded staff"
              value={value.discountBondedStaffPct}
              onChange={(n) => setNum("discountBondedStaffPct", n)}
              max={15}
            />
            <CurrencyField
              label="Typical daily cash / card deposit"
              value={value.dailyCashExposure}
              onChange={(n) => setNum("dailyCashExposure", n)}
              min={0}
              max={50000}
              step={100}
            />
          </Section>

          {d && (
            <>
              <div>
                <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">
                  Assumptions in play
                </p>
                <p className="mb-2 text-xs leading-relaxed text-subtle">
                  Every multiplier and credit below is an assumption this app makes, listed so you
                  can judge it. None comes from a carrier, a study, or your own loss history.
                </p>
                <ul className="space-y-1.5">
                  {d.drivers.map((dr) => (
                    <li
                      key={dr.id}
                      className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{dr.label}</span>
                        <Badge variant="default">{dr.on}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{dr.effect}</p>
                    </li>
                  ))}
                  {d.drivers.length === 0 && (
                    <li className="text-sm text-muted">No control-driven modifiers active.</li>
                  )}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">
                  Premium credit stack
                </p>
                <ul className="space-y-1.5">
                  {d.discountLines.map((line) => (
                    <li
                      key={line.label}
                      className={cn(
                        "flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
                        line.active
                          ? "border-ok/30 bg-ok/10"
                          : "border-border bg-elevated opacity-70",
                      )}
                    >
                      <span>
                        <span className="font-medium">{line.label}</span>
                        <span className="mt-0.5 block text-xs text-muted">{line.reason}</span>
                      </span>
                      <Badge variant={line.active ? "ok" : "default"}>{line.pct}%</Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <ul className="space-y-1 text-xs text-subtle">
                {d.notes.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
            </>
          )}

          <details className="text-xs text-subtle">
            <summary className="cursor-pointer text-muted">Variable catalog notes</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {VARIABLE_CATALOG.slice(0, 8).map((v) => (
                <li key={v.id}>
                  <span className="text-muted">{v.label}:</span> {v.likelihoodEffect}{" "}
                  {v.severityEffect}
                </li>
              ))}
            </ul>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-3">
      <p className="text-xs tracking-wide text-subtle uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular tracking-tight">{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

function CurrencyField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  appDefault = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  appDefault?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="flex items-center justify-between gap-2 text-muted">
        {label}
        {appDefault && (
          <span className="rounded border border-border px-1.5 py-0.5 text-xs text-subtle">
            not confirmed
          </span>
        )}
      </span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={`Adjust ${label.toLowerCase()}`}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--color-primary)]"
        />
        <ExactAmount label={label} value={value} min={min} max={max} onChange={onChange} />
      </div>
    </label>
  );
}

function PercentField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  max: number;
}) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--color-primary)]"
        />
        <span className="w-12 shrink-0 text-right tabular text-xs font-medium">{value}%</span>
      </div>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--color-primary)]"
        />
        <span className="w-12 shrink-0 text-right tabular text-xs font-medium">
          {value.toFixed(2)}
        </span>
      </div>
    </label>
  );
}

function BoolRow({
  label,
  checked,
  onChange,
  effect,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
  effect: string;
}) {
  return (
    <label className="col-span-full flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5 sm:col-span-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 accent-[var(--color-primary)]"
      />
      <span>
        <span className="text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{effect}</span>
      </span>
    </label>
  );
}

/** Preserve an unfinished edit until blur/Enter; never convert an empty field to zero. */
function ExactAmount({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(String(value));
    setError("");
  }, [value]);
  function commit() {
    const number = draft.trim() ? Number(draft) : NaN;
    if (!Number.isFinite(number) || number < min || number > max) {
      setError(`Enter an amount from ${min} to ${max}.`);
      return;
    }
    const rounded = Math.round(number * 100) / 100;
    setError("");
    setDraft(String(rounded));
    onChange(rounded);
  }
  return (
    <span className="w-28 shrink-0">
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={Boolean(error)}
        min={min}
        max={max}
        step="0.01"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-full rounded border border-border bg-bg px-2 py-1 text-right text-xs tabular"
      />
      {error && (
        <span className="mt-1 block text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
