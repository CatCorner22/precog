import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  csvImportChangeCount,
  openCsvImport,
  previewAgainst,
  withReplace,
  type CsvImport,
} from "@/lib/precog/builder/csv-import";
import { processChanges } from "@/lib/precog/builder/diff";
import { downloadCsv } from "@/lib/download";
import { processesToCsv, processTemplateCsv } from "@/lib/precog/import/process-csv";
import { count, slug } from "@/lib/precog/text";
import type { ProcessNode } from "@/lib/precog/types";
import { useTemplate } from "@/lib/precog/practice-context";

/**
 * Spreadsheet round-trip for the map: export the current processes as CSV,
 * download a blank template, or import a CSV with a preview of exactly what
 * will change before anything is applied.
 */
export function SpreadsheetPanel({
  businessName,
  onApply,
  onSelectProcess,
}: {
  businessName: string;
  onApply: (processes: ProcessNode[]) => void;
  onSelectProcess: (id: string) => void;
}) {
  const tpl = useTemplate();
  const fileRef = useRef<HTMLInputElement>(null);
  // The import waiting for Apply or Cancel; closing it drops its choices too.
  const [opened, setPending] = useState<CsvImport | null>(null);
  // Previewed against the current map, so Apply never brings back a process
  // as it was before an edit made while the preview was open.
  const pending = useMemo(() => opened && previewAgainst(opened, tpl), [opened, tpl]);

  async function pick(file: File) {
    try {
      setPending(openCsvImport(file.name, await file.text(), tpl));
    } catch {
      toast.error("Could not read that file", {
        description: "Choose a CSV exported from a spreadsheet and try again.",
      });
    }
  }

  const preview = pending?.preview ?? null;
  const replace = pending?.replace ?? false;
  const blocking = preview?.issues.find((i) => i.row === 0);
  const changeCount = pending ? csvImportChangeCount(pending) : 0;

  function apply() {
    if (!preview || blocking) return;
    onApply(preview.processes);
    const first = preview.added[0] ?? preview.updated[0]?.after;
    if (first) onSelectProcess(first.id);
    toast.success(
      `Imported ${preview.added.length} new, updated ${preview.updated.length}${
        replace && preview.removed.length ? `, removed ${preview.removed.length}` : ""
      }`,
      {
        description: preview.issues.length
          ? `${count(preview.issues.length, "row")} had values that Precog skipped. Ctrl+Z undoes the import.`
          : "Ctrl+Z undoes the import.",
      },
    );
    setPending(null);
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
        <FileSpreadsheet className="size-3.5 text-primary" /> Spreadsheet
      </p>
      <p className="text-xs text-muted">
        Work in Excel or Google Sheets, then bring it back. Precog matches owners, dependencies, and
        controls by name; rows that match a current process update it in place and keep its risks
        and evidence.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            downloadCsv(
              `${slug(businessName) || "process-map"}-processes.csv`,
              processesToCsv(tpl.processes, tpl.people, tpl.controls),
            )
          }
        >
          <Download className="size-3.5" /> Export this map
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => downloadCsv("precog-process-template.csv", processTemplateCsv(tpl))}
        >
          Blank template
        </Button>
        <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
          <Upload className="size-3.5" /> Import CSV
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void pick(file);
            event.target.value = "";
          }}
        />
      </div>

      {pending && preview && (
        <div className="space-y-2 rounded-md border border-border bg-elevated p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-fg">
              Preview of {pending.fileName || "import"}
              <span className="text-muted">
                {" "}
                · {preview.added.length} new · {preview.updated.length} updated ·{" "}
                {preview.unchanged.length} unchanged · {preview.removed.length} not in file
              </span>
            </p>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setPending(withReplace(pending, e.target.checked, tpl))}
              />
              Remove the {count(preview.removed.length, "process", "processes")} not in the file
            </label>
          </div>

          {blocking && <p className="text-xs text-danger">{blocking.message}</p>}

          {!blocking && (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs">
              {preview.added.map((p) => (
                <li key={p.id} className="text-ok">
                  + {p.name}
                </li>
              ))}
              {preview.updated.map(({ before, after }) => (
                <li key={after.id} className="text-fg">
                  ~ {after.name}
                  <span className="text-muted">
                    {" "}
                    · {processChanges(before, after).join(", ") || "fields"}
                  </span>
                </li>
              ))}
              {replace &&
                preview.removed.map((p) => (
                  <li key={p.id} className="text-danger">
                    − {p.name}
                  </li>
                ))}
              {changeCount === 0 && (
                <li className="text-muted">Nothing would change. The file matches the map.</li>
              )}
            </ul>
          )}

          {preview.issues.filter((i) => i.row > 0).length > 0 && (
            <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded border border-warn/40 bg-warn/10 p-1.5 text-xs text-fg">
              {preview.issues
                .filter((i) => i.row > 0)
                .map((i, idx) => (
                  <li key={idx}>
                    <span className="text-muted">Row {i.row}:</span> {i.message}
                  </li>
                ))}
            </ul>
          )}

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={Boolean(blocking) || changeCount === 0} onClick={apply}>
              Apply {changeCount ? count(changeCount, "change") : ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
