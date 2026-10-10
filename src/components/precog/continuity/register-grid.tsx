import { Plus, Trash2 } from "lucide-react";
import type { CoverageReport } from "@/lib/precog/continuity/coverage";
import { LEVEL_LABEL, LEVEL_ORDER, relationLevel } from "@/lib/precog/continuity/coverage";
import { isWritten } from "@/lib/precog/continuity/documentation";
import {
  coverageBadge,
  CRITICALITY_LABEL,
  KIND_LABEL,
  LEVEL_SHORT,
} from "@/lib/precog/continuity/planner-copy";
import { inputClass } from "./styles";
import {
  REGISTER_ITEM_PAGE,
  REGISTER_PEOPLE_PAGE,
  REGISTER_RESPONSIVE_ITEMS,
  REGISTER_RESPONSIVE_PEOPLE,
  registerOverResponsiveLimit,
} from "@/lib/precog/continuity/register-window";
import { registerScaleWarning } from "@/lib/precog/continuity/scale-message";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import type { Criticality, KnowledgeKind, KnowledgeLevel } from "@/lib/precog/types";
import { ItemButton } from "@/components/precog/continuity/parts";
import type { RegisterEditor } from "@/components/precog/continuity/use-continuity-planner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTabName } from "@/lib/precog/presentation";

/** The editable register: add an item, page through it, and mark each person's level. */
export function RegisterGrid({
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
  const {
    importIssues,
    people,
    visiblePeople,
    visibleItems,
    itemPage,
    itemPages,
    peoplePage,
    peoplePages,
    selected,
  } = register;
  return (
    <>
      {importIssues.length > 0 && (
        <div className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-warn">Import notes</p>
            <button
              type="button"
              onClick={register.dismissImportIssues}
              className="text-xs text-subtle underline hover:text-fg pointer-coarse:min-h-11"
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
          register.addItem();
        }}
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs text-muted">
          Add a duty, task or piece of know-how
          <input
            className={inputClass}
            value={register.draftName}
            onChange={(e) => register.setDraftName(e.target.value)}
            placeholder="For example: Run payroll, Close the till, Reset the alarm"
            aria-label="New item name"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Type
          <select
            className={inputClass}
            value={register.draftKind}
            onChange={(e) => register.setDraftKind(e.target.value as KnowledgeKind)}
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
            value={register.draftCriticality}
            onChange={(e) => register.setDraftCriticality(e.target.value as Criticality)}
            aria-label="New item criticality"
          >
            {(Object.keys(CRITICALITY_LABEL) as Criticality[]).map((c) => (
              <option key={c} value={c}>
                {CRITICALITY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={!register.draftName.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </form>

      {people.length === 0 ? (
        <p className="text-sm text-muted">
          Nobody is on the active team yet. Add your people on the {tabName("map")} tab, then mark
          who can do each item here.
        </p>
      ) : (
        <div className="space-y-2">
          {registerScaleWarning(people.length, report.items.length) && (
            <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-muted">
              {registerScaleWarning(people.length, report.items.length)}
            </p>
          )}
          {registerOverResponsiveLimit(people.length, report.items.length) && (
            <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-muted">
              This register has {people.length} people and {report.items.length} items. The grid
              shows {REGISTER_PEOPLE_PAGE} people and {REGISTER_ITEM_PAGE} items at a time so the
              page stays responsive. A single page of every cell slows down past{" "}
              {REGISTER_RESPONSIVE_PEOPLE} people or {REGISTER_RESPONSIVE_ITEMS} items.
            </p>
          )}
          {(itemPages > 1 || peoplePages > 1) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {itemPages > 1 && (
                <>
                  <span>
                    Items {itemPage * REGISTER_ITEM_PAGE + 1}–
                    {Math.min(report.items.length, (itemPage + 1) * REGISTER_ITEM_PAGE)} of{" "}
                    {report.items.length}
                  </span>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 disabled:opacity-40 pointer-coarse:min-h-11"
                    disabled={itemPage === 0}
                    onClick={() => register.setItemPage(itemPage - 1)}
                  >
                    Previous items
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 disabled:opacity-40 pointer-coarse:min-h-11"
                    disabled={itemPage >= itemPages - 1}
                    onClick={() => register.setItemPage(itemPage + 1)}
                  >
                    Next items
                  </button>
                </>
              )}
              {peoplePages > 1 && (
                <>
                  <span>
                    People {peoplePage * REGISTER_PEOPLE_PAGE + 1}–
                    {Math.min(people.length, (peoplePage + 1) * REGISTER_PEOPLE_PAGE)} of{" "}
                    {people.length}
                  </span>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 disabled:opacity-40 pointer-coarse:min-h-11"
                    disabled={peoplePage === 0}
                    onClick={() => register.setPeoplePage(peoplePage - 1)}
                  >
                    Previous people
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 disabled:opacity-40 pointer-coarse:min-h-11"
                    disabled={peoplePage >= peoplePages - 1}
                    onClick={() => register.setPeoplePage(peoplePage + 1)}
                  >
                    Next people
                  </button>
                </>
              )}
            </div>
          )}
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
                  const badge = coverageBadge(row, tpl);
                  return (
                    <tr
                      key={row.item.id}
                      className={cn(
                        "border-t border-border align-top hover:bg-elevated/60",
                        isSelected && "bg-primary/5",
                      )}
                    >
                      <th
                        scope="row"
                        className={cn(
                          "sticky left-0 z-10 min-w-0 px-3 py-2 text-left font-normal",
                          isSelected ? "bg-elevated" : "bg-surface",
                        )}
                      >
                        <div className="flex min-w-0 max-w-[9rem] flex-wrap items-center gap-2 sm:max-w-xs">
                          <ItemButton
                            item={row.item}
                            selected={isSelected}
                            onSelect={register.select}
                          />
                          {trackFreshness && register.staleIds.has(row.item.id) && (
                            <Badge variant="warn">Re-confirm</Badge>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted">
                          <span>{KIND_LABEL[row.item.kind ?? "knowledge"]}</span>
                          <span>·</span>
                          <span>{CRITICALITY_LABEL[row.item.criticality]}</span>
                          {isWritten(row.item) && (
                            <>
                              <span>·</span>
                              <span>Written down</span>
                            </>
                          )}
                        </div>
                      </th>
                      <td className="px-3 py-2">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                      {visiblePeople.map((p) => {
                        const level = relationLevel(tpl.relations, p.id, row.item.id);
                        return (
                          <td key={p.id} className="px-2 py-2">
                            <select
                              className={cn(
                                inputClass,
                                "min-h-11 w-full sm:min-h-0",
                                level === "expert" || level === "proficient"
                                  ? "border-ok/40 text-ok"
                                  : level === "basic"
                                    ? "border-warn/40 text-warn"
                                    : "text-muted",
                              )}
                              value={level ?? ""}
                              onChange={(e) =>
                                register.setLevel(
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
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="rounded p-1.5 text-muted hover:bg-danger/10 hover:text-danger pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                          onClick={() => register.removeItem(row.item.id)}
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
                    <td
                      colSpan={visiblePeople.length + 3}
                      className="px-3 py-6 text-center text-muted"
                    >
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
        Only "Expert" and "Can do" count as a real stand-in.
      </p>
    </>
  );
}
