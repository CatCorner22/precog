import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Trash2, Upload, UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field-classes";
import { ChipPicker, type ChipOption } from "@/components/precog/builder/chips";
import { localDateKey } from "@/lib/precog/dates";
import { downloadCsv } from "@/lib/download";
import {
  dutiesUnknown,
  effectiveDuties,
  mergeImportedPeople,
  parsePeopleCsv,
  peopleToCsv,
  removedPeopleImpact,
} from "@/lib/precog/import/people-csv";
import type { ImportIssue } from "@/lib/precog/import/csv";
import { parseRoster } from "@/lib/precog/import/roster";
import { industryHasOwner } from "@/lib/precog/industry";
import { clamp } from "@/lib/precog/number";
import {
  JOB_CATALOG,
  JOB_FAMILY_LABEL,
  jobCatalogEntry,
  seatDuties,
} from "@/lib/precog/onboarding/job-catalog";
import { MAX_ROLE_LENGTH } from "@/lib/precog/onboarding/own-team";
import { placeholderNames } from "@/lib/precog/onboarding/add-people";
import { personLocations } from "@/lib/precog/person-location";
import { usePracticeActions, useTemplate } from "@/lib/precog/practice-context";
import { makePlannedAbsenceId } from "@/lib/precog/practice-profile";
import { OPERATING_DUTIES, type EntitlementId } from "@/lib/precog/sod/conflict-rules";
import { isOwnerRole, ownersMarked, ownsBusiness } from "@/lib/precog/sod/owner-role";
import { count, joinWithAnd, stripInvisibleControls, uniqueId, verb } from "@/lib/precog/text";
import type { Person } from "@/lib/precog/types";
import { cn } from "@/lib/utils";

/** The builder's team list: add, import, mark as left, and set each person's duties. */
export function TeamEditor({
  people,
  onChange,
}: {
  people: Person[];
  onChange: (next: Person[]) => void;
}) {
  const tpl = useTemplate();
  const { setPlannedAbsences } = usePracticeActions();
  const { roleTemplates } = tpl;
  const roleOptions = useMemo(() => Object.keys(roleTemplates), [roleTemplates]);
  const [name, setName] = useState("");
  const [role, setRole] = useState(roleOptions[0] ?? "Team member");
  const [customRole, setCustomRole] = useState("");
  const [tenure, setTenure] = useState<number | "">("");
  const [entitlements, setEntitlements] = useState<EntitlementId[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [howMany, setHowMany] = useState(1);
  const [paste, setPaste] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);
  const useCustom = role === "__custom";
  const catalogChoice = role.startsWith("catalog:") ? jobCatalogEntry(role.slice(8)) : undefined;

  /** Add several people with one catalog title and placeholder names, for a fast first pass. */
  function addSeveral() {
    if (!catalogChoice) return;
    const howManyToAdd = clamp(howMany, 1, 20);
    // Numbering continues after the highest number in use and never repeats
    // a name, so the team's own export re-imports without merging two people.
    const names = placeholderNames(
      catalogChoice.title.split(" / ")[0],
      howManyToAdd,
      people.map((p) => p.name),
    );
    const added: Person[] = [];
    const taken = new Set(people.map((p) => p.id));
    for (const personName of names) {
      const id = uniqueId("p", personName, taken, "person");
      taken.add(id);
      added.push({
        id,
        name: personName,
        role: catalogChoice.title,
        active: true,
        // The title's duties for this line of business, as onboarding seats them.
        entitlements: seatDuties(catalogChoice, tpl.id),
      });
    }
    onChange([...people, ...added]);
    toast.success(`Added ${count(howManyToAdd, catalogChoice.title)}; rename them when you can.`);
  }

  function add() {
    const finalRole = stripInvisibleControls(
      useCustom ? customRole : catalogChoice ? catalogChoice.title : role,
    ).trim();
    // A right-to-left override in a name would reverse every sentence naming them.
    const finalName = stripInvisibleControls(name).trim().slice(0, 60);
    if (!finalName || !finalRole) return;
    onChange([
      ...people,
      {
        id: uniqueId("p", finalName, new Set(people.map((p) => p.id)), "person"),
        name: finalName,
        role: finalRole.slice(0, MAX_ROLE_LENGTH),
        active: true,
        tenureYears: tenure === "" || !Number.isFinite(tenure) ? undefined : clamp(tenure, 0, 60),
        entitlements: useCustom
          ? entitlements.length
            ? entitlements
            : undefined
          : catalogChoice
            ? seatDuties(catalogChoice, tpl.id)
            : undefined,
      },
    ]);
    // The job title stays for the next person; tenure is theirs alone.
    setName("");
    setCustomRole("");
    setTenure("");
    setEntitlements([]);
    toast.success(`${finalName} added to the team`);
  }
  const canAdd =
    stripInvisibleControls(name).trim().length > 0 && (!useCustom || customRole.trim().length > 0);

  function updatePerson(id: string, patch: Partial<Person>) {
    onChange(people.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  /**
   * Marks or unmarks one person as owning the business. A team without
   * marks yet (read by title) gets everyone marked from their title first,
   * so nobody else changes seat by this one tick.
   */
  function setOwner(id: string, owns: boolean) {
    onChange(
      people.map((p) =>
        p.id === id
          ? { ...p, owner: owns }
          : typeof p.owner === "boolean"
            ? p
            : { ...p, owner: isOwnerRole(p.role) },
      ),
    );
  }
  const marked = ownersMarked(people);

  function remove(id: string) {
    const p = people.find((x) => x.id === id);
    if (!p) return;
    if (people.length <= 1) {
      toast.error("Keep at least one person on the team.");
      return;
    }
    if (!window.confirm(`Remove ${p.name}? They will be unassigned from any processes.`)) return;
    onChange(people.filter((x) => x.id !== id));
  }

  /**
   * They have left: kept on the list for history, holding no live duties.
   * The owner is then asked, once, to confirm their pay and logins are stopped.
   */
  function markAsLeft(id: string) {
    const p = people.find((x) => x.id === id);
    if (!p || !p.active) return;
    if (people.filter((x) => x.active).length <= 1) {
      toast.error("Keep at least one person working here.");
      return;
    }
    if (
      !window.confirm(
        `Mark ${p.name} as left? They stay on the list for history but no longer hold any duty or count as cover.`,
      )
    ) {
      return;
    }
    updatePerson(id, { active: false });
  }

  async function importCsv(file: File) {
    setImportIssues([]);
    let result: ReturnType<typeof parsePeopleCsv>;
    try {
      result = parsePeopleCsv(await file.text(), tpl);
    } catch {
      toast.error("Import failed", { description: "Choose a readable CSV file and try again." });
      return;
    }
    // A file that leaves people out replaces the team only when the owner
    // says so; otherwise it adds and updates, and nobody is removed.
    let replace = false;
    if (result.people.length && result.removed.length) {
      const names = result.removed.map((p) => p.name);
      const shown =
        names.slice(0, 5).join(", ") + (names.length > 5 ? ` and ${names.length - 5} more` : "");
      replace = window.confirm(
        `${count(names.length, "person on the team is", "people on the team are")} not in this file: ${shown}.\n\nOK removes them and makes the file the whole team. Cancel keeps them and only adds or updates the people in the file.`,
      );
    }
    applyImport(result, replace);
  }

  function importPaste() {
    setImportIssues([]);
    // A pasted roster adds and updates; it never removes anyone.
    applyImport(parseRoster(paste, tpl), false);
    setPaste("");
    setShowPaste(false);
  }

  function applyImport(result: ReturnType<typeof parsePeopleCsv>, replace: boolean) {
    const issues = [...result.issues];
    const impact = removedPeopleImpact(tpl, replace ? result.removed : []);
    if (replace && result.removed.length && (impact.assignments || impact.processOwnerships)) {
      const names = result.removed.map((p) => p.name);
      const shown =
        names.slice(0, 3).join(", ") + (names.length > 3 ? ` and ${names.length - 3} more` : "");
      const lost = [
        impact.assignments
          ? `${impact.assignments} who-knows-what assignment${verb(impact.assignments, "", "s")}`
          : "",
        impact.processOwnerships
          ? `${impact.processOwnerships} process owner slot${verb(impact.processOwnerships, "", "s")}`
          : "",
      ]
        .filter(Boolean)
        .join(" and ");
      issues.push({
        row: 0,
        message: `${shown} ${verb(names.length, "is", "are")} not in the file, so ${lost} were cleared. Spell names exactly as they appear on the team to keep them.`,
      });
    }
    setImportIssues(issues);
    if (!result.people.length) {
      toast.error(result.issues[0]?.message ?? "No people imported");
      return;
    }
    const merged = mergeImportedPeople(people, result.people);
    onChange(replace ? result.people : merged.people);
    recordOnLeave(result.onLeave ?? []);
    const removed = replace ? result.removed.length : 0;
    const recognised = result.titles.filter((t) => t.catalogTitle).length;
    const counts = [
      `${merged.added.length} added`,
      `${merged.updated.length} updated`,
      `${result.people.length - merged.added.length - merged.updated.length} unchanged`,
      `${removed} removed`,
    ].join(", ");
    toast.success(
      `Read ${count(result.people.length, "person", "people")}: ${counts}${
        recognised
          ? `; ${recognised} job ${verb(recognised, "title", "titles")} read from the catalog`
          : ""
      }${issues.length ? `; ${count(issues.length, "issue")} to check below` : ""}`,
    );
  }

  /**
   * People the roster lists as on leave are recorded as out today, as
   * onboarding does: the roster gives no return date, and the continuity
   * planner's "Still out tomorrow" extends it. Someone already recorded as
   * out today is left as is.
   */
  function recordOnLeave(personIds: readonly string[]) {
    if (personIds.length === 0) return;
    const today = localDateKey(new Date());
    setPlannedAbsences((current) => {
      const outToday = new Set(
        current
          .filter((a) => a.industry === tpl.id && a.from <= today && a.to >= today)
          .map((a) => a.personId),
      );
      const added = personIds
        .filter((personId) => !outToday.has(personId))
        .map((personId) => ({
          id: makePlannedAbsenceId(),
          personId,
          industry: tpl.id,
          from: today,
          to: today,
          note: "On leave in the imported roster; the return date was not given.",
        }));
      return added.length ? [...current, ...added] : current;
    });
  }

  function exportCsv() {
    // Duties are written as the conflict engine reads them, so a person whose
    // duties come from their role re-imports with the same duties.
    downloadCsv("precog-team.csv", peopleToCsv(people, roleTemplates));
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5">
      <p className="text-xs text-muted">
        Each person&apos;s job title sets their usual duties, and the duty-conflict check reads
        those duties. Pick the closest title, then adjust the duties if they differ.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => csvInputRef.current?.click()}>
          <Upload className="size-3.5" /> Import CSV
        </Button>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importCsv(file);
            event.target.value = "";
          }}
        />
        <Button size="sm" variant="secondary" onClick={() => setShowPaste((v) => !v)}>
          <Upload className="size-3.5" /> Paste roster
        </Button>
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          <Download className="size-3.5" /> Export CSV
        </Button>
        {importIssues.length > 0 && (
          <button
            type="button"
            onClick={() => setImportIssues([])}
            className="text-xs text-subtle underline hover:text-fg"
          >
            Dismiss issues
          </button>
        )}
      </div>
      {showPaste && (
        <div className="space-y-1.5 rounded-md border border-border bg-elevated px-2 py-1.5">
          <p className="text-xs text-muted">
            Paste a worker export from Workday, SAP SuccessFactors, Oracle HCM, or your payroll
            provider (header row included), or one person per line as{" "}
            <span className="font-mono">Name, Title</span>. Common titles get their usual duties
            from the catalog; check each person afterwards.
          </p>
          <textarea
            className={cn(inputCls, "min-h-24 w-full font-mono text-xs")}
            aria-label="Pasted roster"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={
              "Employee Name,Job Title,Department,Status\nAna Ruiz,Office Manager,Admin,Active"
            }
          />
          <Button size="sm" onClick={importPaste} disabled={!paste.trim()}>
            Import pasted roster
          </Button>
        </div>
      )}
      {importIssues.length > 0 && (
        <div className="rounded-md border border-warn/30 bg-warn/5 px-2 py-1.5 text-xs">
          <p className="font-medium text-warn">Import issues</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
            {importIssues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.row}-${index}`}>
                {issue.row === 0 ? "File" : `Row ${issue.row}`}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="space-y-1">
        {people.map((p) => {
          const editing = editingId === p.id;
          return (
            <li
              key={p.id}
              className="rounded-md border border-border bg-elevated px-2 py-1.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className="min-w-0 flex-1 truncate"
                  title={[p.name, p.role, p.department, p.employeeId && `ID ${p.employeeId}`]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <span className={cn("font-medium", p.active ? "text-fg" : "text-subtle")}>
                    {p.name}
                  </span>
                  <span className="text-subtle"> · {p.role}</span>
                  {p.department && (
                    <span className="text-subtle"> · {joinWithAnd(personLocations(p))}</span>
                  )}
                  {p.employeeId && <span className="text-subtle"> · ID {p.employeeId}</span>}
                  {p.active && p.lastDay && (
                    <span className="text-subtle"> · last day {p.lastDay}</span>
                  )}
                  {dutiesUnknown(p, roleTemplates) && (
                    <span className="text-warn"> · needs duties</span>
                  )}
                </span>
                {!p.active && (
                  <span
                    className="shrink-0 rounded border border-border px-1 text-xs text-subtle"
                    title="Marked as left: kept for history, holds no live duties"
                  >
                    left
                  </span>
                )}
                {p.active && (
                  <button
                    type="button"
                    onClick={() => markAsLeft(p.id)}
                    className="text-subtle hover:text-warn"
                    aria-label={`Mark ${p.name} as left`}
                    title="Mark as left"
                  >
                    <UserMinus className="size-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditingId(editing ? null : p.id)}
                  className="text-subtle hover:text-primary"
                >
                  {editing ? "Done" : "Duties"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="text-subtle hover:text-danger"
                  aria-label={`Remove ${p.name}`}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
              {editing && industryHasOwner(tpl.id) && (
                <label className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={ownsBusiness(p, marked)}
                    onChange={(e) => setOwner(p.id, e.target.checked)}
                  />
                  {p.name} owns the business
                </label>
              )}
              {editing && (
                <div className="mt-2">
                  <ChipPicker
                    label="Duties"
                    options={DUTY_OPTIONS}
                    // The duties the conflict engine reads for this person,
                    // their role's when none are set, so a tick edits that set.
                    selected={effectiveDuties(p, roleTemplates)}
                    onToggle={(id) => {
                      const next = toggleIn(effectiveDuties(p, roleTemplates), id);
                      updatePerson(p.id, {
                        // Clearing every duty keeps "no duties" rather than
                        // falling back to the role's.
                        entitlements: next.length
                          ? (next as EntitlementId[])
                          : ["view_reports_only"],
                        // Ticked by the owner: no longer the job title's guess.
                        dutiesFromTitle: undefined,
                      });
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="grid gap-1.5 @sm:grid-cols-[1fr_1fr_64px]">
        <input
          className={inputCls}
          aria-label="Name"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className={inputCls}
          aria-label="Job title"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <optgroup label="Roles in this line of business">
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </optgroup>
          {(Object.keys(JOB_FAMILY_LABEL) as (keyof typeof JOB_FAMILY_LABEL)[]).map((family) => (
            <optgroup key={family} label={JOB_FAMILY_LABEL[family]}>
              {JOB_CATALOG.filter((j) => j.family === family).map((j) => (
                <option key={j.id} value={`catalog:${j.id}`}>
                  {j.title}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="__custom">Other role…</option>
        </select>
        <input
          className={inputCls}
          type="number"
          min={0}
          max={60}
          step={0.5}
          value={tenure}
          onChange={(e) => setTenure(e.target.value === "" ? "" : Number(e.target.value))}
          aria-label="Years here (leave blank if unknown)"
          placeholder="Years"
          title="Years here — leave blank if unknown"
        />
      </div>
      {catalogChoice && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted">
            {catalogChoice.description} {catalogChoice.note} Duties can be changed after adding.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              className={cn(inputCls, "w-16")}
              type="number"
              min={1}
              max={20}
              value={howMany}
              onChange={(e) => setHowMany(clamp(Number(e.target.value) || 1, 1, 20))}
              aria-label="How many to add"
            />
            <Button size="sm" variant="secondary" onClick={addSeveral}>
              <Plus className="size-3.5" /> Add {howMany} with placeholder names
            </Button>
          </div>
        </div>
      )}
      {useCustom && (
        <>
          <input
            className={inputCls}
            aria-label="Job title"
            placeholder="Job title"
            value={customRole}
            onChange={(e) => setCustomRole(e.target.value)}
          />
          <ChipPicker
            label="Duties (the duty-conflict check reads these)"
            options={DUTY_OPTIONS}
            selected={entitlements}
            onToggle={(id) => setEntitlements((cur) => toggleIn(cur, id as EntitlementId))}
          />
        </>
      )}
      <Button size="sm" variant="secondary" onClick={add} disabled={!canAdd}>
        <Plus className="size-3.5" /> Add team member
      </Button>
    </div>
  );
}

/** Every duty the owner can tick, shortened to its first wording; the full label shows on hover. */
const DUTY_OPTIONS: ChipOption[] = OPERATING_DUTIES.map((e) => ({
  id: e.id,
  label: e.label.split(" / ")[0].slice(0, 28),
  title: e.label,
}));

function toggleIn<T extends string>(list: readonly T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
