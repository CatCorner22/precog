import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Camera,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FolderOpen,
  History,
  Link2,
  RotateCcw,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface FileMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  title?: string;
  /** For an item that opens a panel: whether the panel is open now. */
  checked?: boolean;
  run: () => void;
}

/**
 * The map builder's File menu: the spreadsheet, the JSON backup, the share
 * link, the sample map and saved versions, behind one toolbar button. The
 * list exists only while it is open; the hidden file input for Import stays
 * mounted, so a file picked after the menu closes still arrives.
 */
export function BuilderFileMenu({
  spreadsheetOpen,
  shareOpen,
  versionsOpen,
  versionCount,
  canResetMap,
  onSpreadsheet,
  onExport,
  onImportFile,
  onShare,
  onSampleMap,
  onSaveVersion,
  onVersions,
}: {
  spreadsheetOpen: boolean;
  shareOpen: boolean;
  versionsOpen: boolean;
  versionCount: number;
  /** True once the map differs from the sample, so "Sample process map" has something to undo. */
  canResetMap: boolean;
  onSpreadsheet: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onShare: () => void;
  onSampleMap: () => void;
  onSaveVersion: () => void;
  onVersions: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const icon = "size-3.5 shrink-0";
  const items: FileMenuItem[] = [
    {
      id: "spreadsheet",
      label: "Spreadsheet",
      icon: <FileSpreadsheet className={icon} />,
      title: "Export to or import from a CSV spreadsheet",
      checked: spreadsheetOpen,
      run: onSpreadsheet,
    },
    {
      id: "export",
      label: "Export",
      icon: <Download className={icon} />,
      title: "Full backup as JSON",
      run: onExport,
    },
    {
      id: "import",
      label: "Import",
      icon: <Upload className={icon} />,
      title: "Restore a JSON backup",
      run: () => fileRef.current?.click(),
    },
    {
      id: "share",
      label: "Share",
      icon: <Link2 className={icon} />,
      title: "Create a read-only link for an advisor or lender",
      checked: shareOpen,
      run: onShare,
    },
    ...(canResetMap
      ? [
          {
            id: "sample",
            label: "Sample process map",
            icon: <RotateCcw className={icon} />,
            run: onSampleMap,
          },
        ]
      : []),
    {
      id: "save-version",
      label: "Save version",
      icon: <Camera className={icon} />,
      title: "Save a named version of this map",
      run: onSaveVersion,
    },
    ...(versionCount > 0
      ? [
          {
            id: "versions",
            label: `Saved versions (${versionCount})`,
            icon: <History className={icon} />,
            checked: versionsOpen,
            run: onVersions,
          },
        ]
      : []),
  ];

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = itemRefs.current.filter((el): el is HTMLButtonElement => el !== null);
    const index = buttons.findIndex((el) => el === document.activeElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
    else if (event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    } else if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    buttons[next]?.focus();
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-elevated px-3 text-xs font-medium text-fg hover:bg-border"
      >
        <FolderOpen className="size-3.5" aria-hidden />
        File
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportFile(f);
          e.target.value = "";
        }}
      />
      {open && (
        <div
          role="menu"
          aria-label="File"
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 z-30 mt-1 w-56 rounded-lg border border-border bg-surface p-1 shadow-xl"
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
              aria-checked={item.checked}
              tabIndex={-1}
              title={item.title}
              onClick={() => {
                setOpen(false);
                // The item unmounts with the menu: give focus back to File first,
                // so an action that moves focus itself (a panel opening) still wins.
                triggerRef.current?.focus();
                item.run();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-elevated hover:text-fg focus:bg-elevated focus:text-fg",
                item.checked ? "text-fg" : "text-muted",
              )}
            >
              {item.icon}
              <span className="min-w-0 flex-1">{item.label}</span>
              {item.checked && (
                <span className="text-xs text-primary" aria-hidden>
                  open
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
