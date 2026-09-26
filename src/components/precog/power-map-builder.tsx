import { PowerMapAbsenceCard } from "./power-map-absence-card";
import { PowerMapEditorSection } from "./power-map-editor-section";
import { PowerMapOverviewSection } from "./power-map-overview-section";
import { PowerMapResolutionSection } from "./power-map-resolution-section";
import { usePowerMapBuilder } from "./use-power-map-builder";

export function PowerMapBuilder() {
  const model = usePowerMapBuilder();

  return (
    <div className="space-y-4">
      <PowerMapOverviewSection model={model} />
      <PowerMapAbsenceCard model={model} />
      <PowerMapEditorSection model={model} />
      <PowerMapResolutionSection model={model} />
    </div>
  );
}
