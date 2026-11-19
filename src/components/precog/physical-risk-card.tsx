import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePractice } from "@/lib/precog/practice-context";
import { localDateKey } from "@/lib/precog/dates";
import {
  assessPhysicalRisk,
  normalizePhysicalRisk,
  PIPE_WEIBULL,
  MIN_BUILDING_YEAR,
  MAX_BUILDING_YEAR,
  MAX_SEISMIC_ZONE,
  type PhysicalRiskInput,
} from "@/lib/precog/physical-risk";

const fields = [
  {
    key: "buildingYear",
    label: "Building year",
    min: MIN_BUILDING_YEAR,
    max: MAX_BUILDING_YEAR,
    step: "1",
  },
  {
    key: "condition",
    label: "Structural condition (0 worst, 1 best)",
    min: 0,
    max: 1,
    step: "any",
  },
  { key: "occupancy", label: "Occupants", min: 0, step: "1" },
  { key: "floorArea", label: "Floor area (square metres)", min: Number.MIN_VALUE, step: "any" },
  { key: "seismicZone", label: "Seismic zone (0 to 4)", min: 0, max: MAX_SEISMIC_ZONE, step: "1" },
  { key: "pipeAge", label: "Pipe age (years)", min: 0, step: "any" },
] as const;
const control = "w-full rounded-md border border-border bg-bg px-3 py-2 text-sm";

export function PhysicalRiskCard() {
  const { profile, setPhysicalRisk } = usePractice();
  const saved = profile.physicalRisk;
  const id = useId();
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(saved ?? {}).map(([key, value]) => [key, String(value)])),
  );
  const [notice, setNotice] = useState("");
  const today = localDateKey(new Date());
  const result = assessPhysicalRisk(saved, today);
  const change = (key: string, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice("");
  };
  function save() {
    const input: Record<string, unknown> = {};
    for (const { key } of fields) if (draft[key]?.trim()) input[key] = Number(draft[key]);
    if (draft.pipeMaterial) input.pipeMaterial = draft.pipeMaterial;
    if (draft.lastInspection) input.lastInspection = draft.lastInspection;
    if (draft.fireSuppression) input.fireSuppression = draft.fireSuppression === "true";
    setPhysicalRisk(normalizePhysicalRisk(input));
    setNotice("Inputs saved. Only known inputs are used; incomplete estimates are skipped.");
  }
  return (
    <Card aria-label="Building and pipe estimate" id="physical-risk-card">
      <CardHeader>
        <CardTitle>Building and pipe estimate</CardTitle>
        <CardDescription>
          Rough estimate, not from a published source. It feeds no score.
        </CardDescription>
        <p className="text-sm text-muted">
          Weather and flood risk come later, from published sources.
        </p>
        <p className="text-sm text-muted">
          The pipe band uses age and material only. It is not an annual forecast or an inspection.
        </p>
        <p className="text-sm text-muted">
          Optional. Enter facts you know; leave unknown inputs blank. This does not change any
          index, report or financial figure.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="grid gap-3 md:grid-cols-3">
            {fields.map(({ key, label, ...limits }) => (
              <label key={key} htmlFor={`${id}-${key}`} className="space-y-1 text-sm">
                <span>{label}</span>
                <input
                  {...limits}
                  max={
                    key === "buildingYear"
                      ? Math.min(MAX_BUILDING_YEAR, Number(today.slice(0, 4)))
                      : "max" in limits
                        ? limits.max
                        : undefined
                  }
                  id={`${id}-${key}`}
                  type="number"
                  className={control}
                  value={draft[key] ?? ""}
                  onChange={(event) => change(key, event.target.value)}
                />
              </label>
            ))}
            <div className="space-y-1 text-sm">
              <label htmlFor={`${id}-material`}>Pipe material</label>
              <select
                id={`${id}-material`}
                className={control}
                value={draft.pipeMaterial ?? ""}
                onChange={(event) => change("pipeMaterial", event.target.value)}
              >
                <option value="">Unknown</option>
                {(
                  Object.keys(PIPE_WEIBULL) as NonNullable<PhysicalRiskInput["pipeMaterial"]>[]
                ).map((material) => (
                  <option key={material} value={material}>
                    {material === "pvc" ? "PVC" : material.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 text-sm">
              <label htmlFor={`${id}-fire`}>Fire suppression present</label>
              <select
                id={`${id}-fire`}
                className={control}
                value={draft.fireSuppression ?? ""}
                onChange={(event) => change("fireSuppression", event.target.value)}
              >
                <option value="">Unknown</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <label htmlFor={`${id}-inspection`} className="space-y-1 text-sm">
              <span>Last inspection date</span>
              <input
                id={`${id}-inspection`}
                className={control}
                type="date"
                max={today}
                value={draft.lastInspection ?? ""}
                onChange={(event) => change("lastInspection", event.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Save building and pipe inputs</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPhysicalRisk(undefined);
                setDraft({});
                setNotice("Building and pipe inputs removed.");
              }}
            >
              Clear inputs
            </Button>
          </div>
        </form>
        <p role="status" className="text-sm">
          {notice}
        </p>
        <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
          {(["pipe", "building"] as const).map((key) => (
            <div
              key={key}
              aria-label={`${key === "pipe" ? "Pipe" : "Building"} estimate result`}
              className="rounded-md border border-border p-3 text-sm"
            >
              <span className="mr-2 font-medium">{key === "pipe" ? "Pipe" : "Building"}</span>
              {result[key].band ? (
                <Badge>{result[key].band}</Badge>
              ) : (
                <span>{result[key].reason}</span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
