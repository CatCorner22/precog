import { GitBranch } from "lucide-react";
import type { PrecogResult, ScenarioTemplate } from "@/lib/precog/types";
import {
  insuranceBasis,
  insuranceFigureNote,
  type RiskVariableState,
} from "@/lib/precog/scoring/dynamic-variables";
import { DynamicVariablesPanel } from "@/components/precog/dynamic-variables-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatUsd } from "@/lib/utils";
import { ILLUSTRATIVE_LABEL } from "@/lib/precog/scoring/scenario-level";
import { FigureTile } from "./figure-tile";

/** The owner's saved settings and insurance, with one scenario's figures beside them. */
export function ScenarioVariablesView({
  scenarios,
  scenario,
  onPick,
  riskVariables,
  onRiskVariablesChange,
  result,
  ownBusiness,
  whatIfActive,
  onShowCascades,
}: {
  scenarios: readonly ScenarioTemplate[];
  scenario: ScenarioTemplate;
  onPick: (id: string) => void;
  riskVariables: RiskVariableState;
  onRiskVariablesChange: (next: RiskVariableState) => void;
  result: PrecogResult | null;
  ownBusiness: boolean;
  /** A staffing what-if is being tried on the scenario view; this view shows the saved staffing. */
  whatIfActive: boolean;
  onShowCascades: () => void;
}) {
  const noPolicy = insuranceBasis(riskVariables, ownBusiness) === "none";
  const policyNote = insuranceFigureNote(riskVariables, ownBusiness, scenario.id);
  const withPolicyNote = (text: string) => (policyNote ? `${text} · ${policyNote}` : text);

  return (
    <div className="space-y-4">
      <div
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        role="group"
        aria-label="Scenario for these figures"
      >
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={scenario.id === s.id}
            onClick={() => onPick(s.id)}
            className={cn(
              "rounded-xl border px-3 py-2 text-left text-sm",
              scenario.id === s.id
                ? "border-primary/50 bg-primary/10 font-medium"
                : "border-border bg-elevated",
            )}
          >
            {s.title}
          </button>
        ))}
      </div>
      {whatIfActive && (
        <p className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-xs text-muted">
          These figures use your saved staffing. You have not yet saved the staffing you are trying
          on One scenario.
        </p>
      )}
      <DynamicVariablesPanel
        value={riskVariables}
        onChange={onRiskVariablesChange}
        result={result}
        ownBusiness={ownBusiness}
      />
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Figures with these settings</CardTitle>
            <CardDescription>
              {scenario.title} · {ILLUSTRATIVE_LABEL}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FigureTile
              label="Assumed days until found"
              value={`about ${result.timelineDays.p50} days`}
              hint={`assumed range ${result.timelineDays.p95Low}–${result.timelineDays.p95High} days`}
            />
            <FigureTile
              label="Assumed loss if it happens"
              value={formatUsd(result.financialImpact.expected)}
              hint="before insurance"
            />
            <FigureTile
              label="Assumed retained loss"
              value={formatUsd(result.retainedImpact.expected)}
              hint={withPolicyNote(noPolicy ? "all of it" : "after deductible and limit")}
            />
          </CardContent>
        </Card>
      )}
      <Button variant="secondary" size="sm" onClick={onShowCascades}>
        <GitBranch className="size-3.5" />
        See what else moves
      </Button>
    </div>
  );
}
