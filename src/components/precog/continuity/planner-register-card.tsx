import { useRef } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { RegisterGrid } from "@/components/precog/continuity/register-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RegisterEditor } from "@/components/precog/continuity/use-continuity-planner";
import type { CoverageReport } from "@/lib/precog/continuity/coverage";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import { useTabName } from "@/lib/precog/presentation";

/** The register card: import, export and reset in the header, the grid below. */
export function PlannerRegisterCard({
  register,
  report,
  tpl,
  trackFreshness,
}: {
  register: RegisterEditor;
  report: CoverageReport;
  tpl: IndustryTemplate;
  trackFreshness: boolean;
}) {
  const tabName = useTabName();
  const csvInputRef = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{`${tabName("knowledge")} register`}</CardTitle>
          <CardDescription>
            Every duty and piece of know-how the business runs on, and who can do it. Anyone can
            hold as many as they like; aim for at least two people who can run each item alone.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => csvInputRef.current?.click()}
            title="Replace the register with a spreadsheet: one row per item, one column per person"
          >
            <Upload className="size-3.5" /> Import CSV
          </Button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            aria-label="Import register CSV"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void register.importCsv(file);
              event.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={register.exportCsv}
            title="Download the current register to edit in a spreadsheet"
          >
            <Download className="size-3.5" /> Export CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={register.exportTemplate}
            title="Blank grid with your team as columns"
          >
            Blank template
          </Button>
          {register.source === "own" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={register.resetToTemplate}
              title="Replace your register with the industry's sample list"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Back to sample list
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterGrid
          register={register}
          report={report}
          tpl={tpl}
          trackFreshness={trackFreshness}
        />
      </CardContent>
    </Card>
  );
}
