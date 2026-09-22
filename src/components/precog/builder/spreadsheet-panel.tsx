import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTemplate } from "@/lib/precog/use-template";
import {
  parseProcessCsv,
  processesToCsv,
  processTemplateCsv,
  type ProcessImportResult,
} from "@/lib/precog/import/process-csv";
import type { ProcessNode } from "@/lib/precog/types";
import { slug } from "@/components/precog/builder/form-shared";
import { processChanges } from "@/lib/precog/builder/diff";

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

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
  const [fileText, setFileText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<ProcessImportResult | null>(null);

  function runPreview(text: string, mode: "merge" | "replace") {
    setPreview(parseProcessCsv(text, tpl, { mode }));
  }

  async function pick(file: File) {
    try {
      const text = await file.text();
      setFileText(text);
      setFileName(file.name);
      runPreview(text, replace ? "replace" : "merge");
    } catch {
      toast.error("Could not read that file", {
        description: "Choose a CSV exported from a spreadsheet and try again.",
      });
    }
  }

  function apply() {
    if (!preview) return;
    const blocking = preview.issues.some((i) => i.row === 0);
    if (blocking) return;
    onApply(preview.processes);
    const first = preview.added[0] ?? preview.updated[0]?.after;
    if (first) onSelectProcess(first.id);
    toast.success(
      `Imported ${preview.added.length} new, updated ${preview.updated.length}${
        replace && preview.removed.length ? `, removed ${preview.removed.length}` : ""
      }`,
      {
        description: preview.issues.length
          ? `${preview.issues.length} row(s) had values that were skipped. Ctrl+Z undoes the import.`
          : "Ctrl+Z undoes the import.",
      },
    );
    setPreview(null);
    setFileText(null);
  }

  const blocking = preview?.issues.find((i) => i.row === 0);
  const changeCount = preview
    ? preview.added.length + preview.updated.length + (replace ? preview.removed.length : 0)
    : 0;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
        <FileSpreadsheet className="size-3.5 text-primary" /> Spreadsheet
      </p>
      <p className="text-[11px] text-muted">
        Work in Excel or Google Sheets, then bring it back. Owners, dependencies, and controls are
        matched by name; rows that match a current process update it in place and keep its risks and
        evidence.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            download(
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
          onClick={() => download("precog-process-template.csv", processTemplateCsv())}
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

      {preview && (
        <div className="space-y-2 rounded-md border border-border bg-elevated p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-fg">
              Preview of {fileName || "import"}
              <span className="text-muted">
                {" "}
                · {preview.added.length} new · {preview.updated.length} updated ·{" "}
                {preview.unchanged.length} unchanged · {preview.removed.length} not in file
              </span>
            </p>
            <label className="flex items-center gap-1.5 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => {
                  setReplace(e.target.checked);
                  if (fileText) runPreview(fileText, e.target.checked ? "replace" : "merge");
                }}
              />
              Remove the {preview.removed.length} process(es) not in the file
            </label>
          </div>

          {blocking && <p className="text-[11px] text-danger">{blocking.message}</p>}

          {!blocking && (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[11px]">
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
            <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded border border-warn/40 bg-warn/10 p-1.5 text-[11px] text-fg">
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPreview(null);
                setFileText(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={Boolean(blocking) || changeCount === 0}
              onClick={apply}
              className={cn(changeCount === 0 && "opacity-60")}
            >
              Apply {changeCount ? `${changeCount} change(s)` : ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
