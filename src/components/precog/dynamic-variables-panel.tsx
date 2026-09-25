import { useEffect, useState } from "react";
import {
  readInsurance, withInsurance, type RiskVariableState,
} from "@/lib/precog/scoring/dynamic-variables";
import {
  enteredFact, modelInsuranceScenario, newPolicy, TERM_LABELS,
  type Applicability, type CoverageKind, type FactSource, type InsurancePolicy,
  type InsuranceStatus, type NumericFact, type TermKey,
} from "@/lib/precog/insurance/model";
import { insuranceReviewMarkdown } from "@/lib/precog/insurance/report";
import { useTemplate } from "@/lib/precog/use-template";
import { usePractice } from "@/lib/precog/practice-context";
import type { PrecogResult } from "@/lib/precog/types";

const field = "w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg";
const button = "rounded border border-border px-3 py-2 text-sm disabled:opacity-50";
const dollars = (value: number | null) => value === null ? "Not established" : value.toLocaleString("en-US", { style: "currency", currency: "USD" });
const COVERAGE_LABELS: Record<CoverageKind, string> = {
  employee_theft: "Employee theft / dishonesty", funds_transfer: "Funds transfer / computer fraud",
  social_engineering: "Social engineering", cyber: "Cyber", business_interruption: "Business interruption",
  property: "Property", professional_liability: "Professional liability", key_person: "Key person", other: "Other",
};

/** Commit on blur, keeping typing local instead of re-scoring the business per keystroke. */
function TermEditor({ name, fact, onChange }: { name: TermKey; fact: NumericFact; onChange: (fact: NumericFact) => void }) {
  const [draft, setDraft] = useState(fact.value === null ? "" : String(fact.value));
  const [error, setError] = useState("");
  useEffect(() => { setDraft(fact.value === null ? "" : String(fact.value)); }, [fact.value]);
  function commit() {
    const value = draft.trim() === "" ? null : Number(draft);
    const max = name.endsWith("Pct") ? 100 : name === "paymentDelayDays" ? 3650 : 1_000_000_000;
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > max)) {
      setError(`Enter a number from 0 to ${max}, or leave unknown.`);
      return;
    }
    setError("");
    if (value !== fact.value) onChange(enteredFact(value, fact.reference, fact.source === "unverified" || fact.source === "sample" ? "owner_entered" : fact.source));
  }
  return (
    <div className="space-y-1">
      <label className="block text-sm" htmlFor={`insurance-${name}`}>{TERM_LABELS[name]}</label>
      <input id={`insurance-${name}`} className={field} inputMode="decimal" value={draft} placeholder="Unknown" onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-invalid={Boolean(error)} />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <details className="text-xs text-muted">
        <summary>Source: {fact.source.replaceAll("_", " ")}{fact.recordedOn ? ` · ${fact.recordedOn}` : ""}</summary>
        <select className={field} aria-label={`Source for ${TERM_LABELS[name]}`} value={fact.source} onChange={(event) => onChange({ ...fact, source: event.target.value as FactSource })}>
          <option value="unverified">Unverified</option>
          <option value="owner_entered">Owner entered</option>
          <option value="document_referenced">Document referenced</option>
          <option value="broker_review_recorded">Broker review recorded by owner</option>
          {fact.source === "sample" && <option value="sample">Application sample</option>}
        </select>
        <input className={field} aria-label={`Reference for ${TERM_LABELS[name]}`} value={fact.reference} placeholder="Document / page / quote reference" maxLength={500} onChange={(event) => onChange({ ...fact, reference: event.target.value })} />
      </details>
    </div>
  );
}

export function DynamicVariablesPanel({ value, onChange, result, ownBusiness = false }: {
  value: RiskVariableState;
  onChange: (next: RiskVariableState) => void;
  result?: PrecogResult | null;
  ownBusiness?: boolean;
}) {
  const template = useTemplate();
  const { profile } = usePractice();
  const state = readInsurance(value);
  const policy = state.policies.find((p) => p.id === state.selectedPolicyId);
  const [scenarioId, setScenarioId] = useState(result?.scenarioId ?? template.scenarios[0]?.id ?? "");
  const [loss, setLoss] = useState<number | null>(null);
  useEffect(() => { if (result?.scenarioId) { setScenarioId(result.scenarioId); setLoss(null); } }, [result?.scenarioId]);
  const scenario = template.scenarios.find((s) => s.id === scenarioId) ?? template.scenarios[0];
  const gross = loss ?? (result?.scenarioId === scenario?.id ? result.financialImpact.expected : null);
  const modeled = scenario && gross !== null ? modelInsuranceScenario(state, scenario.id, gross) : null;
  const save = (next: typeof state) => onChange(withInsurance(value, next));
  const patch = (next: Partial<InsurancePolicy>) => {
    if (!policy) return;
    save({ ...state, policies: state.policies.map((p) => p.id === policy.id ? { ...p, ...next } : p) });
  };
  function exportPacket() {
    const content = insuranceReviewMarkdown(profile.practiceName, state, template.scenarios);
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "precog-insurance-broker-review.md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="space-y-5" aria-label="Business insurance review">
      <header className="rounded-xl border border-border bg-panel p-5">
        <h2 className="text-xl font-semibold">Business insurance review</h2>
        <p className="my-2 text-sm text-muted">Your business's coverage, not patient claims. Unknown coverage is not the same as no insurance. Every recovery is conditional; this tool does not interpret policies or decide claims.</p>
        {!ownBusiness && <p className="mb-3 text-sm text-warn">You are reviewing a sample business. Do not treat its figures as your policy.</p>}
        <label className="block text-sm" htmlFor="insurance-information-status">Information status</label>
        <select id="insurance-information-status" className={field} value={state.status} onChange={(event) => save({ ...state, status: event.target.value as InsuranceStatus })}>
          <option value="not_assessed">Not assessed</option>
          <option value="none_reported">Owner reports no applicable policy</option>
          <option value="reported_incomplete">Policy reported; details incomplete</option>
          <option value="terms_entered">Policy terms entered for review</option>
        </select>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={button} disabled={state.policies.length >= 20} onClick={() => {
            const added = newPolicy(`policy-${crypto.randomUUID()}`);
            save({ ...state, status: "reported_incomplete", policies: [...state.policies, added], selectedPolicyId: added.id });
          }}>Add policy</button>
          <button type="button" className={button} onClick={exportPacket}>Export broker review</button>
        </div>
      </header>
      {state.policies.length > 0 && <div className="rounded-xl border border-border bg-panel p-5 space-y-4">
        <label className="block text-sm">Policy for this stand-alone comparison
          <select className={field} value={state.selectedPolicyId ?? ""} onChange={(event) => save({ ...state, selectedPolicyId: event.target.value || null })}>
            <option value="">Choose a policy; do not combine recoveries</option>
            {state.policies.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        {policy && <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Policy label<input className={field} value={policy.label} maxLength={100} onChange={(event) => patch({ label: event.target.value })} /></label>
            <label className="text-sm">Coverage category<select className={field} value={policy.kind} onChange={(event) => patch({ kind: event.target.value as CoverageKind })}>{Object.entries(COVERAGE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label className="text-sm">Carrier recorded<input className={field} value={policy.carrier} maxLength={100} onChange={(event) => patch({ carrier: event.target.value })} /></label>
            <label className="text-sm">Policy / document reference<input className={field} value={policy.policyReference} maxLength={200} onChange={(event) => patch({ policyReference: event.target.value })} /></label>
            <label className="text-sm">Policy starts<input type="date" className={field} value={policy.effectiveFrom ?? ""} onChange={(event) => patch({ effectiveFrom: event.target.value || null })} /></label>
            <label className="text-sm">Policy ends<input type="date" className={field} value={policy.effectiveTo ?? ""} onChange={(event) => patch({ effectiveTo: event.target.value || null })} /></label>
            <label className="text-sm">Trigger recorded<select className={field} value={policy.trigger} onChange={(event) => patch({ trigger: event.target.value as InsurancePolicy["trigger"] })}>{["unknown", "loss_sustained", "discovery", "claims_made", "occurrence"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
            <label className="text-sm">Limit basis<select className={field} value={policy.limitBasis} onChange={(event) => patch({ limitBasis: event.target.value as InsurancePolicy["limitBasis"] })}><option value="unknown">Unknown</option><option value="per_event">Per event</option><option value="annual_aggregate">Annual aggregate</option></select></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["premiumAnnual", "deductible", "insurerPaymentLimit", "unreimbursedPct"] as TermKey[]).map((key) => <TermEditor key={`${policy.id}:${key}`} name={key} fact={policy.terms[key]} onChange={(fact) => patch({ terms: { ...policy.terms, [key]: fact } })} />)}
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Sublimits, aggregate, quote credits, and other conditions</summary>
            <div className="my-3 grid gap-4 sm:grid-cols-2">
              {(["sublimit", "aggregateLimit", "aggregateRemaining", "premiumCreditPct", "paymentDelayDays"] as TermKey[]).map((key) => <TermEditor key={`${policy.id}:${key}`} name={key} fact={policy.terms[key]} onChange={(fact) => patch({ terms: { ...policy.terms, [key]: fact } })} />)}
              <label className="text-sm">Premium basis<select className={field} value={policy.premiumBasis} onChange={(event) => patch({ premiumBasis: event.target.value as InsurancePolicy["premiumBasis"] })}><option value="quoted_net">Net quote; do not discount again</option><option value="base_before_quoted_credit">Base before the recorded quote credit</option></select></label>
            </div>
            {(["conditions", "exclusions", "reportingRequirements", "waitingPeriod"] as const).map((key) => <label key={key} className="my-2 block text-sm">{key === "reportingRequirements" ? "Reporting requirements" : key === "waitingPeriod" ? "Waiting period" : key}<textarea className={field} value={policy[key]} maxLength={2000} onChange={(event) => patch({ [key]: event.target.value })} /></label>)}
          </details>
          <details className="text-sm text-muted"><summary>Older numeric entries retained for review</summary><p>Old premium {dollars(value.basePremiumAnnual)}, deductible {dollars(value.deductible)}, and limit {dollars(value.policyLimit)} remain in the saved record. They are not confirmed policy facts, even when they differ from old defaults. Enter and source the applicable terms above.</p></details>
        </>}
      </div>}
      <div className="rounded-xl border border-border bg-panel p-5 space-y-3">
        <h3 className="font-semibold">Conditional scenario illustration</h3>
        <label className="block text-sm">Scenario<select className={field} value={scenario?.id ?? ""} onChange={(event) => { setScenarioId(event.target.value); setLoss(null); }}>{template.scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        {policy && scenario && <label className="block text-sm">Applicability recorded for this scenario<select className={field} value={policy.scenarios[scenario.id] ?? "unknown"} onChange={(event) => patch({ scenarios: { ...policy.scenarios, [scenario.id]: event.target.value as Applicability } })}><option value="unknown">Unknown; ask the broker</option><option value="assumed_covered">Assume applicable solely for this illustration</option><option value="excluded">Owner has recorded an exclusion</option></select></label>}
        <label className="block text-sm">Illustrative loss (USD)<input className={field} type="number" min={0} max={1000000000} value={gross ?? ""} placeholder="Enter an assumption, not a forecast" onChange={(event) => setLoss(event.target.value === "" ? null : Math.max(0, Math.min(1000000000, event.target.valueAsNumber || 0)))} /></label>
        <details className="text-sm"><summary>Optional annual-frequency assumption</summary><label className="block">Percentage of years with one such event<input className={field} type="number" min={0} max={100} value={state.annualFrequencyPct ?? ""} onChange={(event) => save({ ...state, annualFrequencyPct: event.target.value === "" ? null : event.target.valueAsNumber })} /></label><label className="block">Basis / source of the assumption<input className={field} value={state.annualFrequencySource} maxLength={500} onChange={(event) => save({ ...state, annualFrequencySource: event.target.value })} /></label><p>This is a scenario assumption, not a measured probability. Multiple events and other annual losses are not modeled.</p></details>
        {modeled ? <>
          <p className="text-sm font-medium" role="status">Status: {modeled.status.replaceAll("_", " ")}</p>
          <dl className="grid gap-3 sm:grid-cols-2"><div><dt>Gross assumed loss</dt><dd>{dollars(modeled.gross)}</dd></div><div><dt>Potential recovery, conditional</dt><dd>{dollars(modeled.potentialRecovery)}</dd></div><div><dt>Retained if assumptions hold</dt><dd>{dollars(modeled.retainedIfAssumptionsHold)}</dd></div><div><dt>Annual cost under entered assumption</dt><dd>{dollars(modeled.annualCostOfRisk)}</dd></div></dl>
          {modeled.notes.map((note) => <p key={note} className="text-xs text-muted">{note}</p>)}
        </> : <p className="text-sm text-muted">Enter an illustrative loss to calculate. Missing coverage information stays unknown.</p>}
      </div>
      <details className="rounded-xl border border-border bg-panel p-5">
        <summary className="cursor-pointer font-semibold">Operational controls — separate from insurance</summary>
        <p className="my-2 text-sm text-muted">These controls affect the application's operational scenarios. They do not generate carrier discounts. Numerical effects remain modeling assumptions.</p>
        {([ ["hasSecurityCameras", "Cameras covering relevant cash areas"], ["hasDualControl", "Dual control on payments"], ["hasIndependentBankRec", "Independent bank reconciliation"], ["hasAlarmAccess", "Alarm / access control"] ] as const).map(([key, label]) => <label key={key} className="my-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} />{label}</label>)}
      </details>
    </section>
  );
}
