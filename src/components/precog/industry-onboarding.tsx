import { useEffect, useState } from "react";
import { INDUSTRIES, type IndustryId } from "@/lib/precog/industry";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { CASE_LIBRARY, sectorsForIndustry } from "@/lib/precog/evidence";
import { usePractice } from "@/lib/precog/practice-context";
import { makePlannedAbsenceId } from "@/lib/precog/practice-profile";
import { localDateKey } from "@/lib/precog/decisions/follow-through";
import {
  CORE_DUTIES,
  GRID_DUTY_HEADING,
  OWN_TEAM_MAX,
  addableDuties,
  rowsForJobTitle,
  buildOwnTeam,
  coreDutiesForTitle,
  coreDutyLabel,
  extraDuties,
  firstUnnamedWithDuties,
  isOwnerTitle,
  onLeavePersonIds,
  ownerRow,
  rowsKeptForAdding,
  type OwnTeamRow,
} from "@/lib/precog/onboarding/own-team";
import type { EntitlementId } from "@/lib/precog/sod/conflict-rules";
import {
  JOB_CATALOG,
  JOB_FAMILY_LABEL,
  entitlementsForTitle,
  type JobFamily,
} from "@/lib/precog/onboarding/job-catalog";
import { JobCatalogSheet } from "@/components/precog/job-catalog-sheet";
import { parseRoster } from "@/lib/precog/import/roster";
import type { PeopleImportIssue } from "@/lib/precog/import/people-csv";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  ChefHat,
  Building2,
  Plus,
  ShoppingBag,
  Stethoscope,
  Trash2,
} from "lucide-react";

const ICONS: Record<IndustryId, typeof Stethoscope> = {
  dental: Stethoscope,
  retail: ShoppingBag,
  professional_services: Briefcase,
  restaurant: ChefHat,
  general: Building2,
};

const inputCls =
  "rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const EMPTY_ROW = (role = ""): OwnTeamRow => ({ name: "", role, duties: [] });

const sameDuties = (a: readonly EntitlementId[], b: readonly EntitlementId[]) =>
  a.length === b.length && a.every((d) => b.includes(d));

const nameInputId = (index: number) => `onboarding-person-${index + 1}-name`;

/**
 * Adds a duty that is not a grid column to one row: pick it, then press Add.
 * A select alone would add a duty on every arrow key in some browsers.
 */
function AddDutyControl({
  who,
  duties,
  onAdd,
}: {
  who: string;
  duties: readonly EntitlementId[];
  onAdd: (duty: EntitlementId) => void;
}) {
  const options = addableDuties(duties);
  const [pick, setPick] = useState<EntitlementId | "">("");
  if (options.length === 0) return null;
  const chosen = pick && options.includes(pick) ? pick : "";
  return (
    <div className="mt-1 flex max-w-[11rem] items-center gap-1">
      <select
        className={cn(inputCls, "min-w-0 flex-1 px-1 py-0.5 text-[10px]")}
        aria-label={`Other duty for ${who}`}
        value={chosen}
        onChange={(e) => setPick(e.target.value as EntitlementId | "")}
      >
        <option value="">Add a duty…</option>
        {options.map((duty) => (
          <option key={duty} value={duty}>
            {coreDutyLabel(duty)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="rounded-md border border-border bg-panel px-1.5 py-0.5 text-[10px] text-muted hover:border-border-strong hover:text-fg disabled:opacity-50"
        aria-label={`Add the chosen duty to ${who}`}
        disabled={!chosen}
        onClick={() => {
          if (!chosen) return;
          onAdd(chosen);
          setPick("");
        }}
      >
        Add
      </button>
    </div>
  );
}

/**
 * The grid in progress, kept in this tab's session storage so a reload does
 * not throw away names the owner has typed. Cleared when they finish or load
 * the sample business.
 */
const DRAFT_KEY = "precog.onboarding-draft.v1";
interface OnboardingDraft {
  step: "industry" | "team";
  selected: IndustryId;
  businessName: string;
  rows: OwnTeamRow[];
}
function readDraft(): OnboardingDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as OnboardingDraft;
    return draft && Array.isArray(draft.rows) && typeof draft.businessName === "string"
      ? draft
      : null;
  } catch {
    return null;
  }
}
function writeDraft(draft: OnboardingDraft | null) {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage refused (private mode, quota): the draft lives only in memory.
  }
}

/**
 * First visit. Step one picks the line of business; step two takes the
 * owner's own business name, people, and who does the money duties,
 * so the first screen they see is about their team. "Explore a sample"
 * stays as the second path.
 */
export function IndustryOnboarding() {
  const { completeOnboarding, startOwnBusiness, setPlannedAbsences } = usePractice();
  const [selected, setSelected] = useState<IndustryId>("dental");
  const [step, setStep] = useState<"industry" | "team">("industry");
  const [businessName, setBusinessName] = useState("");
  const [rows, setRows] = useState<OwnTeamRow[]>([ownerRow(), EMPTY_ROW(""), EMPTY_ROW("")]);

  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState("");
  const [pasteIssues, setPasteIssues] = useState<PeopleImportIssue[]>([]);
  const [finishNote, setFinishNote] = useState("");
  const [restored, setRestored] = useState(false);
  // Restore after mount, so the server-rendered dialog and the first client
  // render agree; then keep the draft in step with every edit.
  useEffect(() => {
    const draft = readDraft();
    if (draft && draft.rows.some((r) => r.name.trim().length > 0)) {
      setSelected(draft.selected);
      setBusinessName(draft.businessName);
      setRows(draft.rows);
      setStep(draft.step);
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    const hasWork = businessName.trim().length > 0 || rows.some((r) => r.name.trim().length > 0);
    writeDraft(hasWork ? { step, selected, businessName, rows } : null);
  }, [restored, step, selected, businessName, rows]);
  const [quickTitle, setQuickTitle] = useState(JOB_CATALOG[0]?.id ?? "");
  const [quickCount, setQuickCount] = useState(1);
  const quickEntry = JOB_CATALOG.find((j) => j.id === quickTitle);

  /**
   * Add N people with one job title and its usual duties; names are
   * placeholders. The unnamed Owner row stays unless the new rows are owners.
   */
  function addByTitle() {
    if (!quickEntry) return;
    setRows((current) => {
      const { kept } = rowsKeptForAdding(current, quickEntry.id === "owner");
      const sameTitle = kept.filter((r) => r.role === quickEntry.title).length;
      return [...kept, ...rowsForJobTitle(quickEntry, quickCount, sameTitle, selected)].slice(
        0,
        OWN_TEAM_MAX,
      );
    });
  }
  const industry = INDUSTRIES.find((i) => i.id === selected);
  const namedRows = rows.filter((r) => r.name.trim().length > 0);

  /**
   * When a role is typed, tick what that title usually holds. A later role
   * change re-ticks as long as the ticks are still the earlier suggestion or
   * empty; ticks the owner set by hand stay.
   */
  function suggestDuties(index: number) {
    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        const role = row.role.trim();
        if (!role || role === row.suggestedFor) return row;
        const previous = row.suggestedFor ? coreDutiesForTitle(row.suggestedFor, selected) : [];
        const untouched = row.duties.length === 0 || sameDuties(row.duties, previous);
        return untouched
          ? { ...row, duties: coreDutiesForTitle(role, selected), suggestedFor: role }
          : row;
      }),
    );
  }

  /** Fill the grid from a pasted HR or payroll export, or a plain "Name, Title" list. */
  function fillFromPaste() {
    const tpl = getIndustryTemplate(selected);
    const result = parseRoster(paste, tpl);
    const activePeople = result.people.filter((p) => p.active);
    const onLeave = new Set(result.onLeave ?? []);
    const incoming: OwnTeamRow[] = activePeople.map((p) => ({
      name: p.name,
      role: p.role,
      // The importer reads each title through the catalog of common jobs. A
      // title it could not read leaves the duties for the owner to tick.
      duties: (p.entitlements ?? entitlementsForTitle(p.role, selected)).filter(
        (d): d is EntitlementId => d !== "view_reports_only",
      ),
      ...(p.tenureYears !== undefined ? { tenureYears: p.tenureYears } : {}),
      ...(p.department ? { department: p.department } : {}),
      suggestedFor: p.role,
      ...(onLeave.has(p.id) ? { onLeave: true } : {}),
    }));
    const inactive = result.people.length - activePeople.length;
    setPasteIssues(result.issues);
    if (incoming.length === 0) {
      setPasteNote(
        result.people.length > 0
          ? `All ${result.people.length} people in the paste are marked inactive, so none was added.`
          : (result.issues[0]?.message ?? "No names found. One person per line: Name, Title."),
      );
      return;
    }
    // The unnamed Owner row stays at the top unless the paste has its own owner.
    const { kept, ownerRow: owner } = rowsKeptForAdding(
      rows,
      incoming.some((r) => isOwnerTitle(r.role)),
    );
    const room = Math.max(0, OWN_TEAM_MAX - kept.length);
    const added = incoming.slice(0, room);
    const notAdded = incoming.length - added.length;
    setRows([...kept, ...added]);
    setFinishNote("");
    const addedNames = new Set(added.map((r) => r.name));
    const titlesAdded = result.titles.filter((t) => addedNames.has(t.name));
    const recognised = titlesAdded.filter((t) => t.catalogTitle).length;
    const unmatched = titlesAdded.length - recognised;
    const away = added.filter((r) => r.onLeave).map((r) => r.name);
    setPasteNote(
      [
        notAdded > 0
          ? `Added ${added.length} of ${incoming.length} people; ${notAdded} not added because this grid holds ${OWN_TEAM_MAX}. Add them later in Who controls what.`
          : `Added ${added.length} ${added.length === 1 ? "person" : "people"}.`,
        `${recognised} ${recognised === 1 ? "title" : "titles"} recognised and duties ticked from the catalog${
          unmatched ? `; ${unmatched} not recognised, tick their duties below` : ""
        }${inactive ? `; ${inactive} inactive ${inactive === 1 ? "person" : "people"} left out` : ""}.`,
        owner === "kept"
          ? "The Owner row stays at the top with its duties ticked: type your name in it."
          : owner === "replaced"
            ? "The owner in your paste takes the place of the empty Owner row."
            : "",
        away.length
          ? `${away.join(", ")} ${away.length === 1 ? "is" : "are"} on leave: kept on the team and recorded as out today in Who knows what when you finish; extend the absence there until they return.`
          : "",
        "Check every row: a title is a starting point, not a fact about your business.",
      ]
        .filter(Boolean)
        .join(" "),
    );
    setPaste("");
  }

  function updateRow(index: number, patch: Partial<OwnTeamRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    if (finishNote) setFinishNote("");
  }
  function addDuty(index: number, duty: EntitlementId) {
    setRows((current) =>
      current.map((row, i) =>
        i === index && !row.duties.includes(duty) ? { ...row, duties: [...row.duties, duty] } : row,
      ),
    );
  }
  function toggleDuty(index: number, duty: EntitlementId) {
    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        const has = row.duties.includes(duty);
        return {
          ...row,
          duties: has ? row.duties.filter((d) => d !== duty) : [...row.duties, duty],
        };
      }),
    );
  }
  function finish() {
    // A row with duties ticked and no name would be dropped with its duties: ask for the name.
    const unnamed = firstUnnamedWithDuties(rows);
    if (unnamed >= 0) {
      const role = rows[unnamed].role.trim();
      setFinishNote(
        `Person ${unnamed + 1}${role ? ` (${role})` : ""} has duties ticked but no name. Type a name, or remove the row.`,
      );
      document.getElementById(nameInputId(unnamed))?.focus();
      return;
    }
    const people = buildOwnTeam(rows);
    if (people.length === 0) return;
    const onLeave = onLeavePersonIds(rows);
    writeDraft(null);
    startOwnBusiness({ industry: selected, practiceName: businessName, people });
    if (onLeave.length > 0) {
      // The roster gives no return date, so the absence covers today; the
      // continuity planner's "Still out tomorrow" extends it.
      const today = localDateKey(new Date());
      setPlannedAbsences((current) => [
        ...current,
        ...onLeave.map((personId) => ({
          id: makePlannedAbsenceId(),
          personId,
          industry: selected,
          from: today,
          to: today,
          note: "On leave in the pasted roster; the return date was not given.",
        })),
      ]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="industry-onboarding-title"
    >
      <Card className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto border-border bg-surface shadow-2xl">
        {step === "industry" ? (
          <>
            <CardHeader>
              <Badge variant="accent" className="w-fit">
                Welcome to Precog Pioneer
              </Badge>
              <CardTitle id="industry-onboarding-title" className="text-xl sm:text-2xl">
                What kind of business is this?
              </CardTitle>
              <CardDescription>
                Pick the closest line of business. Next you enter your own team, or explore a sample
                first. You can switch industry anytime in Business profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {INDUSTRIES.map((ind) => {
                  const Icon = ICONS[ind.id];
                  const tpl = getIndustryTemplate(ind.id);
                  const active = selected === ind.id;
                  // How many prosecuted cases the library holds for this line
                  // of business. The general template counts the whole library.
                  const sectors = sectorsForIndustry(ind.id);
                  const caseCount = sectors.includes("any")
                    ? CASE_LIBRARY.length
                    : CASE_LIBRARY.filter((c) => sectors.includes(c.sector)).length;
                  const casePhrase = sectors.includes("any")
                    ? `${caseCount} prosecuted cases across every line of business`
                    : `${caseCount} prosecuted ${caseCount === 1 ? "case" : "cases"} in this line of business`;
                  return (
                    <button
                      key={ind.id}
                      type="button"
                      onClick={() => setSelected(ind.id)}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        active
                          ? "border-primary/50 bg-primary/10 glow-primary"
                          : "border-border bg-elevated hover:border-border-strong",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-lg",
                            active ? "bg-primary/20 text-primary" : "bg-panel text-muted",
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium">{ind.label}</p>
                          <p className="mt-0.5 text-xs text-muted">{ind.tagline}</p>
                          <p className="mt-2 text-[10px] text-subtle">
                            Sample: {tpl.processes.length} processes, {tpl.people.length} people
                          </p>
                          <p className="mt-0.5 text-[10px] text-subtle">{casePhrase}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button className="w-full" onClick={() => setStep("team")} autoFocus>
                  Set up my own business
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => {
                    writeDraft(null);
                    completeOnboarding(selected);
                  }}
                >
                  Load {industry?.label} demo
                </Button>
              </div>
              <p className="text-center text-[11px] text-subtle">
                The demo is a fictional team. Every finding on it says so until you enter your own.
              </p>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <Badge variant="accent" className="w-fit">
                {industry?.label}
              </Badge>
              <CardTitle id="industry-onboarding-title" className="text-xl sm:text-2xl">
                Your business and who does the money work
              </CardTitle>
              <CardDescription>
                Name your people and tick the money duties each one handles today: enough to find
                the arrangements that let one person take money and hide it. Paste a roster from
                your HR or payroll system and common job titles fill the duties for you; a
                title&rsquo;s other duties appear as small tags you can remove, and &ldquo;Add a
                duty&rdquo; under each role adds any other. You can refine everything later in Who
                controls what.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Business name</span>
                <input
                  className={cn(inputCls, "max-w-md")}
                  placeholder={industry?.demoName ? `e.g. ${industry.demoName}` : "Business name"}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  maxLength={80}
                />
              </label>

              <details className="rounded-xl border border-border bg-elevated/50 p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Paste your team from Workday, SAP, Oracle, or your payroll export
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted">
                    Paste the worker list as exported, header row included, or one person per line
                    as <span className="font-mono">Name, Title</span>. Titles such as Bookkeeper,
                    Office Manager, AP Specialist, or Cashier are read from a catalog of common jobs
                    and their usual duties are ticked. People marked inactive are left out.
                  </p>
                  <textarea
                    className={cn(inputCls, "min-h-28 w-full font-mono text-xs")}
                    aria-label="Pasted roster"
                    placeholder={
                      "Ana Ruiz, Office Manager\nBen Ochoa, Bookkeeper\nCal Diaz, Front Desk"
                    }
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={fillFromPaste} disabled={!paste.trim()}>
                      Fill the table
                    </Button>
                    {pasteNote && <p className="text-xs text-muted">{pasteNote}</p>}
                  </div>
                  {pasteIssues.length > 0 && (
                    <ul
                      className="list-disc space-y-0.5 pl-4 text-xs text-muted"
                      aria-label="Roster notes"
                    >
                      {pasteIssues.slice(0, 8).map((issue, i) => (
                        <li key={`${issue.row}-${i}`}>
                          {issue.row > 0 ? `Row ${issue.row}: ` : ""}
                          {issue.message}
                        </li>
                      ))}
                      {pasteIssues.length > 8 && <li>and {pasteIssues.length - 8} more</li>}
                    </ul>
                  )}
                </div>
              </details>

              <details className="rounded-xl border border-border bg-elevated/50 p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  No roster handy? Add people by job title
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted">
                    Pick a common job, say how many, and rows appear with placeholder names and that
                    job's usual duties ticked. Rename them as you go.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted">Job title</span>
                      <select
                        className={cn(inputCls, "w-64")}
                        value={quickTitle}
                        onChange={(e) => setQuickTitle(e.target.value)}
                      >
                        {(Object.keys(JOB_FAMILY_LABEL) as JobFamily[]).map((family) => (
                          <optgroup key={family} label={JOB_FAMILY_LABEL[family]}>
                            {JOB_CATALOG.filter((j) => j.family === family).map((j) => (
                              <option key={j.id} value={j.id}>
                                {j.title}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted">How many</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        className={cn(inputCls, "w-20")}
                        value={quickCount}
                        onChange={(e) =>
                          setQuickCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                        }
                      />
                    </label>
                    <Button size="sm" onClick={addByTitle} disabled={!quickEntry}>
                      Add {quickCount} {quickCount === 1 ? "person" : "people"}
                    </Button>
                  </div>
                  {quickEntry && (
                    <p className="text-xs text-subtle">
                      {quickEntry.description} {quickEntry.note}
                    </p>
                  )}
                  <JobCatalogSheet />
                </div>
              </details>

              <datalist id="job-title-options">
                {JOB_CATALOG.map((j) => (
                  <option key={j.id} value={j.title} />
                ))}
              </datalist>

              <p className="text-[11px] text-subtle sm:hidden">
                Scroll sideways to reach every duty column.
              </p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[980px] border-separate border-spacing-0 text-xs">
                  <thead className="bg-elevated">
                    <tr>
                      <th scope="col" className="border-b border-border p-2 text-left font-medium">
                        Person
                      </th>
                      <th scope="col" className="border-b border-border p-2 text-left font-medium">
                        Role
                      </th>
                      {CORE_DUTIES.map((duty) => (
                        <th
                          key={duty}
                          scope="col"
                          title={coreDutyLabel(duty)}
                          className="border-b border-border p-2 text-center font-normal text-muted"
                        >
                          {GRID_DUTY_HEADING[duty] ?? coreDutyLabel(duty)}
                        </th>
                      ))}
                      <th scope="col" className="border-b border-border p-2">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index}>
                        <td className="border-b border-border p-1.5 align-top">
                          <input
                            id={nameInputId(index)}
                            className={cn(inputCls, "w-36")}
                            placeholder={index === 0 ? "Your name" : "Name"}
                            aria-label={`Person ${index + 1} name`}
                            value={row.name}
                            onChange={(e) => updateRow(index, { name: e.target.value })}
                            maxLength={60}
                          />
                          {row.onLeave && (
                            <button
                              type="button"
                              className="mt-1 rounded-full border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] text-warn hover:border-danger hover:text-danger"
                              title="The pasted roster says this person is on leave"
                              aria-label={`${row.name || `Person ${index + 1}`} is on leave; remove the on-leave mark`}
                              onClick={() => updateRow(index, { onLeave: undefined })}
                            >
                              On leave ×
                            </button>
                          )}
                        </td>
                        <td className="border-b border-border p-1.5">
                          <input
                            className={cn(inputCls, "w-40")}
                            placeholder="e.g. Bookkeeper"
                            aria-label={`Person ${index + 1} role`}
                            list="job-title-options"
                            value={row.role}
                            onChange={(e) => updateRow(index, { role: e.target.value })}
                            onBlur={() => suggestDuties(index)}
                            maxLength={40}
                          />
                          {extraDuties(row.duties).length > 0 && (
                            <ul
                              className="mt-1 flex max-w-[11rem] flex-wrap gap-1"
                              aria-label={`${row.name || `Person ${index + 1}`}: other duties`}
                            >
                              {extraDuties(row.duties).map((duty) => (
                                <li key={duty}>
                                  <button
                                    type="button"
                                    className="rounded-full border border-border bg-panel px-1.5 py-0.5 text-[10px] text-muted hover:border-danger hover:text-danger"
                                    title="Remove this duty"
                                    aria-label={`Remove ${coreDutyLabel(duty)} from ${row.name || `Person ${index + 1}`}`}
                                    onClick={() => toggleDuty(index, duty)}
                                  >
                                    {coreDutyLabel(duty)} ×
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                          <AddDutyControl
                            who={row.name || `Person ${index + 1}`}
                            duties={row.duties}
                            onAdd={(duty) => addDuty(index, duty)}
                          />
                        </td>
                        {CORE_DUTIES.map((duty) => (
                          <td key={duty} className="border-b border-border p-1.5 text-center">
                            <input
                              type="checkbox"
                              aria-label={`${row.name || `Person ${index + 1}`}: ${coreDutyLabel(duty)}`}
                              checked={row.duties.includes(duty)}
                              onChange={() => toggleDuty(index, duty)}
                            />
                          </td>
                        ))}
                        <td className="border-b border-border p-1.5 text-center">
                          {rows.length > 1 && (
                            <button
                              type="button"
                              aria-label={`Remove person ${index + 1}`}
                              className="rounded-md p-1 text-muted hover:bg-elevated hover:text-danger"
                              onClick={() =>
                                setRows((current) => current.filter((_, i) => i !== index))
                              }
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={rows.length >= OWN_TEAM_MAX}
                  onClick={() => setRows((current) => [...current, EMPTY_ROW("")])}
                >
                  <Plus className="size-3.5" aria-hidden /> Add a person
                </Button>
                <p className="text-[11px] text-subtle">
                  Up to {OWN_TEAM_MAX} people here; larger teams continue in Who knows what.
                </p>
              </div>
              {finishNote && (
                <p className="text-xs text-danger" role="alert">
                  {finishNote}
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button className="w-full" onClick={finish} disabled={namedRows.length === 0}>
                  Show me my findings
                </Button>
                <Button className="w-full" variant="secondary" onClick={() => setStep("industry")}>
                  Back
                </Button>
              </div>
              <p className="text-center text-[11px] text-subtle">
                Nothing leaves this browser until you sign in and choose to sync.
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
