import { memo, useState } from "react";
import { FAMILY_META } from "./power-map-graph";
import { ENTITLEMENTS } from "@/lib/precog/sod/conflict-rules";
import { DUTY_CONTROL_MEASURES } from "@/lib/precog/sod/control-measures";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The catalog is fixed advice for every visible duty, several hundred rows of
 * it. It opens on request, so the Power map does not lay out a 1,280-pixel
 * table nobody asked for, and it re-renders only when the duty filter
 * changes, not on every grant or selection.
 */
export const ControlMeasuresMatrix = memo(function ControlMeasuresMatrix({
  duties,
}: {
  duties: typeof ENTITLEMENTS;
}) {
  const [open, setOpen] = useState(false);
  const categories = ["directive", "preventive", "detective", "corrective"] as const;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Internal control action catalog</CardTitle>
          <CardDescription>
            A menu of directive, preventive, detective, and corrective measures for every visible
            duty. Pick proportionate primary controls and documented alternatives; no single action
            replaces accountable review.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Hide the catalog" : `Show the catalog (${duties.length} duties)`}
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="max-h-[760px] overflow-auto rounded-xl border border-border">
            <table className="min-w-[1280px] border-separate border-spacing-0 text-xs">
              <caption className="sr-only">
                Internal control measures for each duty, organized by directive, preventive,
                detective, and corrective category.
              </caption>
              <thead className="sticky top-0 z-20 bg-surface">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-30 w-64 border-b border-r border-border bg-surface p-3 text-left"
                  >
                    Power / duty
                  </th>
                  {categories.map((category) => (
                    <th
                      key={category}
                      scope="col"
                      className="w-64 border-b border-r border-border p-3 text-left capitalize"
                    >
                      {category}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {duties.map((duty) => {
                  const controls = DUTY_CONTROL_MEASURES[duty.id];
                  return (
                    <tr key={duty.id} className="align-top">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-b border-r border-border bg-surface p-3 text-left"
                      >
                        <span className="block font-medium text-fg">{duty.label}</span>
                        <span className="mt-1 block text-xs font-normal text-subtle">
                          {FAMILY_META[duty.family].label} · risk {duty.riskWeight}/5
                        </span>
                      </th>
                      {categories.map((category) => (
                        <td key={category} className="border-b border-r border-border bg-bg p-3">
                          <ul className="space-y-2 text-muted">
                            {controls[category].map((action) => (
                              <li key={action} className="flex gap-2">
                                <span aria-hidden="true" className="text-primary">
                                  •
                                </span>
                                <span>{action}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
});
