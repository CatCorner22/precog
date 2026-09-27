/**
 * State and actions behind the continuity planner (the Who knows what tab),
 * grouped as the screen reads: the figures, the register, the check-in, the
 * what-if card, leave, people leaving, and the Journal steps the cards log.
 * Each card receives the one group it works with.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useToday } from "@/lib/use-today";
import {
  usePracticeActions,
  usePracticeState,
  type PracticeActions,
} from "@/lib/precog/practice-context";
import {
  clampPage,
  pageCount,
  pageSlice,
  REGISTER_ITEM_PAGE,
  REGISTER_PEOPLE_PAGE,
} from "@/lib/precog/continuity/register-window";
import { continuityCommitments } from "@/lib/precog/decisions/follow-through";
import {
  parseRegisterCsv,
  registerTemplateCsv,
  registerToCsv,
} from "@/lib/precog/import/register-csv";
import type { ImportIssue } from "@/lib/precog/import/csv";
import { DEFAULT_BUSINESS_ID } from "@/lib/precog/business-id";
import { absenceImpact, type AbsenceAction } from "@/lib/precog/continuity/absence-impact";
import type { ContinuityStep } from "@/lib/precog/decisions/follow-through";
import {
  checkInPlan,
  CONFIRMATION_MAX_AGE_DAYS,
  staleItems,
} from "@/lib/precog/continuity/staleness";
import {
  coverageDrops,
  coverageReport,
  criticalSinglePoints,
  setRelationLevel,
  type CoverageReport,
  type CrossTrainingMove,
  type ItemCoverage,
} from "@/lib/precog/continuity/coverage";
import { documentationDebt, type DocumentationGap } from "@/lib/precog/continuity/documentation";
import { defaultCategory } from "@/lib/precog/continuity/knowledge-category";
import {
  dateAfter,
  formatDay,
  formatDayRange,
  isCalendarDate,
  localDateKey,
} from "@/lib/precog/dates";
import {
  registerAssessed,
  registerSource,
  trackRegisterFreshness,
} from "@/lib/precog/continuity/register-state";
import {
  endAbsence,
  extendAbsence,
  plannedAbsenceReport,
  unplannedAbsenceToday,
  type AbsenceWindow,
} from "@/lib/precog/continuity/planned-absence";
import {
  leaveDebriefs,
  type DebriefItem,
  type LeaveDebrief,
} from "@/lib/precog/continuity/leave-debrief";
import {
  canMarkLeft,
  leavers,
  markLeft,
  setLastDay,
  type Leaver,
} from "@/lib/precog/continuity/leavers";
import { makePlannedAbsenceId, type PracticeProfile } from "@/lib/precog/practice-profile";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import type {
  Criticality,
  KnowledgeItem,
  KnowledgeKind,
  KnowledgeLevel,
  Person,
} from "@/lib/precog/types";
import { industryMeta } from "@/lib/precog/industry";
import { count, firstName, uid, verb } from "@/lib/precog/text";
import { downloadCsv } from "@/lib/download";
import {
  checkInViewFor,
  debriefKey,
  importRegisterPrompt,
  promotionClosesTraining,
  removeItemPrompt,
  resetRegisterPrompt,
  settlesDebrief,
  stepAbsenceId,
  stepCommitment,
  untrackedItems,
  wholeStep,
  whatIfAbsentIds,
} from "@/components/precog/continuity/planner-logic";

export type ContinuityPlanner = ReturnType<typeof useContinuityPlanner>;
export type PlannerFigures = ContinuityPlanner["figures"];
export type RegisterEditor = ContinuityPlanner["register"];
export type CheckIn = ContinuityPlanner["checkIn"];
export type JournalSteps = ContinuityPlanner["journal"];
export type WhatIf = ContinuityPlanner["whatIf"];
export type LeavePlanner = ContinuityPlanner["leave"];
export type LeavingPlanner = ContinuityPlanner["leaving"];

export function useContinuityPlanner(initialKnowledgeId?: string | null) {
  const { template: tpl, profile } = usePracticeState();
  const actions = usePracticeActions();
  const todayDate = useToday();
  const today = localDateKey(todayDate);
  const report = useMemo(() => coverageReport(tpl), [tpl]);
  const docs = useMemo(() => documentationDebt(tpl), [tpl]);
  const people = useMemo(() => tpl.people.filter((p) => p.active), [tpl.people]);

  const figures = usePlannerFigures(tpl, report);
  const writes = useRegisterWrites(actions, today);
  const journal = useJournalSteps(actions, profile, tpl, todayDate);
  const checkIn = useCheckIn(profile, tpl, report, today, writes);
  const register = useRegisterEditor(actions, profile, tpl, report, people, {
    today,
    initialKnowledgeId,
    writes,
    checkIn,
  });
  const whatIf = useWhatIf(tpl, report, people);
  const leave = useLeave(actions, profile, tpl, people, today, journal, writes.setLevel);
  const leaving = useLeaving(actions, profile, tpl, people, today);

  return {
    tpl,
    industry: profile.industry,
    today,
    report,
    docs,
    people,
    /** False while nobody is marked on the register: the figures and cards cannot say anything yet. */
    registerAssessed: registerAssessed(tpl),
    /** Confirmation dates are tracked only for a register the owner filled in. */
    trackFreshness: trackRegisterFreshness(profile, tpl),
    figures,
    register,
    checkIn,
    journal,
    whatIf,
    leave,
    leaving,
  };
}

/** The tiles at the top of the planner. */
function usePlannerFigures(tpl: IndustryTemplate, report: CoverageReport) {
  // The same count the Dashboard and the business profile's sole-owner figure use.
  const singlePoints = useMemo(() => criticalSinglePoints(tpl), [tpl]);
  const importantSinglePoints = report.items.filter(
    (i) => i.item.criticality === "important" && i.primaries.length <= 1,
  ).length;
  const mostDepended = report.people.find((l) => l.person.active);
  return { singlePoints, importantSinglePoints, mostDepended };
}

/**
 * Writes to the register. Marking someone (or removing a mark) and pressing
 * a "still true" button confirm an item as of today; any other edit is a
 * plain change and leaves the confirmation date alone.
 */
function useRegisterWrites(actions: PracticeActions, today: string) {
  const { setCustomKnowledge, setCustomRelations } = actions;
  const confirm = (ids: ReadonlySet<string>) =>
    setCustomKnowledge((current) =>
      current.map((k) => (ids.has(k.id) ? { ...k, confirmedAt: today } : k)),
    );
  const setLevel = (personId: string, knowledgeId: string, level: KnowledgeLevel | undefined) => {
    setCustomRelations((current) => setRelationLevel(current, personId, knowledgeId, level));
    confirm(new Set([knowledgeId]));
  };
  const confirmItems = (ids: string[]) => {
    confirm(new Set(ids));
    toast.success(
      ids.length === 1
        ? `Confirmed — re-check again in ${CONFIRMATION_MAX_AGE_DAYS} days.`
        : `${ids.length} items confirmed.`,
    );
  };
  const updateItem = (id: string, patch: Partial<KnowledgeItem>) =>
    setCustomKnowledge((current) => current.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  return { setLevel, confirmItems, updateItem };
}

/** Continuity steps in the Decisions log: which are logged, and logging new ones. */
function useJournalSteps(
  actions: PracticeActions,
  profile: PracticeProfile,
  tpl: IndustryTemplate,
  todayDate: Date,
) {
  const today = localDateKey(todayDate);
  const commitments = useMemo(
    () => continuityCommitments(profile.decisions, tpl, today),
    [profile.decisions, tpl, today],
  );
  const trackedBy = (knowledgeId: string, step: ContinuityStep, absenceId?: string) =>
    stepCommitment(commitments, knowledgeId, step, absenceId);
  /** An absence step is "in the Journal" once every item it names has an open entry for that step. */
  const stepTracked = (a: AbsenceAction, absenceId?: string) =>
    wholeStep(a, (id) => trackedBy(id, a.step, absenceId));

  const log = (
    subject: string,
    note: string,
    knowledgeId: string,
    step: ContinuityStep,
    reviewBy: string,
    personId?: string,
    absenceId?: string,
  ) =>
    actions.addDecision({
      subject,
      kind: "remediate",
      note,
      reviewBy,
      linkedTab: "knowledge",
      linkedId: knowledgeId,
      linkedStep: step,
      linkedPersonId: personId,
      linkedAbsenceId: absenceId,
    });
  const confirmLogged = (reviewBy: string, steps = 1) =>
    toast.success(
      `${steps === 1 ? "Logged" : `${steps} steps logged`} in the Journal — the register is re-checked at the review on ${formatDay(reviewBy)}.`,
    );
  /** One step on one item, reviewed in 30 days. */
  const logStep = (
    subject: string,
    note: string,
    knowledgeId: string,
    step: ContinuityStep,
    personId?: string,
  ) => {
    const reviewBy = dateAfter(todayDate, 30);
    log(subject, note, knowledgeId, step, reviewBy, personId);
    confirmLogged(reviewBy);
  };
  const logMove = (m: CrossTrainingMove) =>
    logStep(m.item.name, m.action, m.item.id, "cover", m.trainee?.id);
  const logGap = (g: DocumentationGap) => logStep(g.item.name, g.action, g.item.id, g.step);
  /**
   * One entry per item, so each item's snapshot, review and slip check stand on
   * their own. Hand-offs logged from a leave window remember that absence, so
   * they never pass for the hand-off of a later one.
   */
  const logAbsenceAction = (a: AbsenceAction, reviewBy?: string, absenceId?: string) => {
    const due = reviewBy ?? dateAfter(todayDate, 30);
    const pending = untrackedItems(a, tpl.knowledge, (id, step) =>
      Boolean(trackedBy(id, step, absenceId)),
    );
    for (const k of pending)
      log(k.name, a.text, k.id, a.step, due, undefined, stepAbsenceId(a.step, absenceId));
    confirmLogged(due, pending.length);
  };
  return { trackedBy, stepTracked, logStep, logMove, logGap, logAbsenceAction };
}

/**
 * Re-confirming the register person by person. The coverage at the start of
 * a check-in is kept, keyed to the business and industry it was taken from
 * (template item ids repeat across industries), so drops it causes can be shown.
 */
function useCheckIn(
  profile: PracticeProfile,
  tpl: IndustryTemplate,
  report: CoverageReport,
  today: string,
  writes: ReturnType<typeof useRegisterWrites>,
) {
  const freshness = useMemo(() => staleItems(tpl, today), [tpl, today]);
  const staleIds = useMemo(() => new Set(freshness.stale.map((s) => s.item.id)), [freshness.stale]);
  const plan = useMemo(() => checkInPlan(tpl, today), [tpl, today]);
  const [choice, setChoice] = useState<string | null>(null);
  const registerKey = `${profile.businessId ?? DEFAULT_BUSINESS_ID}:${profile.industry}`;
  const [baseline, setBaseline] = useState<{ key: string; report: CoverageReport } | null>(null);
  const drops = useMemo(
    () => (baseline && baseline.key === registerKey ? coverageDrops(baseline.report, report) : []),
    [baseline, registerKey, report],
  );
  const view = checkInViewFor(choice, plan);
  const setLevel = (personId: string, knowledgeId: string, level: KnowledgeLevel | undefined) => {
    if (!baseline || baseline.key !== registerKey) setBaseline({ key: registerKey, report });
    writes.setLevel(personId, knowledgeId, level);
  };
  return {
    staleCount: freshness.stale.length,
    staleIds,
    plan,
    view,
    active: plan.checkIns.find((c) => c.person.id === view),
    setChoice,
    drops,
    setLevel,
    confirmItems: writes.confirmItems,
    clearBaseline: () => setBaseline(null),
  };
}

/** The register grid: paging, the selected item, adding, removing, importing and exporting. */
function useRegisterEditor(
  actions: PracticeActions,
  profile: PracticeProfile,
  tpl: IndustryTemplate,
  report: CoverageReport,
  people: Person[],
  {
    today,
    initialKnowledgeId,
    writes,
    checkIn,
  }: {
    today: string;
    initialKnowledgeId?: string | null;
    writes: ReturnType<typeof useRegisterWrites>;
    checkIn: ReturnType<typeof useCheckIn>;
  },
) {
  const { setCustomKnowledge, setCustomRelations } = actions;
  const source = registerSource(profile);

  const [itemPage, setItemPage] = useState(0);
  const [peoplePage, setPeoplePage] = useState(0);
  const safeItemPage = clampPage(itemPage, report.items.length, REGISTER_ITEM_PAGE);
  const safePeoplePage = clampPage(peoplePage, people.length, REGISTER_PEOPLE_PAGE);

  const [selectedId, setSelectedId] = useState<string | null>(initialKnowledgeId ?? null);
  const selected: ItemCoverage | undefined =
    report.items.find((i) => i.item.id === selectedId) ?? report.singlePoints[0] ?? report.items[0];

  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState<KnowledgeKind>("duty");
  const [draftCriticality, setDraftCriticality] = useState<Criticality>("important");
  const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);

  const addItem = () => {
    const name = draftName.trim();
    if (!name) return;
    const item: KnowledgeItem = {
      id: uid("k"),
      name,
      kind: draftKind,
      criticality: draftCriticality,
      category: defaultCategory(draftKind),
      description: "",
      linkedProcessIds: [],
      documented: false,
      confirmedAt: today,
    };
    setCustomKnowledge((current) => [...current, item]);
    setSelectedId(item.id);
    setDraftName("");
  };

  const removeItem = (id: string) => {
    const item = tpl.knowledge.find((k) => k.id === id);
    if (item && !window.confirm(removeItemPrompt(item, tpl.relations))) return;
    setCustomKnowledge((current) => current.filter((k) => k.id !== id));
    setCustomRelations((current) => current.filter((r) => r.knowledgeId !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const resetToTemplate = () => {
    if (!window.confirm(resetRegisterPrompt(tpl, industryMeta(profile.industry).label))) return;
    setCustomKnowledge(null);
    setCustomRelations(null);
    setImportIssues([]);
    checkIn.clearBaseline();
  };

  const importCsv = async (file: File) => {
    setImportIssues([]);
    try {
      const result = parseRegisterCsv(await file.text(), tpl);
      const replacesOwn = result.knowledge.length > 0 && source === "own";
      if (replacesOwn && !window.confirm(importRegisterPrompt(tpl, result))) return;
      setImportIssues(result.issues);
      if (!result.knowledge.length) {
        toast.error(result.issues[0]?.message ?? "No duties or tasks found in that file");
        return;
      }
      setCustomKnowledge(result.knowledge);
      setCustomRelations(result.relations);
      setSelectedId(null);
      checkIn.clearBaseline();
      toast.success(
        `Imported ${count(result.knowledge.length, "item")} and ${count(result.relations.length, "assignment")}${
          result.issues.length
            ? `; read the ${count(result.issues.length, "import note")} below`
            : ""
        }`,
      );
    } catch {
      toast.error("Import failed", { description: "Choose a readable CSV file and try again." });
    }
  };

  return {
    source,
    people,
    itemPage: safeItemPage,
    setItemPage,
    itemPages: pageCount(report.items.length, REGISTER_ITEM_PAGE),
    peoplePage: safePeoplePage,
    setPeoplePage,
    peoplePages: pageCount(people.length, REGISTER_PEOPLE_PAGE),
    visibleItems: pageSlice(report.items, safeItemPage, REGISTER_ITEM_PAGE),
    visiblePeople: pageSlice(people, safePeoplePage, REGISTER_PEOPLE_PAGE),
    staleIds: checkIn.staleIds,
    selected,
    select: (id: string) => setSelectedId(id),
    draftName,
    setDraftName,
    draftKind,
    setDraftKind,
    draftCriticality,
    setDraftCriticality,
    importIssues,
    dismissImportIssues: () => setImportIssues([]),
    addItem,
    removeItem,
    ...writes,
    resetToTemplate,
    /** The starter list with nobody marked holds nothing of the owner's, so no confirmation. */
    clearStarter: () => setCustomKnowledge([]),
    importCsv,
    exportCsv: () => downloadCsv("precog-who-can-do-what.csv", registerToCsv(tpl)),
    exportTemplate: () => downloadCsv("precog-register-template.csv", registerTemplateCsv(tpl)),
  };
}

/** "If someone is out tomorrow": who is ticked and what stops. */
function useWhatIf(tpl: IndustryTemplate, report: CoverageReport, people: Person[]) {
  /** Null until the owner ticks or unticks someone; the card then starts with the most depended-on person. */
  const [ticked, setTicked] = useState<string[] | null>(null);
  const { ids, startedWith } = useMemo(
    () => whatIfAbsentIds(ticked, people, report),
    [ticked, people, report],
  );
  const absence = useMemo(() => (ids.length > 0 ? absenceImpact(tpl, ids) : null), [tpl, ids]);
  const toggle = (personId: string) =>
    setTicked(ids.includes(personId) ? ids.filter((id) => id !== personId) : [...ids, personId]);
  return { absentIds: ids, startedWith, toggle, absence };
}

/** Out today, planned leave, and the debrief once someone is back. */
function useLeave(
  actions: PracticeActions,
  profile: PracticeProfile,
  tpl: IndustryTemplate,
  people: Person[],
  today: string,
  journal: ReturnType<typeof useJournalSteps>,
  setLevel: (personId: string, knowledgeId: string, level: KnowledgeLevel | undefined) => void,
) {
  const { setPlannedAbsences, reviewDecision } = actions;
  const report = useMemo(
    () => plannedAbsenceReport(tpl, profile.plannedAbsences ?? [], profile.industry, today),
    [tpl, profile.plannedAbsences, profile.industry, today],
  );

  const [personId, setPersonId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showPast, setShowPast] = useState(false);
  const formValid = Boolean(personId) && isCalendarDate(from) && isCalendarDate(to) && from <= to;
  const add = () => {
    if (!formValid) return;
    const person = people.find((p) => p.id === personId);
    if (!person) return;
    setPlannedAbsences((current) => [
      ...current,
      { id: makePlannedAbsenceId(), personId: person.id, industry: profile.industry, from, to },
    ]);
    setFrom("");
    setTo("");
    toast.success(`${firstName(person.name)} out ${formatDayRange(from, to)} added.`);
  };
  const remove = (id: string) =>
    setPlannedAbsences((current) => current.filter((a) => a.id !== id));

  /** People already recorded out today, so "Out today" never doubles up an absence. */
  const outTodayIds = useMemo(
    () => new Set(report.windows.filter((w) => w.status === "current").map((w) => w.person.id)),
    [report.windows],
  );
  /** "Maya just called in sick": record it now and the card below becomes today's cover sheet. */
  const markOutToday = (person: Person) => {
    if (outTodayIds.has(person.id)) return;
    setPlannedAbsences((current) => [
      ...current,
      unplannedAbsenceToday(makePlannedAbsenceId(), person.id, profile.industry, today),
    ]);
    toast.success(`${firstName(person.name)} recorded out today.`);
  };
  const stillOutTomorrow = (w: AbsenceWindow) => {
    const next = extendAbsence(w.absence, today);
    setPlannedAbsences((current) => current.map((a) => (a.id === w.absence.id ? next : a)));
    toast.success(`${firstName(w.person.name)} out through ${formatDayRange(next.from, next.to)}.`);
  };
  /** "Back at work": the absence ended yesterday, so the debrief asks about it today. */
  const backAtWork = (w: AbsenceWindow) => {
    const ended = endAbsence(w.absence, today);
    setPlannedAbsences((current) =>
      ended
        ? current.map((a) => (a.id === w.absence.id ? ended : a))
        : current.filter((a) => a.id !== w.absence.id),
    );
    toast.success(
      ended
        ? `${firstName(w.person.name)} is back — debrief the stand-ins below.`
        : `${firstName(w.person.name)} is back; nothing was covered, so the entry was removed.`,
    );
  };

  const debriefs = useMemo(
    () =>
      leaveDebriefs(tpl, profile.plannedAbsences ?? [], profile.decisions, profile.industry, today),
    [tpl, profile.plannedAbsences, profile.decisions, profile.industry, today],
  );
  /** Debrief entries answered this session, so the card only asks about what is left. */
  const [debriefed, setDebriefed] = useState<Set<string>>(() => new Set());
  const markDebriefed = (absenceId: string) =>
    setPlannedAbsences((current) =>
      current.map((a) => (a.id === absenceId ? { ...a, debriefedAt: today } : a)),
    );
  /** Record one answer; once every entry of that leave has one, the leave stops asking. */
  const settle = (debrief: LeaveDebrief, entry: DebriefItem) => {
    if (settlesDebrief(debrief, entry, debriefed)) markDebriefed(debrief.absence.id);
    else
      setDebriefed((current) =>
        new Set(current).add(debriefKey(debrief.absence.id, entry.item.id)),
      );
  };
  const closeHandoff = (entry: DebriefItem, note: string) => {
    if (entry.handoff) reviewDecision(entry.handoff.id, "done", note);
  };
  const during = (debrief: LeaveDebrief) =>
    `while ${firstName(debrief.person.name)} was out (${formatDayRange(debrief.absence.from, debrief.absence.to)})`;
  /** Stand-in ran it for real: register says "can do", confirmed today, hand-off (and training aimed at them) closed. */
  const promoteStandIn = (debrief: LeaveDebrief, entry: DebriefItem, standIn: Person) => {
    const first = firstName(standIn.name);
    const note = `${first} covered ${entry.item.name} ${during(debrief)} and can now run it alone.`;
    setLevel(standIn.id, entry.item.id, "proficient");
    closeHandoff(entry, note);
    if (entry.training && promotionClosesTraining(entry, standIn))
      reviewDecision(entry.training.id, "done", note);
    settle(debrief, entry);
    toast.success(`${first} → Can do ${entry.item.name}, confirmed today.`);
  };
  /** Stand-in got through it but not alone yet: keep them as a learner and make the training a tracked step. */
  const keepTraining = (debrief: LeaveDebrief, entry: DebriefItem, standIn: Person) => {
    const first = firstName(standIn.name);
    if (!entry.standInLevel || entry.standInLevel === "aware")
      setLevel(standIn.id, entry.item.id, "basic");
    closeHandoff(
      entry,
      `${first} covered ${entry.item.name} ${during(debrief)}; not yet able to run it alone.`,
    );
    if (entry.training) {
      toast.success(`Cross-training ${first} on ${entry.item.name} is already in the Journal.`);
    } else {
      journal.logStep(
        entry.item.name,
        `Cross-train ${first} on ${entry.item.name}: covered it ${during(debrief)} but cannot yet run it alone.`,
        entry.item.id,
        "cover",
        standIn.id,
      );
    }
    settle(debrief, entry);
  };
  /** Nothing to change on the register: just close the leave's hand-off. */
  const closeDebriefItem = (debrief: LeaveDebrief, entry: DebriefItem) => {
    closeHandoff(
      entry,
      `Leave over (${formatDayRange(debrief.absence.from, debrief.absence.to)}); ${entry.item.name} back with ${firstName(debrief.person.name)}.`,
    );
    settle(debrief, entry);
  };
  const dismissDebrief = (absenceId: string) => {
    markDebriefed(absenceId);
    toast.success("Absence closed without register changes.");
  };

  return {
    report,
    history: [...report.past, ...report.unmatched],
    personId,
    setPersonId,
    from,
    setFrom,
    to,
    setTo,
    formValid,
    add,
    remove,
    showPast,
    setShowPast,
    outTodayIds,
    markOutToday,
    stillOutTomorrow,
    backAtWork,
    debriefs,
    answered: (debrief: LeaveDebrief, entry: DebriefItem) =>
      debriefed.has(debriefKey(debrief.absence.id, entry.item.id)),
    promoteStandIn,
    keepTraining,
    closeDebriefItem,
    dismissDebrief,
  };
}

/** People who have given notice: their last day, the hand-off, and marking them as left. */
function useLeaving(
  actions: PracticeActions,
  profile: PracticeProfile,
  tpl: IndustryTemplate,
  people: Person[],
  today: string,
) {
  const { setCustomPeople } = actions;
  const list = useMemo(
    () => leavers(tpl, profile.decisions, today),
    [tpl, profile.decisions, today],
  );
  /** People still on the team with no last day recorded yet. */
  const staying = useMemo(() => people.filter((p) => !p.lastDay), [people]);
  const [personId, setPersonId] = useState("");
  const [lastDay, setLastDayInput] = useState("");
  const formValid = Boolean(personId) && isCalendarDate(lastDay);
  const recordLastDay = () => {
    if (!formValid) return;
    const person = staying.find((p) => p.id === personId);
    if (!person) return;
    setCustomPeople((current) => setLastDay(current, person.id, lastDay));
    setPersonId("");
    setLastDayInput("");
    toast.success(
      `${firstName(person.name)}'s last day recorded — the hand-over checklist is below.`,
    );
  };
  const changeLastDay = (l: Leaver, day: string) => {
    if (!isCalendarDate(day)) return;
    setCustomPeople((current) => setLastDay(current, l.person.id, day));
  };
  const cancelLeaving = (l: Leaver) => {
    setCustomPeople((current) => setLastDay(current, l.person.id, null));
    toast.success(`${firstName(l.person.name)} is staying — last day cleared.`);
  };
  /** They have gone: kept on the team list as history, no longer counted for coverage. */
  const markAsLeft = (l: Leaver) => {
    const first = firstName(l.person.name);
    if (!canMarkLeft(l.person, today)) {
      toast.error(
        `${first}'s last day is ${formatDay(l.lastDay)} — mark ${first} as left once it has passed.`,
      );
      return;
    }
    if (
      !window.confirm(
        `Mark ${l.person.name} as left? ${first} stays in the history but no longer counts as cover for anything on the register${
          l.handover.length > 0
            ? ` — ${count(l.handover.length, "entry", "entries")} will have nobody who can run ${verb(l.handover.length, "it", "them")} alone`
            : ""
        }.`,
      )
    )
      return;
    setCustomPeople((current) => markLeft(current, l.person.id, today));
    toast.success(`${first} marked as left.`);
  };
  return {
    list,
    staying,
    personId,
    setPersonId,
    lastDay,
    setLastDay: setLastDayInput,
    formValid,
    recordLastDay,
    changeLastDay,
    cancelLeaving,
    markAsLeft,
  };
}
