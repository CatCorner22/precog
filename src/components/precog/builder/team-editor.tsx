import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field-classes";
import { ChipPicker, type ChipOption } from "@/components/precog/builder/chips";
import {
  hasLeftBy,
  raisesLeaverCheck,
  recordLastDay,
  restorePerson,
} from "@/lib/precog/continuity/access-removal";
import { formatDay, isCalendarDate, localDateKey } from "@/lib/precog/dates";
import { downloadCsv } from "@/lib/download";
import { householdMark, MAX_HOUSEHOLD_MARK } from "@/lib/precog/import/people-backup";
import {
  decodeTeamFile,
  dutiesUnknown,
  effectiveDuties,
  mergeImportedPeople,
  parsePeopleCsv,
  peopleToCsv,
  removedPeopleImpact,
  type PeopleImportResult,
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
import { MAX_ROLE_LENGTH } from "@/lib/precog/onboarding/own-business";
import { placeholderNames } from "@/lib/precog/onboarding/add-people";
import { personLocations } from "@/lib/precog/person-location";
import { usePracticeActions, useTemplate } from "@/lib/precog/practice-context";
import { makePlannedAbsenceId } from "@/lib/precog/practice-profile";
import { OPERATING_DUTIES, type EntitlementId } from "@/lib/precog/sod/conflict-rules";
import { isOwnerRole, ownersMarked, ownsBusiness } from "@/lib/precog/sod/owner-role";
import { confirmTitleDutiesFor } from "@/lib/precog/sod/title-duties";
import { count, joinWithAnd, stripInvisibleControls, uniqueId, verb } from "@/lib/precog/text";
import { getIndustryTemplate } from "@/lib/precog/templates";
import type { Person } from "@/lib/precog/types";
import { cn } from "@/lib/utils";

/**
 * The tag on a person whose duties are still their job title's usual ones,
 * and the button that confirms them as they stand. Confirming clears that
 * one person's mark; the findings then stop counting them as a guess.
 */
export function ConfirmTitleDuties({
  people,
  person,
  onChange,
}: {
  people: Person[];
  person: Person;
  onChange: (next: Person[]) => void;
}) {
  return (
    <>
      <span className="shrink-0 rounded border border-warn/40 px-1 text-xs text-warn">
        Usual duties for the title
      </span>
      <button
        type="button"
        onClick={() => {
          onChange(confirmTitleDutiesFor(people, person.id));
          toast.success(`${person.name}'s duties confirmed.`);
        }}
        className={cn("shrink-0 text-subtle hover:text-primary", ROW_CONTROL)}
        aria-label={`Confirm duties for ${person.name}`}
      >
        Confirm duties
      </button>
    </>
  );
}

/** The builder's team list: add, import, record who left, and set each person's duties. */
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
  const [leaving, setLeaving] = useState<{ id: string; lastDay: string } | null>(null);
  // The team as it stands now, for an Undo pressed after other edits.
  const latestPeople = useRef(people);
  useEffect(() => {
    latestPeople.current = people;
  }, [people]);
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
    if (
      !window.confirm(
        `Remove ${p.name}? Precog also removes their name from every process. You cannot undo this.`,
      )
    )
      return;
    onChange(people.filter((x) => x.id !== id));
  }

  /**
   * The owner gave the last day in the inline form: recorded, with Undo.
   * The owner is then asked, once, to confirm their pay and logins are stopped.
   */
  function confirmLeaving() {
    if (!leaving) return;
    const done = recordLeaving({
      people,
      personId: leaving.id,
      lastDay: leaving.lastDay,
      today: localDateKey(new Date()),
      onChange,
      latest: () => latestPeople.current,
    });
    if (done) setLeaving(null);
  }

  async function importCsv(file: File) {
    setImportIssues([]);
    let result: ReturnType<typeof parsePeopleCsv>;
    try {
      result = parsePeopleCsv(decodeTeamFile(new Uint8Array(await file.arrayBuffer())), tpl);
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
          ? `${impact.assignments} register mark${verb(impact.assignments, "", "s")}`
          : "",
        impact.processOwnerships
          ? `${impact.processOwnerships} process owner slot${verb(impact.processOwnerships, "", "s")}`
          : "",
      ]
        .filter(Boolean)
        .join(" and ");
      issues.push({
        row: 0,
        message: `${shown} ${verb(names.length, "is", "are")} not in the file, so Precog cleared ${lost}. Spell names exactly as they appear on the team to keep them.`,
      });
    }
    setImportIssues(issues);
    if (!result.people.length) {
      toast.error(result.issues[0]?.message ?? "No people imported");
      return;
    }
    putImportedTeam({ people, result, replace, issueCount: issues.length, onChange });
    recordOnLeave(result.onLeave ?? []);
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
          note: "On leave in the imported roster; the roster gives no return date.",
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
        A job title sets the person&apos;s usual duties, and the duty-conflict check reads them.
        Pick the closest title, then adjust the duties.
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
            Paste a roster exported from Workday, SAP SuccessFactors, Oracle HCM, or your payroll
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
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className="min-w-0 flex-[1_1_12rem] truncate"
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
                  {p.householdKey && (
                    <span className="text-subtle"> · household {p.householdKey}</span>
                  )}
                  {p.lastDay && (
                    <span className="text-subtle"> · last day {formatDay(p.lastDay)}</span>
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
                {p.active && p.dutiesFromTitle === true && (
                  <ConfirmTitleDuties people={people} person={p} onChange={onChange} />
                )}
                {p.active && (
                  <button
                    type="button"
                    onClick={() =>
                      // No date is filled in for the owner: a default would be saved by a quick press.
                      setLeaving(
                        leaving?.id === p.id ? null : { id: p.id, lastDay: p.lastDay ?? "" },
                      )
                    }
                    className={cn(
                      "shrink-0 rounded-md border border-border bg-panel px-2 py-0.5 text-muted hover:border-warn hover:text-warn",
                      ROW_CONTROL,
                    )}
                    aria-expanded={leaving?.id === p.id}
                    aria-label={`Mark ${p.name} as left…`}
                  >
                    Mark as left…
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditingId(editing ? null : p.id)}
                  className={cn("shrink-0 text-subtle hover:text-primary", ROW_CONTROL)}
                  aria-expanded={editing}
                  aria-label={editing ? `Done with ${p.name}'s duties` : `Duties of ${p.name}`}
                >
                  {editing ? "Done" : "Duties"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className={cn(
                    "ml-1 shrink-0 text-subtle hover:text-danger pointer-coarse:min-w-11",
                    ROW_CONTROL,
                  )}
                  aria-label={`Remove ${p.name}`}
                  title={`Remove ${p.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {p.active && leaving?.id === p.id && (
                <LeavingForm
                  person={p}
                  lastDay={leaving.lastDay}
                  today={localDateKey(new Date())}
                  raisesCheck={raisesLeaverCheck(p, getIndustryTemplate(tpl.id).people)}
                  onLastDay={(lastDay) => setLeaving({ id: p.id, lastDay })}
                  onConfirm={confirmLeaving}
                  onCancel={() => setLeaving(null)}
                />
              )}
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
                <label className="mt-2 block text-xs text-muted">
                  Household mark
                  <HouseholdMarkInput
                    value={p.householdKey}
                    onCommit={(householdKey) => updatePerson(p.id, { householdKey })}
                  />
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
            {catalogChoice.description} {catalogChoice.note} You can change the duties after you add
            the person.
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
        <Plus className="size-3.5" /> Add a person
      </Button>
    </div>
  );
}

/** A row control at least 44px tall on a touch screen. */
const ROW_CONTROL =
  "pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center";

/**
 * Asks for someone's last day before recording that they left. The field
 * starts empty, so nothing is saved until the owner picks a day or presses
 * Today. Today or an earlier day marks them as left; a later day keeps them
 * at work on notice.
 */
export function LeavingForm({
  person,
  lastDay,
  today,
  raisesCheck = true,
  onLastDay,
  onConfirm,
  onCancel,
}: {
  person: Person;
  lastDay: string;
  today: string;
  /** False for a sample person, whose leaving raises no pay-and-sign-ins checklist. */
  raisesCheck?: boolean;
  onLastDay: (lastDay: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const valid = isCalendarDate(lastDay);
  const later = valid && !hasLeftBy(lastDay, today);
  const fieldId = `last-day-${person.id}`;
  const hintId = `last-day-hint-${person.id}`;
  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-border bg-panel px-2 py-1.5">
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={fieldId} className="text-xs text-muted">
          Last day
        </label>
        <input
          id={fieldId}
          type="date"
          className={cn(inputCls, "w-auto")}
          value={lastDay}
          aria-describedby={hintId}
          onChange={(e) => onLastDay(e.target.value)}
        />
        <Button size="sm" variant="secondary" onClick={() => onLastDay(today)}>
          Today
        </Button>
        <Button size="sm" disabled={!valid} aria-describedby={hintId} onClick={onConfirm}>
          {later ? "Record last day" : `Mark ${person.name} as left`}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p id={hintId} className="text-xs text-muted">
        {!valid
          ? `Choose ${person.name}'s last day, or press Today.`
          : later
            ? `${person.name} keeps working and keeps their duties until then.`
            : `${person.name} stays on the list for history but no longer holds any duty or counts as a stand-in. ${
                raisesCheck
                  ? "Then check their pay and sign-ins below the team list."
                  : "On your own business, a checklist of pay and sign-ins to remove then appears below the team list."
              }`}
      </p>
    </div>
  );
}

/**
 * Records someone's last day, says so, and offers Undo, which puts that one
 * person back as they were and leaves any other change on the team. Returns
 * false, changing nothing, when they are the last person working here.
 */
// eslint-disable-next-line react-refresh/only-export-components -- tested on its own, next to the editor that calls it.
export function recordLeaving({
  people,
  personId,
  lastDay,
  today,
  onChange,
  latest,
}: {
  people: Person[];
  personId: string;
  lastDay: string;
  today: string;
  onChange: (next: Person[]) => void;
  /** The team when Undo is pressed. */
  latest: () => Person[];
}): boolean {
  const prior = people.find((p) => p.id === personId);
  if (!prior || !prior.active || !isCalendarDate(lastDay)) return false;
  const gone = hasLeftBy(lastDay, today);
  if (gone && people.filter((p) => p.active).length <= 1) {
    toast.error("Keep at least one person working here.");
    return false;
  }
  onChange(recordLastDay(people, personId, lastDay, today));
  toast.success(
    gone
      ? `${prior.name} marked as left, last day ${formatDay(lastDay)}.`
      : `${prior.name}'s last day is ${formatDay(lastDay)}.`,
    {
      duration: 15_000,
      action: {
        label: "Undo",
        onClick: () => {
          onChange(restorePerson(latest(), prior));
          toast.success(`${prior.name} is back on the team as before.`);
        },
      },
    },
  );
  return true;
}

/**
 * Puts an imported team in place and says what changed. An import that
 * replaced the team offers Undo, which puts back the team as it was before
 * the import.
 */
// eslint-disable-next-line react-refresh/only-export-components -- tested on its own, next to the editor that calls it.
export function putImportedTeam({
  people,
  result,
  replace,
  issueCount,
  onChange,
}: {
  people: Person[];
  result: PeopleImportResult;
  replace: boolean;
  issueCount: number;
  onChange: (next: Person[]) => void;
}): void {
  const before = people;
  const merged = mergeImportedPeople(people, result.people);
  onChange(replace ? result.people : merged.people);
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
    }${issueCount ? `; ${count(issueCount, "issue")} to check below` : ""}`,
    replace
      ? {
          duration: 15_000,
          action: {
            label: "Undo",
            onClick: () => {
              onChange(before);
              toast.success("The team is back as it was before the import.");
            },
          },
        }
      : undefined,
  );
}

/**
 * The household mark field. It keeps what the owner types, spaces included,
 * and saves the mark trimmed when they leave the field or stop typing for
 * 350 ms. A mark changed elsewhere (an undo, an import) replaces the text.
 */
export function HouseholdMarkInput({
  value,
  onCommit,
}: {
  value: string | undefined;
  onCommit: (next: string | undefined) => void;
}) {
  const saved = value ?? "";
  const [draft, setDraft] = useState(saved);
  const [seen, setSeen] = useState(saved);
  if (saved !== seen) {
    setSeen(saved);
    // The owner's own save comes back trimmed; keep their text as typed.
    if ((householdMark(draft) ?? "") !== saved) setDraft(saved);
  }

  useEffect(() => {
    if ((householdMark(draft) ?? "") === saved) return;
    const timer = setTimeout(() => onCommit(householdMark(draft)), 350);
    return () => clearTimeout(timer);
  }, [draft, saved, onCommit]);

  return (
    <input
      className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg"
      value={draft}
      placeholder="Same mark means one household"
      maxLength={MAX_HOUSEHOLD_MARK}
      onChange={(e) => setDraft(e.target.value.slice(0, MAX_HOUSEHOLD_MARK))}
      onBlur={() => {
        const next = householdMark(draft);
        if ((next ?? "") !== saved) onCommit(next);
      }}
    />
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
