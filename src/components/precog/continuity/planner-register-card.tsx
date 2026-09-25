import { useRef } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { RegisterGrid } from "@/components/precog/continuity/register-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoverageReport, ItemCoverage } from "@/lib/precog/continuity/coverage";
import type { RegisterImportIssue } from "@/lib/precog/import/register-csv";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import type { Criticality, KnowledgeKind, KnowledgeLevel, Person } from "@/lib/precog/types";

export function PlannerRegisterCard({
  registerFrom,
  tpl,
  importIssues,
  setImportIssues,
  addItem,
  draftName,
  setDraftName,
  draftKind,
  setDraftKind,
  draftCriticality,
  setDraftCriticality,
  people,
  report,
  safeItemPage,
  setItemPage,
  itemPages,
  safePeoplePage,
  setPeoplePage,
  peoplePages,
  visiblePeople,
  visibleItems,
  selected,
  setSelectedId,
  trackFreshness,
  staleIds,
  setLevel,
  removeItem,
  onImportCsv,
  onExportCsv,
  onExportTemplate,
  onReset,
}: {
  registerFrom: "starter" | "own" | "sample";
  tpl: IndustryTemplate;
  importIssues: RegisterImportIssue[];
  setImportIssues: (issues: RegisterImportIssue[]) => void;
  addItem: () => void;
  draftName: string;
  setDraftName: (value: string) => void;
  draftKind: KnowledgeKind;
  setDraftKind: (value: KnowledgeKind) => void;
  draftCriticality: Criticality;
  setDraftCriticality: (value: Criticality) => void;
  people: Person[];
  report: CoverageReport;
  safeItemPage: number;
  setItemPage: (page: number) => void;
  itemPages: number;
  safePeoplePage: number;
  setPeoplePage: (page: number) => void;
  peoplePages: number;
  visiblePeople: Person[];
  visibleItems: ItemCoverage[];
  selected: ItemCoverage | undefined;
  setSelectedId: (id: string | null) => void;
  trackFreshness: boolean;
  staleIds: Set<string>;
  setLevel: (personId: string, knowledgeId: string, level: KnowledgeLevel | undefined) => void;
  removeItem: (id: string) => void;
  onImportCsv: (file: File) => void | Promise<void>;
  onExportCsv: () => void;
  onExportTemplate: () => void;
  onReset: () => void;
}) {
  const csvInputRef = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Who can do what</CardTitle>
          <CardDescription>
            Every duty, task and piece of know-how the business runs on, and who can do it. Anyone
            can hold as many as they like; each item should have at least two people who can run it
            alone.
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
              if (file) void onImportCsv(file);
              event.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={onExportCsv}
            title="Download the current register to edit in a spreadsheet"
          >
            <Download className="size-3.5" /> Export CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onExportTemplate}
            title="Blank grid with your team as columns"
          >
            Blank template
          </Button>
          {registerFrom === "own" && (
            <Button variant="ghost" size="sm" onClick={onReset} title="Back to the starter list">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterGrid
          importIssues={importIssues}
          setImportIssues={setImportIssues}
          addItem={addItem}
          draftName={draftName}
          setDraftName={setDraftName}
          draftKind={draftKind}
          setDraftKind={setDraftKind}
          draftCriticality={draftCriticality}
          setDraftCriticality={setDraftCriticality}
          people={people}
          report={report}
          safeItemPage={safeItemPage}
          setItemPage={setItemPage}
          itemPages={itemPages}
          safePeoplePage={safePeoplePage}
          setPeoplePage={setPeoplePage}
          peoplePages={peoplePages}
          visiblePeople={visiblePeople}
          visibleItems={visibleItems}
          selected={selected}
          setSelectedId={setSelectedId}
          trackFreshness={trackFreshness}
          staleIds={staleIds}
          tpl={tpl}
          setLevel={setLevel}
          removeItem={removeItem}
        />
      </CardContent>
    </Card>
  );
}
