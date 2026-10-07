import { useWorkspace } from "@/lib/precog/workspace-context";
import { toast } from "sonner";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
} from "react";
import { INDUSTRIES, industryHasOwner, type IndustryId } from "@/lib/precog/industry";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { usePractice } from "@/lib/precog/practice-context";
import { useTabName } from "@/lib/precog/presentation";
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
import {
  CORE_DUTIES,
  OWN_TEAM_MAX,
  buildOwnTeam,
  coreDutyLabel,
  extraDuties,
  firstUnnamedWithDuties,
  rowNeedsReview,
  rowOwnsBusiness,
  keepDuties,
  stillSuggested,
  suggestedDuties,
  toggleDutyByHand,
  unconfirmedDuties,
  untickDutyForTitle,
  withoutDutiesOffTeam,
  fitDutiesToAnswers,
  titleTicksFor,
  MAX_ROLE_LENGTH,
  onLeavePersonIds,
  firstRowForIndustry,
  rowsKeptForAdding,
  type OwnTeamRow,
} from "@/lib/precog/onboarding/own-team";
import {
  MORE_PEOPLE_PLACE,
  addRowsByTitle,
  applyPaste,
  readPastedRoster,
} from "@/lib/precog/onboarding/add-people";
import type { EntitlementId } from "@/lib/precog/sod/conflict-rules";
import {
  JOB_FAMILY_LABEL,
  jobCatalogEntry,
  jobsForIndustry,
  type JobFamily,
} from "@/lib/precog/onboarding/job-catalog";
import { JobCatalogSheet } from "@/components/precog/job-catalog-sheet";
import { SetupPreviewCard } from "@/components/precog/setup-preview-card";
import { LegalFooter } from "@/components/precog/legal-footer";
import type { ImportIssue } from "@/lib/precog/import/csv";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { personLocations } from "@/lib/precog/person-location";
import type { Departure } from "@/lib/precog/continuity/access-removal";
import { Plus, Trash2 } from "lucide-react";
import { fieldCls } from "@/components/ui/field-classes";

import {
  cancelSetupConfirm,
  caseCoveragePhrase,
  dutiesHeldByTitle,
  EMPTY_ROW,
  finishWaits,
  freshRows,
  focusableIn,
  focusSoon,
  ICONS,
  leaveSetupConfirm,
  nameInputId,
  sharedTitlesWithDuties,
  titleTicksItems,
  typedSeat,
  whoIs,
  withRowIds,
  onePersonNote,
} from "./industry-onboarding-helpers";
import {
  AddDutyControl,
  DutyHeading,
  FinishWaitsNote,
  SeatNote,
  TitleTicksReview,
  YearsHereInput,
} from "./industry-onboarding-parts";
import { localDateKey } from "@/lib/precog/dates";
import { teamSizeScaleWarning } from "@/lib/precog/continuity/scale-message";
import { clamp } from "@/lib/precog/number";
import { DEFAULT_BUSINESS_ID, MAX_BUSINESS_NAME } from "@/lib/precog/business-id";
import { count } from "@/lib/precog/text";
import {
  hiddenDuties,
  normalizeAnsweredQuestions,
  normalizeSetupAnswers,
  setupEffects,
  type SetupQuestion,
  UNANSWERED,
  type SetupAnswers,
} from "@/lib/precog/onboarding/setup-answers";
import { SetupMoneyStep } from "@/components/precog/onboarding/setup-money-step";
import {
  EMPTY_ONBOARDING_FACTS,
  OnboardingQuestionShell,
  adjacentQuestion,
  type ShellQuestion,
} from "./onboarding-question-shell";
import {
  ONBOARDING_FACTS_VERSION,
  requiresMappingScope,
  withMappingScope,
  type MappingScope,
  type OnboardingFacts,
} from "@/lib/precog/onboarding/decision-model";
export function IndustryOnboarding({
  initialStep,
}: {
  initialStep?: "industry" | "questions" | "money" | "team";
} = {}) {
  const tabName = useTabName();
  const workspace = useWorkspace();
  const {
    profile,
    completeOnboarding,
    startOwnBusiness,
    setPlannedAbsences,
    cancelSetup,
    setupReturnsTo,
  } = usePractice();
  // A business added from the business menu arrives with its name and line
  // of business; setup starts on the setup questions.
  const typedName = ownBusinessName(profile);
  const [selected, setSelected] = useState<IndustryId>(profile.industry);
  const [step, setStep] = useState<"industry" | "questions" | "money" | "team">(
    initialStep ?? (typedName ? "questions" : "industry"),
  );
  const [answers, setAnswers] = useState<SetupAnswers>(UNANSWERED);
  // The money questions the owner chose an answer for; the rest stay Not sure for the engines.
  const [answered, setAnswered] = useState<SetupQuestion[]>([]);
  const [question, setQuestion] = useState<ShellQuestion>("actor");
  const [facts, setFacts] = useState<OnboardingFacts>(
    profile.onboardingFacts ?? EMPTY_ONBOARDING_FACTS,
  );
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
  const [showAllJobs, setShowAllJobs] = useState(false);
  const offeredJobs = useMemo(
    () => jobsForIndustry(selected, showAllJobs),
    [selected, showAllJobs],
  );
  // People a pasted roster left out as terminated or inactive: once setup
  // finishes, the owner is asked to confirm their pay and logins are stopped.
  const [leftOut, setLeftOut] = useState<Departure[]>([]);
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
  const [gridScrolled, setGridScrolled] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [reviewRowIds, setReviewRowIds] = useState<Set<string>>(() => new Set());
  const [draftSaved, setDraftSaved] = useState<boolean | null>(null);
  const [pasteIssues, setPasteIssues] = useState<ImportIssue[]>([]);
  const [unresolvedRows, setUnresolvedRows] = useState(0);
  const [finishNote, setFinishNote] = useState("");
  const [restored, setRestored] = useState(false);
  // A team typed in an earlier setup in this tab came back with this one.
  const [restoredEarlier, setRestoredEarlier] = useState(false);
  // This browser keeps nothing the app writes (site data blocked).
  const [keepsNothing, setKeepsNothing] = useState(false);
  const businessId = profile.businessId ?? DEFAULT_BUSINESS_ID;
  // Restore after mount, so the server-rendered dialog and the first client
  // render agree; then keep the draft in step with every edit, including the
  // line of business picked and a roster pasted but not yet used.
  useEffect(() => {
    const start = initialSetup(
      readSetupDraft(workspace.session),
      { businessId, industry: profile.industry, typedName },
      freshRows,
    );
    setSelected(start.draft.selected);
    setBusinessName(start.draft.businessName);
    setRows(start.draft.rows);
    setStep(start.draft.step);
    setAnswers(normalizeSetupAnswers(start.draft.setupAnswers) ?? UNANSWERED);
    setAnswered(normalizeAnsweredQuestions(start.draft.answeredQuestions));
    setQuestion(
      start.draft.currentQuestionId &&
        ["actor", "workforce", "locations", "setup_method"].includes(start.draft.currentQuestionId)
        ? (start.draft.currentQuestionId as ShellQuestion)
        : "actor",
    );
    setFacts({
      schemaVersion: ONBOARDING_FACTS_VERSION,
      ...(profile.onboardingFacts ?? {}),
      ...(start.draft.actor ? { actor: start.draft.actor } : {}),
      ...(start.draft.workforceBand ? { workforceBand: start.draft.workforceBand } : {}),
      ...(start.draft.locationBand ? { locationBand: start.draft.locationBand } : {}),
      ...(start.draft.mappingScope ? { mappingScope: start.draft.mappingScope } : {}),
      ...(start.draft.setupMethod ? { setupMethod: start.draft.setupMethod } : {}),
      ...(start.draft.answers ? { answers: start.draft.answers } : {}),
    });
    setPaste(start.draft.paste);
    setLeftOut(start.draft.leftOut ?? []);
    setUnresolvedRows(start.draft.unresolvedRows ?? 0);
    setPasteOpen(start.draft.paste.trim().length > 0);
    setRestoredEarlier(start.restoredEarlier);
    setKeepsNothing(!canKeepLocalData());
    setRestored(true);
    // Once per setup: later edits are the owner's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, workspace.local]);
  // The draft is written a moment after the owner stops typing, not on every
  // keystroke; a draft still waiting is written when setup closes.
  const pendingDraft = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!restored) return;
    const write = () => {
      pendingDraft.current = null;
      setDraftSaved(
        writeSetupDraft(
          {
            step,
            selected,
            businessName,
            rows,
            paste,
            businessId,
            leftOut,
            setupAnswers: answers,
            answeredQuestions: answered,
            schemaVersion: ONBOARDING_FACTS_VERSION,
            currentQuestionId: question,
            actor: facts.actor,
            workforceBand: facts.workforceBand,
            locationBand: facts.locationBand,
            mappingScope: facts.mappingScope,
            setupMethod: facts.setupMethod,
            answers: facts.answers,
            unresolvedRows,
          },
          workspace.session,
        ),
      );
    };
    pendingDraft.current = write;
    const timer = window.setTimeout(write, DRAFT_WRITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [
    restored,
    step,
    question,
    facts,
    selected,
    businessName,
    rows,
    paste,
    businessId,
    leftOut,
    answers,
    answered,
    unresolvedRows,
    workspace.session,
  ]);
  useEffect(() => {
    // A reload or closed tab does not unmount the dialog, so write a waiting
    // draft when the page is hidden; otherwise the last edits are lost.
    const flush = () => pendingDraft.current?.();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  /** Clears the draft now, and any write still waiting, when setup ends. */
  function clearDraft() {
    pendingDraft.current = null;
    writeSetupDraft(null, workspace.session);
  }

  // Each step opens at its question, with focus on it: the dialog is not
  // scrolled to a button further down, and a screen reader starts with the
  // question.
  useEffect(() => {
    const card = dialogRef.current?.querySelector<HTMLElement>("[data-onboarding-card]");
    if (card) card.scrollTop = 0;
    titleRef.current?.focus({ preventScroll: true });
  }, [step, question]);

  // "Scroll sideways" shows whenever the table is wider than its box, until
  // the owner scrolls it once: on a phone the duty columns hide otherwise,
  // and the grid gives no other sign they exist.
  useEffect(() => {
    const box = gridBoxRef.current;
    if (!box) return;
    const update = () => setGridOverflows(box.scrollWidth > box.clientWidth + 1);
    update();
    const onScroll = () => {
      if (box.scrollLeft > 0) setGridScrolled(true);
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(box);
    const table = box.querySelector("table");
    if (table) observer.observe(table);
    return () => {
      box.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [step]);

  /** Tab and Shift+Tab stay inside the dialog while it is open. */
  function keepFocusInside(event: ReactKeyboardEvent<HTMLDivElement>) {
    // Escape leaves setup only when there is a business to go back to, and
    // asks first when the owner has typed something.
    if (event.key === "Escape" && setupReturnsTo) {
      event.preventDefault();
      const typed = draftHasTypedWork({ businessName, rows, paste });
      const ask = leaveSetupConfirm({
        typed,
        keepsNothing,
        draftSaved,
        returnsToName: setupReturnsTo.name,
      });
      if (!ask || window.confirm(ask)) {
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

  /**
   * Drops the team restored from an earlier setup and starts this one fresh:
   * every per-setup state goes, including the people an earlier paste left
   * out, so none of them becomes a leaver check for this team.
   */
  function startOver() {
    setRows(firstRowForIndustry(freshRows(), selected));
    setPaste("");
    setPasteOpen(false);
    setPasteNote("");
    setPasteIssues([]);
    setLeftOut([]);
    setUnresolvedRows(0);
    setFacts((current) => ({ ...current, mappingScope: undefined }));
    setQuickNote("");
    setGridStatus(null);
    setBulkTitle("");
    setBulkDuty("");
    setReviewOnly(false);
    setReviewRowIds(new Set());
    setFinishNote("");
    setBusinessName(typedName);
    setAnswers(UNANSWERED);
    setAnswered([]);
    setRestoredEarlier(false);
  }

  /**
   * Loads the sample instead. Typed work is not thrown away: the owner
   * confirms, and the draft stays in this tab for "Set up my own business".
   */
  function loadSample() {
    const draft = { step, selected, businessName, rows, paste, businessId, answers };
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
      clearDraft();
    }
    completeOnboarding(selected);
  }
  // No job is picked until the owner picks one: the catalog's first entry is
  // the owner's seat, and a table with three placeholder owners has no sole owner.
  const [quickTitle, setQuickTitle] = useState("");
  // "How many" stays as typed until it is used, so it can be cleared and retyped.
  const [quickCountText, setQuickCountText] = useState("1");
  const quickCount = clamp(Math.floor(Number(quickCountText)) || 1, 1, 20);
  const quickEntry = jobCatalogEntry(quickTitle);

  // Rows that count toward the limit: named, or with duties ticked. Blank
  // rows give way when people are added.
  const rowsInUse = useMemo(() => rowsKeptForAdding(rows, false).kept.length, [rows]);
  const tableFull = rowsInUse >= OWN_TEAM_MAX;

  /**
   * Add N people with one job title and its usual duties; names are
   * placeholders that never repeat a name already in the table. The unnamed
   * Owner row stays unless the new rows are owners.
   */
  function addByTitle() {
    if (!quickEntry) return;
    setQuickCountText(String(quickCount));
    const result = addRowsByTitle(rows, quickEntry, quickCount, selected);
    if (result.added === 0) {
      setQuickNote(
        `Added nobody: this table holds ${OWN_TEAM_MAX} people. Add more in ${MORE_PEOPLE_PLACE} after setup.`,
      );
      return;
    }
    // A title never ticks a duty the setup answers place outside the team.
    setRows(withoutDutiesOffTeam(result.rows, answers));
    setFinishNote("");
    setQuickNote(
      result.notAdded > 0
        ? `Added ${result.added} of ${quickCount}: this table holds ${OWN_TEAM_MAX} people. Add the other ${result.notAdded} in ${MORE_PEOPLE_PLACE} after setup.`
        : `Added ${count(result.added, "person", "people")} as ${quickEntry.title}; rename them as you go.`,
    );
  }
  const industry = INDUSTRIES.find((i) => i.id === selected);
  const namedRows = rows.filter((r) => r.name.trim().length > 0);
  const onePerson = onePersonNote(namedRows.length);
  const hidden = useMemo(() => hiddenDuties(answers), [answers]);
  const visibleCoreDuties = CORE_DUTIES.filter((duty) => !hidden.has(duty));
  const effects = useMemo(
    () => setupEffects(answers, selected, answered),
    [answers, selected, answered],
  );

  // Titles two or more people share, for "untick one duty for all of them".
  const shared = useMemo(() => sharedTitlesWithDuties(rows), [rows]);
  const bulkRole = shared.some((t) => t.role === bulkTitle) ? bulkTitle : (shared[0]?.role ?? "");
  const bulkDuties = useMemo(
    () => dutiesHeldByTitle(rows, bulkRole).filter((duty) => !hidden.has(duty)),
    [rows, bulkRole, hidden],
  );
  const bulkPick = bulkDuty && bulkDuties.includes(bulkDuty) ? bulkDuty : (bulkDuties[0] ?? "");
  const bulkCount = shared.find((t) => t.role === bulkRole)?.count ?? 0;

  function untickForTitle() {
    if (!bulkRole || !bulkPick) return;
    const result = untickDutyForTitle(rows, bulkRole, bulkPick);
    if (result.changed === 0) return;
    setRows(result.rows);
    setGridStatus({
      text: `Unticked ${coreDutyLabel(bulkPick)} for ${count(result.changed, "person", "people")} with the job title ${bulkRole}.`,
    });
  }

  /**
   * When a role is typed, tick what that title usually holds, leaving out
   * duties the setup answers place outside the team. A later role change
   * re-ticks as long as the ticks are still the earlier suggestion or empty;
   * ticks the owner set by hand stay.
   */
  function suggestDuties(index: number) {
    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        const role = row.role.trim();
        if (!role || role === row.suggestedFor) return row;
        const owns = rowOwnsBusiness(row, selected);
        const previous = row.suggestedFor
          ? suggestedDuties(row.suggestedFor, owns, selected, answers)
          : [];
        const untouched = row.duties.length === 0 || stillSuggested(row.duties, previous, answers);
        // Duties the answers leave out are remembered, so changing the answer back ticks them.
        return untouched ? titleTicksFor(row, selected, answers) : row;
      }),
    );
  }

  /**
   * Fill the grid from a pasted HR or payroll export, or a plain "Name,
   * Title" list. Someone already in the table (same employee id or name) is
   * updated, not added twice; only new people count toward the limit.
   */
  function fillFromPaste() {
    const result = readPastedRoster(paste, getIndustryTemplate(selected));
    const applied = applyPaste(rows, result, selected, leftOut);
    setPasteIssues(result.issues);
    setLeftOut(applied.leftOut);
    setUnresolvedRows(applied.unresolvedRows);
    // A changed roster needs a fresh statement about what the resulting map covers.
    setFacts((current) => ({ ...current, mappingScope: undefined }));
    if (applied.rows) {
      setRows(withoutDutiesOffTeam(applied.rows, answers));
      setFinishNote("");
    }
    setPasteNote(applied.note);
    // Anyone left out keeps the paste in the box, to add later.
    if (!applied.keepPaste) setPaste("");
    focusSoon(() => noteRef.current);
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
      text: `Removed ${coreDutyLabel(duty)} from ${whoIs(row, index)}. Add it back with "Add a duty" under the job title.`,
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
  /** Adds a duty by hand: the owner's own entry, so it counts at once. */
  function addDuty(index: number, duty: EntitlementId) {
    setRows((current) =>
      current.map((row, i) =>
        i === index && !row.duties.includes(duty) ? toggleDutyByHand(row, duty) : row,
      ),
    );
  }
  /** Ticks or unticks a duty by hand; a duty ticked by hand counts at once. */
  function toggleDuty(index: number, duty: EntitlementId) {
    setRows((current) =>
      current.map((row, i) => (i === index ? toggleDutyByHand(row, duty) : row)),
    );
  }
  /**
   * After a Keep or Remove in the review, focus goes to the next decision for
   * the same person, then to the next person's, then to the finish button.
   */
  function focusNextDecision(rowId: string) {
    focusSoon(
      () =>
        document.querySelector<HTMLElement>(`[data-confirm-row="${rowId}"] [data-keep]`) ??
        document.querySelector<HTMLElement>("[data-confirm-row] [data-keep]") ??
        finishRef.current,
    );
  }
  /** Keeps suggested duties for one person: from now on they count. */
  function keepSuggested(rowId: string, duties: readonly EntitlementId[]) {
    const index = rows.findIndex((row) => row.rowId === rowId);
    if (index < 0) return;
    setRows((current) =>
      current.map((row) => (row.rowId === rowId ? keepDuties(row, duties) : row)),
    );
    setGridStatus({
      text:
        duties.length === 1
          ? `Kept ${coreDutyLabel(duties[0])} for ${whoIs(rows[index], index)}.`
          : `Kept ${count(duties.length, "duty", "duties")} for ${whoIs(rows[index], index)}.`,
    });
    if (finishNote) setFinishNote("");
    focusNextDecision(rowId);
  }
  /** Removes one suggested duty from one person. */
  function removeSuggested(rowId: string, duty: EntitlementId) {
    const index = rows.findIndex((row) => row.rowId === rowId);
    if (index < 0) return;
    setRows((current) =>
      current.map((row) =>
        row.rowId === rowId ? { ...row, duties: row.duties.filter((d) => d !== duty) } : row,
      ),
    );
    setGridStatus({
      text: `Removed ${coreDutyLabel(duty)} from ${whoIs(rows[index], index)}.`,
    });
    if (finishNote) setFinishNote("");
    focusNextDecision(rowId);
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
    // A duty a job title suggested counts only once kept: every one is decided first.
    const waits = finishWaits(titleTicks);
    if (waits) {
      showDecisions(waits.first.rowId);
      return;
    }
    const people = buildOwnTeam(rows, selected, answers);
    if (people.length === 0) return;
    if (scopeRequired && !facts.mappingScope) {
      setFinishNote(
        "Choose what this map covers. Precog cannot treat an unresolved roster as a complete assessment.",
      );
      document.querySelector<HTMLElement>('input[name="mapping_scope"]')?.focus();
      return;
    }
    const scaleNote = teamSizeScaleWarning(people.length);
    const onLeave = onLeavePersonIds(rows);
    clearDraft();
    startOwnBusiness({
      industry: selected,
      practiceName: businessName,
      people,
      answers,
      leftOut,
      onboardingFacts: facts,
    });
    if (scaleNote) toast.warning(scaleNote, { duration: 8000 });
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
          note: "On leave in the pasted roster; the roster gives no return date.",
        })),
      ]);
    }
  }

  // One warning when this browser cannot keep the setup: site data is
  // blocked, or this tab could not save the draft.
  const storageNote =
    keepsNothing || draftSaved === false ? (
      <p
        className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn"
        role="status"
      >
        This browser will not keep your progress: finish in this sitting.
      </p>
    ) : null;

  // Setting up an added business: the owner can go back without finishing.
  // The draft restores when storage works; only a browser that keeps
  // nothing asks first, since going back loses what was typed.
  const cancelLink = setupReturnsTo ? (
    <p className="text-center text-xs">
      <button
        type="button"
        className="text-muted underline underline-offset-2 hover:text-fg"
        onClick={() => {
          const ask = cancelSetupConfirm({
            typed: draftHasTypedWork({ businessName, rows, paste }),
            keepsNothing,
            draftSaved,
          });
          if (!ask || window.confirm(ask)) void cancelSetup();
        }}
      >
        Cancel and go back to {setupReturnsTo.name}
      </button>
    </p>
  ) : null;

  const titleCls = "text-xl font-semibold tracking-tight outline-hidden sm:text-2xl";

  const attentionIndices = useMemo(
    () =>
      new Set(
        rows.flatMap((row, index) =>
          rowNeedsReview(row, typedSeat(row, selected)) ? [index] : [],
        ),
      ),
    [rows, selected],
  );
  const scopeRequired = requiresMappingScope(facts, unresolvedRows);
  const scopedAssessment =
    scopeRequired && (unresolvedRows > 0 || facts.mappingScope !== "whole_business");

  const finishLabel = scopedAssessment ? "Show scoped findings" : "Show me my gaps";
  // Where the setup lives until Finish, said once under the header; a
  // browser that keeps nothing shows its own warning instead.
  const keptNotice =
    keepsNothing || draftSaved === false ? null : (
      <p className="text-xs text-muted">
        Precog keeps this business once you press &ldquo;{finishLabel}&rdquo;. Until then it stays
        only in this browser tab.
      </p>
    );
  // Each row's duties a job title suggested and the owner has not yet kept,
  // worked out once for the grid's note under each title, the review of
  // them, and what holds Finish back.
  const titleTicked = useMemo(
    () => new Map(rows.map((row) => [row, unconfirmedDuties(row, selected, answers)])),
    [rows, selected, answers],
  );
  const titleTicks = useMemo(
    () => titleTicksItems(rows, selected, answers, (row) => titleTicked.get(row) ?? []),
    [rows, selected, answers, titleTicked],
  );
  const waits = finishWaits(titleTicks);

  /** Brings one person's suggested duties into view in the review, with focus on the first Keep. */
  function showDecisions(rowId: string) {
    focusSoon(() => {
      const button = document.querySelector<HTMLElement>(
        `[data-confirm-row="${rowId}"] [data-keep]`,
      );
      button?.scrollIntoView({ block: "center" });
      return button;
    });
  }

  /** Brings a person's row into view from the review, with focus on their job title. */
  function showRow(rowId: string) {
    setReviewOnly(false);
    focusSoon(() => {
      const input = document.querySelector<HTMLElement>(`[data-role-cell="${rowId}"] input`);
      input?.scrollIntoView({ block: "center" });
      return input;
    });
  }

  /** Arrow keys, Home and End move the choice between lines of business, as in any radio group. */
  function moveIndustry(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const index = INDUSTRIES.findIndex((i) => i.id === selected);
    const last = INDUSTRIES.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    const id = INDUSTRIES[next].id;
    setSelected(id);
    focusSoon(() => document.getElementById(`industry-choice-${id}`));
  }

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
          // The team grid takes the screen's width wherever the screen has it,
          // so every duty column shows without scrolling sideways.
          step === "team" ? "max-w-3xl lg:max-w-7xl" : "max-w-3xl",
        )}
      >
        {step === "industry" ? (
          <>
            <CardHeader>
              <Badge variant="accent" className="w-fit">
                Welcome to Precog
              </Badge>
              <h2 id="industry-onboarding-title" ref={titleRef} tabIndex={-1} className={titleCls}>
                Which line of business is this?
              </h2>
              <CardDescription>
                Pick the closest line of business. Next, enter your own team or explore a sample
                first. You can change the line of business later in Business settings, from the
                business menu.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {storageNote}
              <div
                className="grid gap-2 sm:grid-cols-2"
                role="radiogroup"
                aria-labelledby="industry-onboarding-title"
              >
                {INDUSTRIES.map((ind) => {
                  const Icon = ICONS[ind.id];
                  const tpl = getIndustryTemplate(ind.id);
                  const active = selected === ind.id;
                  return (
                    <button
                      key={ind.id}
                      id={`industry-choice-${ind.id}`}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      tabIndex={active ? 0 : -1}
                      onClick={() => setSelected(ind.id)}
                      onKeyDown={moveIndustry}
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
                          <p className="font-medium">{ind.label}</p>
                          <p className="mt-0.5 text-xs text-muted">{ind.tagline}</p>
                          <p className="mt-1 text-xs text-subtle">{ind.sampleNote}</p>
                          <p className="mt-2 text-xs text-subtle">
                            Sample: {tpl.processes.length} processes, {tpl.people.length} people
                          </p>
                          <p className="mt-0.5 text-xs text-subtle">{CASE_PHRASE[ind.id]}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="sticky bottom-0 -mx-6 border-t border-border bg-surface px-6 py-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    className="w-full"
                    onClick={() => {
                      // A nonprofit's first row is its executive director, not an owner.
                      setRows((current) => firstRowForIndustry(current, selected));
                      setStep("questions");
                      setQuestion("actor");
                    }}
                  >
                    Set up my own business
                  </Button>
                  <Button
                    className="w-full"
                    variant="secondary"
                    data-testid="explore-sample-business"
                    onClick={loadSample}
                  >
                    Explore the fictional sample
                  </Button>
                </div>
                <p className="mt-2 text-center text-xs text-subtle">
                  The sample team is fictional. Every gap on it says so until you enter your own.
                </p>
              </div>
              <LegalFooter className="justify-center" />
              {cancelLink}
            </CardContent>
          </>
        ) : step === "questions" ? (
          <OnboardingQuestionShell
            ref={titleRef}
            facts={facts}
            question={question}
            onFacts={setFacts}
            onBack={() => {
              const previous = adjacentQuestion(question, -1);
              if (previous) setQuestion(previous);
              else setStep("industry");
            }}
            onContinue={() => {
              const next = adjacentQuestion(question, 1);
              if (next) {
                setQuestion(next);
                return;
              }
              setStep("money");
            }}
            storageNote={storageNote}
            cancelLink={cancelLink}
          />
        ) : step === "money" ? (
          <>
            <CardHeader>
              <Badge variant="accent" className="w-fit">
                {industry?.label}
              </Badge>
              <h2 id="industry-onboarding-title" ref={titleRef} tabIndex={-1} className={titleCls}>
                How money moves here
              </h2>
              <CardDescription>
                A few quick answers tailor the duties and first steps to how this business works.
                Not sure is fine.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {storageNote}
              <SetupMoneyStep
                answers={answers}
                answered={answered}
                onChange={(next, question) => {
                  setAnswers(next);
                  setAnswered((current) => {
                    const chosen = current.includes(question) ? current : [...current, question];
                    // The camera question goes, unanswered, when no cash is taken.
                    return next.cashOrChecks === "no"
                      ? chosen.filter((q) => q !== "cameras")
                      : chosen;
                  });
                }}
                industry={selected}
                onNext={() => {
                  // Answers changed after people were added untick what they rule out, and
                  // tick again what an earlier answer unticked and these bring back.
                  setRows((current) => fitDutiesToAnswers(current, answers, selected));
                  if (facts.setupMethod !== "person_grid") setPasteOpen(true);
                  setStep("team");
                }}
                onBack={() => {
                  setQuestion("setup_method");
                  setStep("questions");
                }}
              />
              <p className="text-center text-xs text-subtle">
                Nothing leaves this browser until you sign in and choose to sync.
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
                Name your people and tick the money duties each one handles today; you can refine
                everything later in {tabName("sod")}.
              </CardDescription>
              {keptNotice}
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
              {facts.setupMethod && facts.setupMethod !== "person_grid" && (
                <section
                  className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4"
                  aria-labelledby="roster-start-heading"
                >
                  <h3 id="roster-start-heading" className="font-medium">
                    {facts.setupMethod === "job_groups"
                      ? "Start the staged job-group path"
                      : "Start from your roster"}
                  </h3>
                  <p className="text-xs text-muted">
                    {facts.setupMethod === "job_groups"
                      ? "Grouped-role setup is staged. Paste the existing roster here; Precog groups recognized job titles while keeping named people available for control findings."
                      : "Paste an HR or payroll export, header row included, or one person per line as Name, Job title. You will review the mapped control participants next."}
                  </p>
                  <textarea
                    className={cn(fieldCls, "min-h-28 w-full font-mono text-xs")}
                    aria-label="Pasted roster to start setup"
                    placeholder={"Ana Ruiz, Office Manager\nBen Ochoa, Bookkeeper"}
                    value={paste}
                    onChange={(event) => setPaste(event.target.value)}
                  />
                  <Button size="sm" onClick={fillFromPaste} disabled={!paste.trim()}>
                    Fill the table
                  </Button>
                </section>
              )}
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Business name</span>
                <input
                  className={cn(fieldCls, "max-w-md")}
                  placeholder={
                    industry?.demoName ? `For example, ${industry.demoName}` : "Business name"
                  }
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  maxLength={MAX_BUSINESS_NAME}
                />
              </label>

              <datalist id="job-title-options">
                {offeredJobs.map((j) => (
                  <option key={j.id} value={j.title} />
                ))}
              </datalist>

              <section
                className="flex flex-wrap items-center justify-between gap-2"
                aria-label="Setup review progress"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {count(namedRows.length, "person named", "people named")} ·{" "}
                    {count(attentionIndices.size, "row")} to review
                  </p>
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={reviewOnly}
                      onChange={(event) => {
                        setReviewOnly(event.target.checked);
                        setReviewRowIds(
                          new Set(
                            rows
                              .filter((_, index) => attentionIndices.has(index))
                              .map((row) => row.rowId ?? ""),
                          ),
                        );
                      }}
                    />
                    Show only rows to review
                  </label>
                  {reviewOnly && (
                    <p role="status" className="text-xs text-muted">
                      {attentionIndices.size === 0
                        ? "No name or job title remains to review. Show all rows to check their suggested duties."
                        : "Showing rows to review. Rows you fix stay in view; hidden rows stay on your team."}
                    </p>
                  )}
                </div>
                {rows.length > 3 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      waits ? showDecisions(waits.first.rowId) : finishRef.current?.focus()
                    }
                    disabled={namedRows.length === 0}
                  >
                    Skip to the finish button
                  </Button>
                )}
              </section>
              {gridOverflows && !gridScrolled ? (
                <p
                  role="status"
                  className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn"
                >
                  Scroll sideways for more duties. Names stay on the left; duty names stay on top.
                </p>
              ) : null}
              <p className="text-xs text-muted">
                {gridOverflows && gridScrolled
                  ? "Scroll sideways for more duties. Names stay on the left; duty names stay on top."
                  : `${rowsInUse} of up to ${OWN_TEAM_MAX} people.`}{" "}
                A job title&rsquo;s other duties show as small tags under it; remove one with ×, or
                add another with &ldquo;Add a duty&rdquo;. A recognized job title is not proof of
                actual access: check the suggested ticks.
              </p>
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
                        Job title
                      </th>
                      {visibleCoreDuties.map((duty) => (
                        <th
                          key={duty}
                          scope="col"
                          className="sticky top-0 z-20 border-b border-border bg-elevated p-2 text-center font-normal text-muted"
                        >
                          <DutyHeading duty={duty} />
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
                      if (
                        reviewOnly &&
                        !reviewRowIds.has(row.rowId ?? "") &&
                        !attentionIndices.has(index)
                      )
                        return null;
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
                              className={cn(fieldCls, "w-28 sm:w-36")}
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
                            <YearsHereInput
                              key={`${rowKey}-${row.tenureYears ?? ""}`}
                              who={who}
                              years={row.tenureYears}
                              onCommit={(tenureYears) => updateRow(index, { tenureYears })}
                            />
                            {industryHasOwner(selected) && (
                              <label className="mt-1 flex min-h-6 items-center gap-1.5 text-xs text-muted">
                                <input
                                  type="checkbox"
                                  className="size-4"
                                  aria-label={`${who} owns the business`}
                                  checked={rowOwnsBusiness(row, selected)}
                                  onChange={(e) => updateRow(index, { owner: e.target.checked })}
                                />
                                Owns the business
                              </label>
                            )}
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
                              className={cn(fieldCls, "w-44 sm:w-52")}
                              placeholder="For example, Bookkeeper"
                              aria-label={`${who} job title`}
                              list="job-title-options"
                              value={row.role}
                              onChange={(e) => updateRow(index, { role: e.target.value })}
                              onBlur={() => suggestDuties(index)}
                              maxLength={MAX_ROLE_LENGTH}
                            />
                            <SeatNote
                              seat={typedSeat(row, selected)}
                              duties={titleTicked.get(row) ?? []}
                            />
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
                              hidden={hidden}
                              onAdd={(duty) => addDuty(index, duty)}
                            />
                          </td>
                          {visibleCoreDuties.map((duty) => (
                            <td key={duty} className="border-b border-border p-0 text-center">
                              <label
                                className={cn(
                                  "flex min-h-11 w-full items-center justify-center p-1.5",
                                  titleTicked.get(row)?.includes(duty) && "bg-warn/15",
                                )}
                                title={
                                  titleTicked.get(row)?.includes(duty)
                                    ? "From the job title, not counted yet: keep or remove it below the table"
                                    : undefined
                                }
                              >
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
                  disabled={tableFull}
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

              {shared.length > 0 && (
                <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-elevated/50 p-3">
                  <p className="w-full text-xs text-muted">
                    Untick one duty for everyone with the same job title:
                  </p>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted">Job title</span>
                    <select
                      className={cn(fieldCls, "w-56 max-w-full")}
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
                      className={cn(fieldCls, "w-56 max-w-full")}
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

              <section className="space-y-2" aria-labelledby="fill-faster-heading">
                <h3 id="fill-faster-heading" className="text-sm font-medium">
                  Fill the table faster
                </h3>
                <JobCatalogSheet prominent />
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
                      Paste the roster as exported, header row included, or one person per line as{" "}
                      <span className="font-mono">Name, Job title</span>. Precog matches job titles
                      such as Bookkeeper, Office Manager, AP Specialist, or Cashier to a catalog of
                      common jobs and ticks their usual duties. Precog updates people already in the
                      table rather than adding them twice, and skips people the roster marks as
                      having left.
                    </p>
                    <textarea
                      className={cn(fieldCls, "min-h-28 w-full font-mono text-xs")}
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
                      Pick a common job, say how many, and rows appear with placeholder names and
                      that job&rsquo;s usual duties ticked. Rename them as you go.
                    </p>
                    <button
                      type="button"
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => setShowAllJobs((open) => !open)}
                    >
                      {showAllJobs
                        ? "Show titles for this line of business"
                        : "Show every job title"}
                    </button>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted">Job title</span>
                        <select
                          className={cn(fieldCls, "w-64 max-w-full")}
                          value={quickTitle}
                          onChange={(e) => setQuickTitle(e.target.value)}
                        >
                          <option value="">Choose a job title</option>
                          {(Object.keys(JOB_FAMILY_LABEL) as JobFamily[])
                            .filter((family) => offeredJobs.some((job) => job.family === family))
                            .map((family) => (
                              <optgroup key={family} label={JOB_FAMILY_LABEL[family]}>
                                {offeredJobs
                                  .filter(
                                    // The table already has the owner's row.
                                    (j) => j.family === family && j.id !== "owner",
                                  )
                                  .map((j) => (
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
                          className={cn(fieldCls, "w-20")}
                          value={quickCountText}
                          onChange={(e) => setQuickCountText(e.target.value)}
                          onBlur={() => setQuickCountText(String(quickCount))}
                        />
                      </label>
                      <Button size="sm" onClick={addByTitle} disabled={!quickEntry || tableFull}>
                        Add {count(quickCount, "person", "people")}
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
                  </div>
                </details>
              </section>

              {scopeRequired && (
                <MappingScopeAttestation
                  scope={facts.mappingScope}
                  unresolvedRows={unresolvedRows}
                  scopedAssessment={scopedAssessment}
                  onChoose={(value) => {
                    setFacts((current) => withMappingScope(current, value));
                    setFinishNote("");
                  }}
                />
              )}

              <div className="grid gap-3 xl:grid-cols-2">
                <SetupPreviewCard rows={rows} industry={selected} answers={answers} />
                <Card className="border-border bg-elevated/40">
                  <CardContent className="space-y-3 pt-5">
                    <h3 className="text-sm font-semibold">What your answers change</h3>
                    {effects.changed.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted">
                        {effects.changed.map((effect) => (
                          <li key={effect}>{effect}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted">
                        No duties or safeguards changed based on these answers.
                      </p>
                    )}
                    <details className="rounded-lg border border-border bg-panel/60 p-2.5">
                      <summary className="cursor-pointer text-xs font-medium">
                        Assumed, not asked
                      </summary>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted">
                        {effects.assumed.map((effect) => (
                          <li key={effect}>{effect}</li>
                        ))}
                      </ul>
                    </details>
                    <button
                      type="button"
                      className="text-xs font-medium text-primary underline underline-offset-2"
                      onClick={() => setStep("money")}
                    >
                      Change answers
                    </button>
                  </CardContent>
                </Card>
              </div>
              {onePerson && (
                <p className="rounded-lg border border-border bg-elevated/50 px-3 py-2 text-xs text-muted">
                  {onePerson}
                </p>
              )}
              <TitleTicksReview
                items={titleTicks}
                onShow={showRow}
                onKeep={keepSuggested}
                onRemove={removeSuggested}
              />
              {finishNote && (
                <p className="text-xs text-danger" role="alert">
                  {finishNote}
                </p>
              )}
              {waits && (
                <FinishWaitsNote
                  id="finish-waits"
                  finishLabel={finishLabel}
                  waiting={waits.waiting}
                  first={waits.first}
                  onShow={showDecisions}
                />
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  ref={finishRef}
                  className="w-full"
                  onClick={finish}
                  disabled={namedRows.length === 0 || waits !== null}
                  aria-describedby={waits ? "finish-waits" : undefined}
                >
                  {finishLabel}
                </Button>
                <Button className="w-full" variant="secondary" onClick={() => setStep("money")}>
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

export function MappingScopeAttestation({
  scope,
  unresolvedRows,
  scopedAssessment,
  onChoose,
}: {
  scope?: MappingScope;
  unresolvedRows: number;
  scopedAssessment: boolean;
  onChoose: (scope: MappingScope) => void;
}) {
  const options: readonly (readonly [MappingScope, string])[] = [
    [
      "whole_business",
      "This roster includes everyone who handles or controls money across the whole business.",
    ],
    [
      "one_location",
      "This is a scoped map of one location; the rest of the business is not fully assessed.",
    ],
    [
      "one_team",
      "This is a scoped map of one team; the rest of the business is not fully assessed.",
    ],
  ];
  return (
    <fieldset className="space-y-2 rounded-xl border border-warn/40 bg-warn/10 p-4">
      <legend className="px-1 text-sm font-medium">Confirm what this map covers</legend>
      <p className="text-xs text-muted">
        {unresolvedRows > 0
          ? `${unresolvedRows.toLocaleString("en-US")} valid roster ${unresolvedRows === 1 ? "row is" : "rows are"} not in the review grid. Unknown or unresolved people earn no control credit.`
          : "A workforce of 100 or more needs an explicit scope before Precog produces findings."}
      </p>
      {options.map(([value, label]) => (
        <label key={value} className="flex items-start gap-2 text-xs">
          <input
            type="radio"
            name="mapping_scope"
            value={value}
            checked={scope === value}
            onChange={() => onChoose(value)}
            className="mt-0.5 size-4"
          />
          <span>{label}</span>
        </label>
      ))}
      {scope && scopedAssessment && (
        <p role="status" className="text-xs font-medium text-warn">
          Precog will produce a scoped map. People outside it are not fully assessed.
        </p>
      )}
    </fieldset>
  );
}

/** How long the draft waits after the last edit before it is written to this tab. */
const DRAFT_WRITE_DELAY_MS = 250;

/** How many prosecuted cases the library holds for each line of business, beside the whole library's count. */
const CASE_PHRASE = Object.fromEntries(
  INDUSTRIES.map((ind) => [ind.id, caseCoveragePhrase(ind.id)]),
) as Record<IndustryId, string>;
