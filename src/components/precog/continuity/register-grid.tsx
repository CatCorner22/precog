import { Plus, Trash2 } from "lucide-react";
import type { CoverageReport, ItemCoverage } from "@/lib/precog/continuity/coverage";
import {
  LEVEL_LABEL,
  LEVEL_ORDER,
  relationLevel,
  STATUS_LABEL,
} from "@/lib/precog/continuity/coverage";
import {
  CRITICALITY_LABEL,
  inputClass,
  KIND_LABEL,
  LEVEL_SHORT,
  STATUS_VARIANT,
} from "@/lib/precog/continuity/planner-copy";
import {
  REGISTER_ITEM_PAGE,
  REGISTER_PEOPLE_PAGE,
  REGISTER_RESPONSIVE_ITEMS,
  REGISTER_RESPONSIVE_PEOPLE,
  registerOverResponsiveLimit,
} from "@/lib/precog/continuity/register-window";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import type { Criticality, KnowledgeKind, KnowledgeLevel, Person } from "@/lib/precog/types";
import type { RegisterImportIssue } from "@/lib/precog/import/register-csv";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RegisterGrid({
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
  tpl,
  setLevel,
  removeItem,
}: {
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
  setSelectedId: (id: string) => void;
  trackFreshness: boolean;
  staleIds: Set<string>;
  tpl: IndustryTemplate;
  setLevel: (personId: string, knowledgeId: string, level: KnowledgeLevel | undefined) => void;
  removeItem: (id: string) => void;
}) {
  return (
    <>
      {importIssues.length > 0 && (
        <div className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-warn">Import notes</p>
            <button
              type="button"
              onClick={() => setImportIssues([])}
              className="text-xs text-subtle underline hover:text-fg"
            >
              Dismiss
            </button>
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
            {importIssues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.row}-${index}`}>
                {issue.row === 0 ? "Header" : `Row ${issue.row}`}: {issue.message}
              </li>
            ))}
            {importIssues.length > 8 && <li>…and {importIssues.length - 8} more</li>}
          </ul>
        </div>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addItem();
        }}
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs text-muted">
          Add a duty, task or piece of know-how
          <input
            className={inputClass}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="e.g. Run payroll, Close the till, Reset the alarm"
            aria-label="New item name"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Type
          <select
            className={inputClass}
            value={draftKind}
            onChange={(e) => setDraftKind(e.target.value as KnowledgeKind)}
            aria-label="New item type"
          >
            {(Object.keys(KIND_LABEL) as KnowledgeKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          If nobody can do it
          <select
            className={inputClass}
            value={draftCriticality}
            onChange={(e) => setDraftCriticality(e.target.value as Criticality)}
            aria-label="New item criticality"
          >
            {(Object.keys(CRITICALITY_LABEL) as Criticality[]).map((c) => (
              <option key={c} value={c}>
                {CRITICALITY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={!draftName.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </form>

      {people.length === 0 ? (
        <p className="text-sm text-muted">
          No active people on the team yet. Add or import your team in the Builder tab first.
        </p>
      ) : (
        <div className="space-y-2">
          {registerOverResponsiveLimit(people.length, report.items.length) && (
            <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-muted">
              This register has {people.length} people and {report.items.length} items. The grid
              shows {REGISTER_PEOPLE_PAGE} people and {REGISTER_ITEM_PAGE} items at a time so the
              page stays responsive. A single page of every cell slows down past{" "}
              {REGISTER_RESPONSIVE_PEOPLE} people or {REGISTER_RESPONSIVE_ITEMS} items.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>
              Items {safeItemPage * REGISTER_ITEM_PAGE + 1}–
              {Math.min(report.items.length, (safeItemPage + 1) * REGISTER_ITEM_PAGE)} of{" "}
              {report.items.length}
            </span>
            <button
              type="button"
              className="rounded border border-border px-2 py-1 disabled:opacity-40"
              disabled={safeItemPage === 0}
              onClick={() => setItemPage(safeItemPage - 1)}
            >
              Previous items
            </button>
            <button
              type="button"
              className="rounded border border-border px-2 py-1 disabled:opacity-40"
              disabled={safeItemPage >= itemPages - 1}
              onClick={() => setItemPage(safeItemPage + 1)}
            >
              Next items
            </button>
            <span>
              People {safePeoplePage * REGISTER_PEOPLE_PAGE + 1}–
              {Math.min(people.length, (safePeoplePage + 1) * REGISTER_PEOPLE_PAGE)} of{" "}
              {people.length}
            </span>
            <button
              type="button"
              className="rounded border border-border px-2 py-1 disabled:opacity-40"
              disabled={safePeoplePage === 0}
              onClick={() => setPeoplePage(safePeoplePage - 1)}
            >
              Previous people
            </button>
            <button
              type="button"
              className="rounded border border-border px-2 py-1 disabled:opacity-40"
              disabled={safePeoplePage >= peoplePages - 1}
              onClick={() => setPeoplePage(safePeoplePage + 1)}
            >
              Next people
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-elevated text-xs text-muted">
                <tr>
                  {/* The item stays in view while the people columns scroll past it. */}
                  <th className="sticky left-0 z-10 bg-elevated px-3 py-2 text-left font-medium">
                    Item
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Coverage</th>
                  {visiblePeople.map((p) => (
                    <th key={p.id} className="px-2 py-2 text-left font-medium">
                      <div className="truncate" title={p.role}>
                        {p.name}
                      </div>
                      <div className="truncate text-xs font-normal">{p.role}</div>
                    </th>
                  ))}
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((row) => {
                  const isSelected = selected?.item.id === row.item.id;
                  return (
                    <tr
                      key={row.item.id}
                      className={cn(
                        "cursor-pointer border-t border-border align-top hover:bg-elevated/60",
                        isSelected && "bg-primary/5",
                      )}
                      onClick={() => setSelectedId(row.item.id)}
                    >
                      <th
                        scope="row"
                        className={cn(
                          "sticky left-0 z-10 px-3 py-2 text-left font-normal",
                          isSelected ? "bg-elevated" : "bg-surface",
                        )}
                      >
                        <div className="flex max-w-[9rem] flex-wrap items-center gap-2 sm:max-w-xs">
                          <span className="font-medium">{row.item.name}</span>
                          {trackFreshness && staleIds.has(row.item.id) && (
                            <Badge variant="warn">Re-confirm</Badge>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted">
                          <span>{KIND_LABEL[row.item.kind ?? "knowledge"]}</span>
                          <span>·</span>
                          <span>{CRITICALITY_LABEL[row.item.criticality]}</span>
                          {row.item.documented && (
                            <>
                              <span>·</span>
                              <span>Written down</span>
                            </>
                          )}
                        </div>
                      </th>
                      <td className="px-3 py-2">
                        <Badge variant={STATUS_VARIANT[row.status]}>
                          {STATUS_LABEL[row.status]}
                        </Badge>
                      </td>
                      {visiblePeople.map((p) => {
                        const level = relationLevel(tpl.relations, p.id, row.item.id);
                        return (
                          <td key={p.id} className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                            <select
                              className={cn(
                                inputClass,
                                "w-full",
                                level === "expert" || level === "proficient"
                                  ? "border-ok/40 text-ok"
                                  : level === "basic"
                                    ? "border-warn/40 text-warn"
                                    : "text-muted",
                              )}
                              value={level ?? ""}
                              onChange={(e) =>
                                setLevel(
                                  p.id,
                                  row.item.id,
                                  (e.target.value || undefined) as KnowledgeLevel | undefined,
                                )
                              }
                              aria-label={`${p.name} on ${row.item.name}`}
                            >
                              <option value="">—</option>
                              {[...LEVEL_ORDER].reverse().map((l) => (
                                <option key={l} value={l} title={LEVEL_LABEL[l]}>
                                  {LEVEL_SHORT[l]}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="rounded p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                          onClick={() => removeItem(row.item.id)}
                          aria-label={`Remove ${row.item.name}`}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {report.items.length === 0 && (
                  <tr>
                    <td colSpan={people.length + 3} className="px-3 py-6 text-center text-muted">
                      Nothing here yet. Add the first duty above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-xs text-muted">
        Levels:{" "}
        {LEVEL_ORDER.map((l) => `${LEVEL_SHORT[l]} = ${LEVEL_LABEL[l].toLowerCase()}`).join(" · ")}.
        Only "Expert" and "Can do" count as a real backup.
      </p>
    </>
  );
}
