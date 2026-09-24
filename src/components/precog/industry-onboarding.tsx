import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
} from "react";
import { INDUSTRIES, type IndustryId } from "@/lib/precog/industry";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { CASE_LIBRARY, sectorsForIndustry } from "@/lib/precog/evidence";
import { usePractice } from "@/lib/precog/practice-context";
import { makePlannedAbsenceId } from "@/lib/precog/practice-profile";
import { ownBusinessName } from "@/lib/precog/business-lifecycle";
import { canKeepLocalData } from "@/lib/precog/local-data";
import {
  draftHasTypedWork,
  initialSetup,
  namedPeople,
  readSetupDraft,
  writeSetupDraft,
} from "@/lib/precog/onboarding/setup-draft";
import { localDateKey } from "@/lib/precog/decisions/follow-through";
import {
  CORE_DUTIES,
  GRID_DUTY_HEADING,
  MORE_PEOPLE_PLACE,
  OWN_TEAM_MAX,
  addPastedRows,
  addRowsByTitle,
  addableDuties,
  buildOwnTeam,
  coreDutyLabel,
  extraDuties,
  firstUnnamedWithDuties,
  pasteSummary,
  pastedRows,
  rowOwnsBusiness,
  rowSeat,
  sharedTitles,
  suggestedDuties,
  untickDutyForTitle,
  MAX_ROLE_LENGTH,
  onLeavePersonIds,
  ownerRow,
  rowsKeptForAdding,
  type OwnTeamRow,
  type SeatReading,
} from "@/lib/precog/onboarding/own-team";
import type { EntitlementId } from "@/lib/precog/sod/conflict-rules";
import { JOB_CATALOG, JOB_FAMILY_LABEL, type JobFamily } from "@/lib/precog/onboarding/job-catalog";
import { JobCatalogSheet } from "@/components/precog/job-catalog-sheet";
import { parseRoster } from "@/lib/precog/import/roster";
import type { PeopleImportIssue } from "@/lib/precog/import/people-csv";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { personLocations } from "@/lib/precog/person-location";
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
  "rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-subtle";

let nextRowNumber = 0;
/** A key for a grid row that stays with it when rows above it are removed. */
const newRowId = () => `row-${Date.now().toString(36)}-${(nextRowNumber += 1)}`;
/** Gives every row a stable key; returns the same array when all have one. */
function withRowIds(rows: OwnTeamRow[]): OwnTeamRow[] {
  const seen = new Set<string>();
  let changed = false;
  const next = rows.map((row) => {
    if (row.rowId && !seen.has(row.rowId)) {
      seen.add(row.rowId);
      return row;
    }
    changed = true;
    const rowId = newRowId();
    seen.add(rowId);
    return { ...row, rowId };
  });
  return changed ? next : rows;
}

const EMPTY_ROW = (role = ""): OwnTeamRow => ({ name: "", role, duties: [], rowId: newRowId() });
/** A fresh grid: the Owner row and two empty rows. */
const freshRows = (): OwnTeamRow[] => [
  { ...ownerRow(), rowId: newRowId() },
  EMPTY_ROW(""),
  EMPTY_ROW(""),
];

const sameDuties = (a: readonly EntitlementId[], b: readonly EntitlementId[]) =>
  a.length === b.length && a.every((d) => b.includes(d));

const nameInputId = (index: number) => `onboarding-person-${index + 1}-name`;

/** Everything in `root` a keyboard can reach, in order, skipping what is hidden. */
function focusableIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.getClientRects().length > 0 && !el.closest("[inert]"));
}

/** Moves focus once React has drawn the change. */
function focusSoon(find: () => HTMLElement | null | undefined) {
  requestAnimationFrame(() => find()?.focus());
}

/** Who a row names, for labels: the name, or its place in the table. */
const whoIs = (row: OwnTeamRow, index: number) => row.name.trim() || `Person ${index + 1}`;

/** How typed titles read, remembered per line of business so typing stays quick. */
const SEAT_CACHE = new Map<string, SeatReading | undefined>();
function typedSeat(role: string, industry: string): SeatReading | undefined {
  const key = `${industry}|${role.trim()}`;
  if (!SEAT_CACHE.has(key)) {
    if (SEAT_CACHE.size > 500) SEAT_CACHE.clear();
    SEAT_CACHE.set(key, rowSeat({ role }, industry));
  }
  return SEAT_CACHE.get(key);
}

/** The short note under a row's role: which catalog seat ticked its duties. */
function SeatNote({ seat }: { seat: SeatReading | undefined }) {
  if (!seat) return null;
  if (!seat.title) {
    return (
      <p className="mt-1 max-w-[11rem] text-xs text-muted">Not in the catalog: tick by hand</p>
    );
  }
  return (
    <p className={cn("mt-1 max-w-[11rem] text-xs", seat.partial ? "text-warn" : "text-muted")}>
      {seat.partial ? `Partly read as ${seat.title}: check the ticks` : `Read as ${seat.title}`}
    </p>
  );
}

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
        className={cn(inputCls, "min-h-7 min-w-0 flex-1 px-1 py-0.5 text-xs")}
        aria-label={`Other duty for ${who}`}
        data-add-duty
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
        className="min-h-7 rounded-md border border-border bg-panel px-2 py-0.5 text-xs text-muted hover:border-border-strong hover:text-fg disabled:opacity-50"
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
 * First visit. Step one picks the line of business; step two takes the
 * owner's own business name, people, and who does the money duties,
 * so the first screen they see is about their team. "Explore a sample"
 * stays as the second path.
 */
export function IndustryOnboarding() {
  const {
    profile,
    completeOnboarding,
    startOwnBusiness,
    setPlannedAbsences,
    cancelSetup,
    setupReturnsTo,
  } = usePractice();
  // A business added from the business menu arrives with its name and line
  // of business; setup starts on its team.
  const typedName = ownBusinessName(profile);
  const [selected, setSelected] = useState<IndustryId>(profile.industry);
  const [step, setStep] = useState<"industry" | "team">(typedName ? "team" : "industry");
  const [businessName, setBusinessName] = useState(typedName);
  const [rows, setRowsRaw] = useState<OwnTeamRow[]>(freshRows);
  // Every change keeps each row's stable key, so removing a row never
  // shifts another row's controls or focus onto the wrong person.
  const setRows = useCallback((update: SetStateAction<OwnTeamRow[]>) => {
    setRowsRaw((current) => withRowIds(typeof update === "function" ? update(current) : update));
  }, []);

  const [paste, setPaste] = useState("");
  // The paste section stays open after "Fill the table" so its note and
  // roster notes stay in view; the owner closes it.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteNote, setPasteNote] = useState("");
  const [quickNote, setQuickNote] = useState("");
  /** What the last change in the table did, announced, with an undo for a removed row. */
  const [gridStatus, setGridStatus] = useState<{ text: string; undo?: () => void } | null>(null);
  const [bulkTitle, setBulkTitle] = useState("");
  const [bulkDuty, setBulkDuty] = useState<EntitlementId | "">("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const noteRef = useRef<HTMLParagraphElement>(null);
  const finishRef = useRef<HTMLButtonElement>(null);
  const gridBoxRef = useRef<HTMLDivElement>(null);
  const [gridOverflows, setGridOverflows] = useState(false);
  const [pasteIssues, setPasteIssues] = useState<PeopleImportIssue[]>([]);
  const [finishNote, setFinishNote] = useState("");
  const [restored, setRestored] = useState(false);
  // A team typed in an earlier setup in this tab came back with this one.
  const [restoredEarlier, setRestoredEarlier] = useState(false);
  // This browser keeps nothing the app writes (site data blocked).
  const [keepsNothing, setKeepsNothing] = useState(false);
  const businessId = profile.businessId ?? "biz_default";
  // Restore after mount, so the server-rendered dialog and the first client
  // render agree; then keep the draft in step with every edit, including the
  // line of business picked and a roster pasted but not yet used.
  useEffect(() => {
    const start = initialSetup(
      readSetupDraft(),
      { businessId, industry: profile.industry, typedName },
      freshRows,
    );
    setSelected(start.draft.selected);
    setBusinessName(start.draft.businessName);
    setRows(start.draft.rows);
    setStep(start.draft.step);
    setPaste(start.draft.paste);
    setPasteOpen(start.draft.paste.trim().length > 0);
    setRestoredEarlier(start.restoredEarlier);
    setKeepsNothing(!canKeepLocalData());
    setRestored(true);
    // Once per setup: later edits are the owner's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);
  useEffect(() => {
    if (!restored) return;
    writeSetupDraft({ step, selected, businessName, rows, paste, businessId });
  }, [restored, step, selected, businessName, rows, paste, businessId]);

  // Each step opens at its question, with focus on it: the dialog is not
  // scrolled to a button further down, and a screen reader starts with the
  // question.
  useEffect(() => {
    const card = dialogRef.current?.querySelector<HTMLElement>("[data-onboarding-card]");
    if (card) card.scrollTop = 0;
    titleRef.current?.focus({ preventScroll: true });
  }, [step]);

  // "Scroll sideways" shows whenever the table is wider than its box.
  useEffect(() => {
    const box = gridBoxRef.current;
    if (!box) return;
    const update = () => setGridOverflows(box.scrollWidth > box.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    const table = box.querySelector("table");
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, [step]);

  /** Tab and Shift+Tab stay inside the dialog while it is open. */
  function keepFocusInside(event: ReactKeyboardEvent<HTMLDivElement>) {
    // Escape leaves setup only when there is a business to go back to, and
    // asks first when the owner has typed something.
    if (event.key === "Escape" && setupReturnsTo) {
      event.preventDefault();
      const typed = draftHasTypedWork({ businessName, rows, paste });
      if (!typed || window.confirm(`Leave setup and go back to ${setupReturnsTo.name}?`)) {
        void cancelSetup();
      }
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusableIn(dialogRef.current);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === titleRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Drops the team restored from an earlier setup and starts this one fresh. */
  function startOver() {
    setRows(freshRows());
    setPaste("");
    setPasteNote("");
    setQuickNote("");
    setGridStatus(null);
    setPasteIssues([]);
    setBusinessName(typedName);
    setRestoredEarlier(false);
  }

  /**
   * Loads the sample instead. Typed work is not thrown away: the owner
   * confirms, and the draft stays in this tab for "Set up my own business".
   */
  function loadSample() {
    const draft = { step, selected, businessName, rows, paste, businessId };
    if (draftHasTypedWork(draft)) {
      const people = namedPeople(draft);
      const what =
        people === 0
          ? "What you entered stays"
          : people === 1
            ? "The person you entered stays"
            : `The ${people} people you entered stay`;
      if (
        !window.confirm(
          `Load the sample business instead? ${what} in this tab: choose "Set up my own business" in the business menu to finish setting up.`,
        )
      ) {
        return;
      }
    } else {
      writeSetupDraft(null);
    }
    completeOnboarding(selected);
  }
  const [quickTitle, setQuickTitle] = useState(JOB_CATALOG[0]?.id ?? "");
  const [quickCount, setQuickCount] = useState(1);
  const quickEntry = JOB_CATALOG.find((j) => j.id === quickTitle);

  // Rows that count toward the limit: named, or with duties ticked. Blank
  // rows give way when people are added.
  const rowsInUse = rowsKeptForAdding(rows, false).kept.length;
  const tableFull = rowsInUse >= OWN_TEAM_MAX;

  /**
   * Add N people with one job title and its usual duties; names are
   * placeholders that never repeat a name already in the table. The unnamed
   * Owner row stays unless the new rows are owners.
   */
  function addByTitle() {
    if (!quickEntry) return;
    const result = addRowsByTitle(rows, quickEntry, quickCount, selected);
    if (result.added === 0) {
      setQuickNote(
        `Added nobody: this table holds ${OWN_TEAM_MAX} people. Add more in ${MORE_PEOPLE_PLACE} after setup.`,
      );
      return;
    }
    setRows(result.rows);
    setFinishNote("");
    setQuickNote(
      result.notAdded > 0
        ? `Added ${result.added} of ${quickCount}: this table holds ${OWN_TEAM_MAX} people. Add the other ${result.notAdded} in ${MORE_PEOPLE_PLACE} after setup.`
        : `Added ${result.added} ${result.added === 1 ? "person" : "people"} as ${quickEntry.title}; rename them as you go.`,
    );
  }
  const industry = INDUSTRIES.find((i) => i.id === selected);
  const namedRows = rows.filter((r) => r.name.trim().length > 0);

  function seatOf(row: OwnTeamRow): SeatReading | undefined {
    if (row.readAs && row.readAs.role.trim() === row.role.trim()) return rowSeat(row, selected);
    return typedSeat(row.role, selected);
  }

  // Titles two or more people share, for "untick one duty for all of them".
  const shared = useMemo(
    () =>
      sharedTitles(rows).filter((t) => {
        const key = t.role.trim().toLowerCase().replace(/\s+/g, " ");
        return rows.some(
          (r) => r.duties.length > 0 && r.role.trim().toLowerCase().replace(/\s+/g, " ") === key,
        );
      }),
    [rows],
  );
  const bulkRole = shared.some((t) => t.role === bulkTitle) ? bulkTitle : (shared[0]?.role ?? "");
  const bulkDuties = useMemo(() => {
    const key = bulkRole.trim().toLowerCase().replace(/\s+/g, " ");
    const held = new Set<EntitlementId>();
    for (const row of rows) {
      if (row.role.trim().toLowerCase().replace(/\s+/g, " ") !== key) continue;
      for (const duty of row.duties) held.add(duty);
    }
    return [...CORE_DUTIES, ...extraDuties([...held])].filter((d) => held.has(d));
  }, [rows, bulkRole]);
  const bulkPick = bulkDuty && bulkDuties.includes(bulkDuty) ? bulkDuty : (bulkDuties[0] ?? "");
  const bulkCount = shared.find((t) => t.role === bulkRole)?.count ?? 0;

  function untickForTitle() {
    if (!bulkRole || !bulkPick) return;
    const result = untickDutyForTitle(rows, bulkRole, bulkPick);
    if (result.changed === 0) return;
    setRows(result.rows);
    setGridStatus({
      text: `Unticked ${coreDutyLabel(bulkPick)} for ${result.changed} ${result.changed === 1 ? "person" : "people"} titled ${bulkRole}.`,
    });
  }

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
        const owns = rowOwnsBusiness(row);
        const previous = row.suggestedFor ? suggestedDuties(row.suggestedFor, owns, selected) : [];
        const untouched = row.duties.length === 0 || sameDuties(row.duties, previous);
        return untouched
          ? { ...row, duties: suggestedDuties(role, owns, selected), suggestedFor: role }
          : row;
      }),
    );
  }

  /**
   * Fill the grid from a pasted HR or payroll export, or a plain "Name,
   * Title" list. Someone already in the table (same employee id or name) is
   * updated, not added twice; only new people count toward the limit.
   */
  function fillFromPaste() {
    const tpl = getIndustryTemplate(selected);
    const result = parseRoster(paste, tpl);
    // The importer reads each title through the catalog of common jobs. A
    // title it could not read leaves the duties for the owner to tick.
    const { rows: incoming, inactiveNames } = pastedRows(result, selected);
    setPasteIssues(result.issues);
    const announce = () => focusSoon(() => noteRef.current);
    if (incoming.length === 0) {
      setPasteNote(
        result.people.length > 0
          ? `All ${result.people.length} people in the paste are marked inactive, so none was added: ${inactiveNames.slice(0, 5).join(", ")}${inactiveNames.length > 5 ? ` and ${inactiveNames.length - 5} more` : ""}.`
          : (result.issues[0]?.message ?? "No names found. One person per line: Name, Title."),
      );
      announce();
      return;
    }
    // The unnamed Owner row stays at the top unless the paste has its own owner.
    const { kept, ownerRow: owner } = rowsKeptForAdding(
      rows,
      incoming.some((r) => rowOwnsBusiness(r)),
    );
    const outcome = addPastedRows(kept, incoming);
    setRows(outcome.rows);
    setFinishNote("");
    const inGrid = new Set(outcome.rows.map((r) => r.name));
    const titlesRead = result.titles.filter(
      (t) => inGrid.has(t.name) && incoming.some((r) => r.name === t.name),
    );
    const recognised = titlesRead.filter((t) => t.catalogTitle).length;
    const summary = pasteSummary({
      added: outcome.added.length,
      matched: outcome.matched,
      notAdded: outcome.notAdded,
      dropped: result.dropped ?? 0,
      recognised,
      partial: titlesRead.filter((t) => t.catalogTitle && t.confidence === "partial").length,
      unmatched: titlesRead.length - recognised,
      inactiveNames,
      ownerRow: owner,
      onLeaveNames: incoming.filter((r) => r.onLeave && inGrid.has(r.name)).map((r) => r.name),
    });
    setPasteNote(summary.note);
    // Anyone left out keeps the paste in the box, to add later.
    if (!summary.keepPaste) setPaste("");
    announce();
  }

  function updateRow(index: number, patch: Partial<OwnTeamRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    if (finishNote) setFinishNote("");
  }

  /** Removes a row, says so with an undo, and moves focus to the next person's remove button. */
  function removeRow(index: number) {
    const row = rows[index];
    if (!row) return;
    const who = whoIs(row, index);
    const nextRow = rows[index + 1] ?? rows[index - 1];
    setRows((current) => current.filter((r) => r.rowId !== row.rowId));
    setGridStatus({
      text: `Removed ${who}.`,
      undo: () => {
        setRows((current) => {
          if (current.some((r) => r.rowId === row.rowId)) return current;
          const next = [...current];
          next.splice(Math.min(index, next.length), 0, row);
          return next;
        });
        setGridStatus({ text: `${who} is back in the table.` });
        focusSoon(() => document.getElementById(`remove-${row.rowId}`));
      },
    });
    focusSoon(() =>
      nextRow ? document.getElementById(`remove-${nextRow.rowId}`) : finishRef.current,
    );
  }

  /** Removes a title's extra duty from a row, keeping focus on that row's duty controls. */
  function removeTag(index: number, duty: EntitlementId) {
    const row = rows[index];
    if (!row) return;
    const rowId = row.rowId;
    toggleDuty(index, duty);
    setGridStatus({
      text: `Removed ${coreDutyLabel(duty)} from ${whoIs(row, index)}. Add it back with "Add a duty" under the role.`,
    });
    focusSoon(() => {
      const cell = document.querySelector<HTMLElement>(`[data-role-cell="${rowId}"]`);
      return (
        cell?.querySelector<HTMLElement>("[data-duty-tag]") ??
        cell?.querySelector<HTMLElement>("[data-add-duty]") ??
        cell?.querySelector<HTMLElement>("input")
      );
    });
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
    const people = buildOwnTeam(rows, selected);
    if (people.length === 0) return;
    const onLeave = onLeavePersonIds(rows);
    writeSetupDraft(null);
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

  const storageNote = keepsNothing ? (
    <p
      className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn"
      role="status"
    >
      This browser is not keeping data for this site, so what you set up here is lost when this tab
      closes or reloads. Allow site data for this site to keep it.
    </p>
  ) : null;

  // Setting up an added business: the owner can go back without finishing.
  const cancelLink = setupReturnsTo ? (
    <p className="text-center text-xs">
      <button
        type="button"
        className="text-muted underline underline-offset-2 hover:text-fg"
        onClick={() => void cancelSetup()}
      >
        Cancel and go back to {setupReturnsTo.name}
      </button>
    </p>
  ) : null;

  // A long table gets the width of the screen, so more duty columns show at once.
  const wide = step === "team" && rows.length > 10;
  const titleCls = "text-xl font-semibold tracking-tight outline-hidden sm:text-2xl";

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="industry-onboarding-title"
      onKeyDown={keepFocusInside}
    >
      <Card
        data-onboarding-card
        className={cn(
          "max-h-[92dvh] w-full overflow-y-auto border-border bg-surface shadow-2xl",
          wide ? "max-w-7xl" : "max-w-3xl",
        )}
      >
        {step === "industry" ? (
          <>
            <CardHeader>
              <Badge variant="accent" className="w-fit">
                Welcome to Precog Pioneer
              </Badge>
              <h2 id="industry-onboarding-title" ref={titleRef} tabIndex={-1} className={titleCls}>
                What kind of business is this?
              </h2>
              <CardDescription>
                Pick the closest line of business. Next you enter your own team, or explore a sample
                first. You can switch industry anytime in Business profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {storageNote}
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
                      aria-pressed={active}
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
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium">
                            {ind.label}
                            {active && <span className="sr-only"> (selected)</span>}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">{ind.tagline}</p>
                          <p className="mt-2 text-xs text-subtle">
                            Sample: {tpl.processes.length} processes, {tpl.people.length} people
                          </p>
                          <p className="mt-0.5 text-xs text-subtle">{casePhrase}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button className="w-full" onClick={() => setStep("team")}>
                  Set up my own business
                </Button>
                <Button className="w-full" variant="secondary" onClick={loadSample}>
                  Load {industry?.label} demo
                </Button>
              </div>
              <p className="text-center text-xs text-subtle">
                The demo is a fictional team. Every finding on it says so until you enter your own.
              </p>
              {cancelLink}
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <Badge variant="accent" className="w-fit">
                {industry?.label}
              </Badge>
              <h2 id="industry-onboarding-title" ref={titleRef} tabIndex={-1} className={titleCls}>
                Your business and who does the money work
              </h2>
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
              {storageNote}
              {restoredEarlier && (
                <p className="rounded-lg border border-border bg-elevated/60 px-3 py-2 text-xs text-muted">
                  The team you started entering earlier in this tab is back below.{" "}
                  <button
                    type="button"
                    className="font-medium text-primary underline underline-offset-2"
                    onClick={startOver}
                  >
                    Start over
                  </button>
                </p>
              )}
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

              <details
                className="rounded-xl border border-border bg-elevated/50 p-3"
                open={pasteOpen}
                onToggle={(e) => setPasteOpen(e.currentTarget.open)}
              >
                <summary className="cursor-pointer text-sm font-medium">
                  Paste your team from Workday, SAP, Oracle, or your payroll export
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted">
                    Paste the worker list as exported, header row included, or one person per line
                    as <span className="font-mono">Name, Title</span>. Titles such as Bookkeeper,
                    Office Manager, AP Specialist, or Cashier are read from a catalog of common jobs
                    and their usual duties are ticked. People already in the table are updated, not
                    added twice. People marked inactive are left out.
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
                  </div>
                  <p
                    ref={noteRef}
                    tabIndex={-1}
                    role="status"
                    data-paste-note
                    className="text-xs text-muted outline-hidden empty:hidden"
                  >
                    {pasteNote}
                  </p>
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
                    job&rsquo;s usual duties ticked. Rename them as you go.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted">Job title</span>
                      <select
                        className={cn(inputCls, "w-64 max-w-full")}
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
                    <Button size="sm" onClick={addByTitle} disabled={!quickEntry || tableFull}>
                      Add {quickCount} {quickCount === 1 ? "person" : "people"}
                    </Button>
                  </div>
                  <p role="status" className="text-xs text-muted empty:hidden">
                    {tableFull && !quickNote
                      ? `The table holds ${OWN_TEAM_MAX} people and is full. Add more in ${MORE_PEOPLE_PLACE} after setup.`
                      : quickNote}
                  </p>
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

              {shared.length > 0 && (
                <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-elevated/50 p-3">
                  <p className="w-full text-xs text-muted">
                    Untick one duty for everyone with the same title:
                  </p>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted">Title</span>
                    <select
                      className={cn(inputCls, "w-56 max-w-full")}
                      value={bulkRole}
                      onChange={(e) => setBulkTitle(e.target.value)}
                    >
                      {shared.map((t) => (
                        <option key={t.role} value={t.role}>
                          {t.role} ({t.count})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted">Duty</span>
                    <select
                      className={cn(inputCls, "w-56 max-w-full")}
                      value={bulkPick}
                      onChange={(e) => setBulkDuty(e.target.value as EntitlementId)}
                      disabled={bulkDuties.length === 0}
                    >
                      {bulkDuties.length === 0 && <option value="">No duties ticked</option>}
                      {bulkDuties.map((duty) => (
                        <option key={duty} value={duty}>
                          {coreDutyLabel(duty)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={untickForTitle}
                    disabled={!bulkPick}
                  >
                    Untick for all {bulkCount}
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">
                  {gridOverflows
                    ? "Scroll sideways for more duties. Names stay on the left; duty names stay on top."
                    : `${rowsInUse} of up to ${OWN_TEAM_MAX} people.`}
                </p>
                {rows.length > 3 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => finishRef.current?.focus()}
                    disabled={namedRows.length === 0}
                  >
                    Skip to the finish button
                  </Button>
                )}
              </div>
              <div
                ref={gridBoxRef}
                className="max-h-[min(62dvh,40rem)] overflow-auto rounded-xl border border-border"
              >
                <table className="w-full min-w-[980px] border-separate border-spacing-0 text-xs">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="sticky top-0 left-0 z-30 border-b border-border bg-elevated p-2 text-left font-medium"
                      >
                        Person
                      </th>
                      <th
                        scope="col"
                        className="sticky top-0 z-20 border-b border-border bg-elevated p-2 text-left font-medium"
                      >
                        Role
                      </th>
                      {CORE_DUTIES.map((duty) => (
                        <th
                          key={duty}
                          scope="col"
                          title={coreDutyLabel(duty)}
                          className="sticky top-0 z-20 border-b border-border bg-elevated p-2 text-center font-normal text-muted"
                        >
                          {GRID_DUTY_HEADING[duty] ?? coreDutyLabel(duty)}
                        </th>
                      ))}
                      <th
                        scope="col"
                        className="sticky top-0 z-20 border-b border-border bg-elevated p-2"
                      >
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const who = whoIs(row, index);
                      const rowKey = row.rowId ?? `row-${index}`;
                      return (
                        <tr key={rowKey}>
                          <th
                            scope="row"
                            className="sticky left-0 z-10 border-b border-border bg-surface p-1.5 text-left align-top font-normal"
                          >
                            <input
                              id={nameInputId(index)}
                              className={cn(inputCls, "w-28 sm:w-36")}
                              placeholder={index === 0 ? "Your name" : "Name"}
                              aria-label={`Person ${index + 1} name`}
                              value={row.name}
                              onChange={(e) => updateRow(index, { name: e.target.value })}
                              maxLength={60}
                            />
                            {row.department && (
                              // One line per place: a person listed at two
                              // stores shows both, not one cut short.
                              <ul
                                className="mt-1 text-xs text-muted"
                                aria-label={`Where ${who} works`}
                              >
                                {personLocations(row).map((place) => (
                                  <li
                                    key={place}
                                    className="max-w-28 truncate sm:max-w-36"
                                    title={place}
                                  >
                                    {place}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <label className="mt-1 flex min-h-6 items-center gap-1.5 text-xs text-muted">
                              <input
                                type="checkbox"
                                className="size-4"
                                aria-label={`${who} owns the business`}
                                checked={rowOwnsBusiness(row)}
                                onChange={(e) => updateRow(index, { owner: e.target.checked })}
                              />
                              Owns the business
                            </label>
                            {row.onLeave && (
                              <button
                                type="button"
                                className="mt-1 min-h-6 rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-xs text-warn hover:border-danger hover:text-danger"
                                title="The pasted roster says this person is on leave"
                                aria-label={`${who} is on leave; remove the on-leave mark`}
                                onClick={() => updateRow(index, { onLeave: undefined })}
                              >
                                On leave ×
                              </button>
                            )}
                          </th>
                          <td className="border-b border-border p-1.5" data-role-cell={rowKey}>
                            <input
                              className={cn(inputCls, "w-44 sm:w-52")}
                              placeholder="e.g. Bookkeeper"
                              aria-label={`${who} role`}
                              list="job-title-options"
                              value={row.role}
                              onChange={(e) => updateRow(index, { role: e.target.value })}
                              onBlur={() => suggestDuties(index)}
                              maxLength={MAX_ROLE_LENGTH}
                            />
                            <SeatNote seat={seatOf(row)} />
                            {extraDuties(row.duties).length > 0 && (
                              <ul
                                className="mt-1 flex max-w-[11rem] flex-wrap gap-1.5"
                                aria-label={`${who}: other duties`}
                              >
                                {extraDuties(row.duties).map((duty) => (
                                  <li key={duty}>
                                    <button
                                      type="button"
                                      data-duty-tag
                                      className="min-h-6 rounded-full border border-border bg-panel px-2 py-0.5 text-left text-xs text-muted hover:border-danger hover:text-danger"
                                      title="Remove this duty"
                                      aria-label={`Remove ${coreDutyLabel(duty)} from ${who}`}
                                      onClick={() => removeTag(index, duty)}
                                    >
                                      {coreDutyLabel(duty)} ×
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <AddDutyControl
                              who={who}
                              duties={row.duties}
                              onAdd={(duty) => addDuty(index, duty)}
                            />
                          </td>
                          {CORE_DUTIES.map((duty) => (
                            <td key={duty} className="border-b border-border p-0 text-center">
                              <label className="flex min-h-11 w-full items-center justify-center p-1.5">
                                <input
                                  type="checkbox"
                                  className="size-4"
                                  aria-label={`${who}: ${coreDutyLabel(duty)}`}
                                  checked={row.duties.includes(duty)}
                                  onChange={() => toggleDuty(index, duty)}
                                />
                              </label>
                            </td>
                          ))}
                          <td className="border-b border-border p-1.5 text-center">
                            {rows.length > 1 && (
                              <button
                                type="button"
                                id={`remove-${rowKey}`}
                                aria-label={`Remove ${row.name.trim() || `person ${index + 1}`}`}
                                className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-danger"
                                onClick={() => removeRow(index)}
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div
                role="status"
                className="flex flex-wrap items-center gap-2 text-xs text-muted empty:hidden"
              >
                {gridStatus && (
                  <>
                    <span>{gridStatus.text}</span>
                    {gridStatus.undo && (
                      <button
                        type="button"
                        className="font-medium text-primary underline underline-offset-2"
                        onClick={gridStatus.undo}
                      >
                        Undo
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={rows.length >= OWN_TEAM_MAX}
                  onClick={() => {
                    const row = EMPTY_ROW("");
                    setRows((current) => [...current, row]);
                    focusSoon(() =>
                      document
                        .getElementById(`remove-${row.rowId}`)
                        ?.closest("tr")
                        ?.querySelector<HTMLElement>("input"),
                    );
                  }}
                >
                  <Plus className="size-3.5" aria-hidden /> Add a person
                </Button>
                <p className="text-xs text-subtle">
                  Up to {OWN_TEAM_MAX} people here; add more in {MORE_PEOPLE_PLACE} after setup.
                </p>
              </div>
              {finishNote && (
                <p className="text-xs text-danger" role="alert">
                  {finishNote}
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  ref={finishRef}
                  className="w-full"
                  onClick={finish}
                  disabled={namedRows.length === 0}
                >
                  Show me my findings
                </Button>
                <Button className="w-full" variant="secondary" onClick={() => setStep("industry")}>
                  Back
                </Button>
              </div>
              <p className="text-center text-xs text-subtle">
                Nothing leaves this browser until you sign in and choose to sync.
              </p>
              {cancelLink}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
