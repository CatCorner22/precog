import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OPERATING_DUTIES, entitlementLabel } from "@/lib/precog/sod/conflict-rules";
import type { SodDetectionReport } from "@/lib/precog/sod/detect";
import { cn } from "@/lib/utils";
import { SEVERITY_FILTERS } from "./sod-conflict-view";

/** Every duty but "view reports only", which conflicts with nothing. */
const MATRIX_DUTIES = OPERATING_DUTIES.map((e) => e.id);

export function SodMatrixSection({ report }: { report: SodDetectionReport }) {
  const cellMap = useMemo(
    () => new Map(report.matrix.map((cell) => [`${cell.row}|${cell.col}`, cell])),
    [report],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Duty conflict matrix</CardTitle>
        <CardDescription>
          A red cell marks two duties one person should not hold at once.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <caption className="sr-only">
            Duty conflict matrix. Rows and columns are duties; each cell says whether one person may
            hold both.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface p-1 text-left text-muted">
                Duty
              </th>
              {MATRIX_DUTIES.map((id) => (
                <th
                  key={id}
                  scope="col"
                  className="h-48 p-1 align-bottom text-left font-normal text-muted"
                >
                  <span className="inline-block rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">
                    {entitlementLabel(id)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX_DUTIES.map((row) => (
              <tr key={row}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[160px] truncate bg-surface p-1 text-left font-medium text-fg"
                  title={entitlementLabel(row)}
                >
                  {entitlementLabel(row)}
                </th>
                {MATRIX_DUTIES.map((col) => {
                  const cell = cellMap.get(`${row}|${col}`);
                  const status = cell?.status ?? "safe";
                  const description = cellDescription(row, col, status, cell?.severity);
                  return (
                    <td key={col} className="p-0.5">
                      <span
                        role="img"
                        aria-label={description}
                        title={description}
                        className={cn(
                          "flex size-6 items-center justify-center rounded",
                          status === "self" && "bg-elevated text-subtle",
                          status === "safe" && "bg-ok/15 text-ok",
                          status === "conflict" &&
                            cell?.severity === "critical" &&
                            "bg-danger/40 text-danger",
                          status === "conflict" &&
                            cell?.severity === "high" &&
                            "bg-warn/40 text-warn",
                          status === "conflict" &&
                            (cell?.severity === "medium" || cell?.severity === "family") &&
                            "bg-warn/20 text-warn",
                        )}
                      >
                        <span aria-hidden>
                          {status === "conflict" ? "×" : status === "self" ? "·" : "✓"}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** What one cell says, for the hover title and for screen readers. */
function cellDescription(
  row: string,
  col: string,
  status: string,
  severity: string | undefined,
): string {
  if (status === "self") return `${entitlementLabel(row)}: the same duty`;
  if (status !== "conflict")
    return `${entitlementLabel(row)} and ${entitlementLabel(col)}: compatible`;
  const level = SEVERITY_FILTERS.find((item) => item.id === severity)?.label ?? "Conflict";
  return `${entitlementLabel(row)} and ${entitlementLabel(col)}: conflict, ${level.toLowerCase()}`;
}
