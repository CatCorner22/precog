import { useMemo, useState } from "react";
import { GitBranch, GitCompare, LineChart, SlidersHorizontal } from "lucide-react";
import { useTemplate } from "@/lib/precog/use-template";
import { runPrecogScenario } from "@/lib/precog/engine";
import type { StaffComposition } from "@/lib/precog/types";
import {
  mergeStaffIntoVariables,
  type RiskVariableState,
} from "@/lib/precog/scoring/dynamic-variables";
import { isOwnBusiness, withOwnScenarioWording } from "@/lib/precog/scoring/scope";
import { usePractice } from "@/lib/precog/practice-context";
import { CascadePanel } from "@/components/precog/cascade-panel";
import { ScenarioCompare } from "@/components/precog/scenario-compare";
import { Button } from "@/components/ui/button";
import { applyWhatIf, pickScenario } from "./scenario-page";
import type { StaffWhatIf } from "./staff-what-if";
import { SingleScenarioView } from "./scenario-single-view";
import { ScenarioVariablesView } from "./scenario-variables-view";

export type ScenarioView = "single" | "compare" | "variables" | "cascades";

/**
 * What could happen: one scenario's assumed figures, a comparison of options,
 * the owner's settings and insurance, and what else a change moves.
 *
 * Staffing tried on this page is a what-if held here, not in the business
 * profile, so dragging a slider never changes the Dashboard or any other
 * screen; "Apply to my business" saves it. Settings and insurance are the
 * owner's own policy terms and save as they are edited.
 */
export function ScenarioRunner({ initialScenarioId }: { initialScenarioId?: string | null }) {
  const baseTpl = useTemplate();
  // The owner's own business reads the starter scenarios in role words, not
  // the sample team's names; ids and figures are unchanged.
  const tpl = withOwnScenarioWording(baseTpl);
  const ownBusiness = isOwnBusiness(baseTpl);
  const { profile, setStaff, setRiskVariables } = usePractice();
  const [view, setView] = useState<ScenarioView>("single");
  const [picked, setPicked] = useState(initialScenarioId ?? null);
  const [mitigations, setMitigations] = useState<string[]>([]);
  const [whatIf, setWhatIf] = useState<StaffComposition | null>(null);

  // A deep link to another scenario replaces the pick. Adjusting state while
  // rendering (not in an effect) avoids one render with the old scenario.
  const [linkedId, setLinkedId] = useState(initialScenarioId);
  if (initialScenarioId !== linkedId) {
    setLinkedId(initialScenarioId);
    if (initialScenarioId) {
      setPicked(initialScenarioId);
      setMitigations([]);
    }
  }

  const scenario = pickScenario(tpl.scenarios, picked);
  const mitigationIds = useMemo(
    () => mitigations.filter((id) => scenario.mitigations.some((m) => m.id === id)),
    [mitigations, scenario],
  );
  const staff = whatIf ?? profile.staff;
  const whatIfRiskVars = useMemo(
    () => mergeStaffIntoVariables(profile.riskVariables, staff),
    [profile.riskVariables, staff],
  );
  // The settings view edits the saved settings, so it shows figures for them.
  const settingsView = view === "variables";
  const result = useMemo(
    () =>
      runPrecogScenario(tpl, scenario.id, {
        mitigationIds,
        staff: settingsView ? profile.staff : staff,
        riskVariables: settingsView ? profile.riskVariables : whatIfRiskVars,
      }),
    [
      tpl,
      scenario.id,
      mitigationIds,
      settingsView,
      profile.staff,
      profile.riskVariables,
      staff,
      whatIfRiskVars,
    ],
  );

  function pick(id: string) {
    setPicked(id);
    setMitigations([]);
  }

  function toggleMitigation(id: string) {
    setMitigations((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function updateRiskVariables(next: RiskVariableState) {
    setRiskVariables(next);
    // A control switched on in settings is switched on in the what-if too.
    setWhatIf((w) =>
      w
        ? {
            ...w,
            dualControlPayments: next.hasDualControl,
            independentBankRec: next.hasIndependentBankRec,
          }
        : w,
    );
  }

  const staffWhatIf: StaffWhatIf = {
    staff,
    saved: profile.staff,
    ownBusiness,
    onChange: setWhatIf,
    onApply: () => {
      if (whatIf) setStaff((saved) => applyWhatIf(saved, whatIf));
      setWhatIf(null);
    },
    onReset: () => setWhatIf(null),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Scenario views">
        {VIEWS.map(({ id, label, Icon }) => (
          <Button
            key={id}
            size="sm"
            variant={view === id ? "default" : "secondary"}
            aria-pressed={view === id}
            onClick={() => setView(id)}
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>

      {view === "compare" ? (
        <ScenarioCompare
          initialScenarioId={scenario.id}
          staffWhatIf={staffWhatIf}
          riskVariables={whatIfRiskVars}
        />
      ) : view === "cascades" ? (
        <CascadePanel />
      ) : view === "variables" ? (
        <ScenarioVariablesView
          scenarios={tpl.scenarios}
          scenario={scenario}
          onPick={setPicked}
          riskVariables={profile.riskVariables}
          onRiskVariablesChange={updateRiskVariables}
          result={result}
          ownBusiness={ownBusiness}
          whatIfActive={whatIf !== null}
          onShowCascades={() => setView("cascades")}
        />
      ) : (
        <SingleScenarioView
          tpl={tpl}
          scenario={scenario}
          result={result}
          riskVariables={whatIfRiskVars}
          ownBusiness={ownBusiness}
          mitigations={mitigationIds}
          onPick={pick}
          onToggleMitigation={toggleMitigation}
          onClearMitigations={() => setMitigations([])}
          onView={setView}
          staffWhatIf={staffWhatIf}
        />
      )}
    </div>
  );
}

const VIEWS: { id: ScenarioView; label: string; Icon: typeof LineChart }[] = [
  { id: "single", label: "One scenario", Icon: LineChart },
  { id: "compare", label: "Compare what-ifs", Icon: GitCompare },
  { id: "variables", label: "Settings and insurance", Icon: SlidersHorizontal },
  { id: "cascades", label: "What else moves", Icon: GitBranch },
];
