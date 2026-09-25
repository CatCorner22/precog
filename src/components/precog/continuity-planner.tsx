import { useMemo, useRef, useState } from "react";
import { useToday } from "@/lib/precog/decisions/use-today";
import { BookOpen, Download, RotateCcw, Upload, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import {
  clampPage,
  pageCount,
  pageSlice,
  REGISTER_ITEM_PAGE,
  REGISTER_PEOPLE_PAGE,
} from "@/lib/precog/continuity/register-window";
import {
  continuityStepKey,
  handoffCommitment,
  isContinuityStepEntry,
  isDecisionOpen,
  linkedContinuityStep,
  linkedKnowledgeId,
  localDateKey,
} from "@/lib/precog/decisions/follow-through";
import {
  parseRegisterCsv,
  registerTemplateCsv,
  registerToCsv,
  type RegisterImportIssue,
} from "@/lib/precog/import/register-csv";
import {
  absenceImpact,
  type AbsenceAction,
  type ContinuityStep,
} from "@/lib/precog/continuity/absence-impact";
import {
  checkInPlan,
  staleItems,
  CONFIRMATION_MAX_AGE_DAYS,
} from "@/lib/precog/continuity/staleness";
import {
  coverageDrops,
  coverageReport,
  criticalSinglePoints,
  LEVEL_LABEL,
  LEVEL_ORDER,
  firstName,
  makeKnowledgeId,
  setRelationLevel,
  STATUS_LABEL,
  type CoverageReport,
  type CrossTrainingMove,
  type ItemCoverage,
} from "@/lib/precog/continuity/coverage";
import {
  DOCUMENTATION_LABEL,
  documentationDebt,
  type DocumentationGap,
} from "@/lib/precog/continuity/documentation";
import { isCalendarDate } from "@/lib/precog/dates";
import { registerAssessed, registerSource } from "@/lib/precog/continuity/register-state";
import { industryMeta } from "@/lib/precog/industry";
import {
  endAbsence,
  extendAbsence,
  formatDateRange,
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
  leavers,
  canMarkLeft,
  markLeft,
  setLastDay,
  type Leaver,
} from "@/lib/precog/continuity/leavers";
import { makePlannedAbsenceId } from "@/lib/precog/practice-profile";
import type {
  Criticality,
  KnowledgeItem,
  KnowledgeKind,
  KnowledgeLevel,
  Person,
} from "@/lib/precog/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { downloadText } from "@/lib/download";
import { RegisterGrid } from "@/components/precog/continuity/register-grid";
import {
  DependenceCard,
  LeavingTeamCard,
  OutTomorrowCard,
  PlannedLeaveCard,
} from "@/components/precog/continuity/planner-panels";
import { PeopleLine, Stat } from "@/components/precog/continuity/leave-cards";
import {
  CRITICALITY_LABEL,
  inputClass,
  isMarked,
  NOT_ASSESSED_HINT,
  NOT_ASSESSED_PLAN,
  STATUS_VARIANT,
  UNHELD_VIEW,
} from "@/lib/precog/continuity/planner-copy";
export function ContinuityPlanner({ initialKnowledgeId }: { initialKnowledgeId?: string | null }) {
  const {
    template: tpl,
    profile,
    setCustomKnowledge,
    setCustomRelations,
    setCustomPeople,
    setPlannedAbsences,
    addDecision,
    reviewDecision,
  } = usePractice();
  const report = useMemo(() => coverageReport(tpl), [tpl]);
  const docs = useMemo(() => documentationDebt(tpl), [tpl]);
  const today = localDateKey(useToday());
  /** Review date of the open journal entry for each (item, step) logged from this register. */
  const tracked = useMemo(() => {
    const byStep = new Map<string, string>();
    for (const d of profile.decisions) {
      const id = linkedKnowledgeId(d, profile.industry);
      if (!id || !isDecisionOpen(d) || !isContinuityStepEntry(d) || !d.reviewBy) continue;
      const key = continuityStepKey(id, linkedContinuityStep(d), d.linkedAbsenceId);
      if (!byStep.has(key)) byStep.set(key, d.reviewBy);
    }
    return byStep;
  }, [profile.decisions, profile.industry]);
  const trackedBy = (knowledgeId: string, step: ContinuityStep, absenceId?: string) =>
    absenceId && step === "handoff"
      ? handoffCommitment(tracked, knowledgeId, absenceId)
      : tracked.get(continuityStepKey(knowledgeId, step));

  const reviewDateIn30Days = () => {
    const reviewBy = new Date();
    reviewBy.setDate(reviewBy.getDate() + 30);
    return reviewBy;
  };
  const logContinuityDecision = (
    subject: string,
    note: string,
    knowledgeId: string,
    step: ContinuityStep,
    reviewBy: Date | string,
    personId?: string,
    absenceId?: string,
  ) =>
    addDecision({
      subject,
      kind: "remediate",
      note,
      reviewBy: typeof reviewBy === "string" ? reviewBy : localDateKey(reviewBy),
      linkedTab: "knowledge",
      linkedId: knowledgeId,
      linkedStep: step,
      linkedPersonId: personId,
      linkedAbsenceId: absenceId,
    });
  const confirmLogged = (reviewBy: Date, count = 1) =>
    toast.success(
      `${count === 1 ? "Logged" : `${count} steps logged`} in the Journal — the register is re-checked at the review on ${reviewBy.toLocaleDateString()}.`,
    );
  const logMove = (m: CrossTrainingMove) => {
    const reviewBy = reviewDateIn30Days();
    logContinuityDecision(m.item.name, m.action, m.item.id, "cover", reviewBy, m.trainee?.id);
    confirmLogged(reviewBy);
  };
  const logGap = (g: DocumentationGap) => {
    const reviewBy = reviewDateIn30Days();
    logContinuityDecision(g.item.name, g.action, g.item.id, g.step, reviewBy);
    confirmLogged(reviewBy);
  };
  /**
   * One entry per item, so each item's snapshot, review and slip check stand on
   * their own. Hand-offs logged from a leave window remember that absence, so
   * they never pass for the hand-off of a later one.
   */
  const logAbsenceAction = (a: AbsenceAction, reviewByKey?: string, absenceId?: string) => {
    const reviewBy = reviewByKey ? new Date(`${reviewByKey}T12:00:00`) : reviewDateIn30Days();
    const pending = a.knowledgeIds
      .map((id) => tpl.knowledge.find((k) => k.id === id))
      .filter((k): k is KnowledgeItem => Boolean(k))
      .filter((k) => !trackedBy(k.id, a.step, absenceId));
    for (const k of pending)
      logContinuityDecision(
        k.name,
        a.text,
        k.id,
        a.step,
        reviewByKey ?? reviewBy,
        undefined,
        a.step === "handoff" ? absenceId : undefined,
      );
    confirmLogged(reviewBy, pending.length);
  };
  /** An absence step is "in the Journal" once every item it names has an open entry for that step. */
  const absenceStepTracked = (a: AbsenceAction, absenceId?: string) =>
    a.knowledgeIds.length > 0 && a.knowledgeIds.every((id) => trackedBy(id, a.step, absenceId))
      ? trackedBy(a.knowledgeIds[0], a.step, absenceId)
      : undefined;
  const people = useMemo(() => tpl.people.filter((p) => p.active), [tpl.people]);
  const [itemPage, setItemPage] = useState(0);
  const [peoplePage, setPeoplePage] = useState(0);
  const safeItemPage = clampPage(itemPage, report.items.length, REGISTER_ITEM_PAGE);
  const safePeoplePage = clampPage(peoplePage, people.length, REGISTER_PEOPLE_PAGE);
  const visibleItems = pageSlice(report.items, safeItemPage, REGISTER_ITEM_PAGE);
  const visiblePeople = pageSlice(people, safePeoplePage, REGISTER_PEOPLE_PAGE);
  const itemPages = pageCount(report.items.length, REGISTER_ITEM_PAGE);
  const peoplePages = pageCount(people.length, REGISTER_PEOPLE_PAGE);
  const registerFrom = registerSource(profile);
  const registerReady = registerAssessed(tpl);
  const trackFreshness = registerFrom !== "sample" && registerReady;
  const freshness = useMemo(() => staleItems(tpl, today), [tpl, today]);
  const staleIds = useMemo(() => new Set(freshness.stale.map((s) => s.item.id)), [freshness.stale]);
  const checkIns = useMemo(() => checkInPlan(tpl, today), [tpl, today]);
  const [checkInChoice, setCheckInChoice] = useState<string | null>(null);
  /**
   * Coverage as it stood when this check-in started, so drops caused by it can be
   * shown. Keyed to the business and industry it was taken from: template item ids
   * repeat across industries, so a baseline from another register must not be compared.
   */
  const registerKey = `${profile.businessId ?? "biz_default"}:${profile.industry}`;
  const [checkInBaseline, setCheckInBaseline] = useState<{
    key: string;
    report: CoverageReport;
  } | null>(null);
  const checkInDrops = useMemo(
    () =>
      checkInBaseline && checkInBaseline.key === registerKey
        ? coverageDrops(checkInBaseline.report, report)
        : [],
    [checkInBaseline, registerKey, report],
  );
  const checkInView =
    checkInChoice === UNHELD_VIEW && checkIns.unheld.length > 0
      ? UNHELD_VIEW
      : (checkIns.checkIns.find((c) => c.person.id === checkInChoice)?.person.id ??
        checkIns.checkIns[0]?.person.id ??
        UNHELD_VIEW);
  const activeCheckIn = checkIns.checkIns.find((c) => c.person.id === checkInView);

  const [selectedId, setSelectedId] = useState<string | null>(initialKnowledgeId ?? null);
  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState<KnowledgeKind>("duty");
  const [draftCriticality, setDraftCriticality] = useState<Criticality>("important");
  const [absentIds, setAbsentIds] = useState<string[]>([]);
  const [leavePersonId, setLeavePersonId] = useState("");
  const [leaveFrom, setLeaveFrom] = useState("");
  const [leaveTo, setLeaveTo] = useState("");
  const [showPastLeave, setShowPastLeave] = useState(false);
  const leave = useMemo(
    () => plannedAbsenceReport(tpl, profile.plannedAbsences ?? [], profile.industry, today),
    [tpl, profile.plannedAbsences, profile.industry, today],
  );
  const leaveFormValid =
    Boolean(leavePersonId) &&
    isCalendarDate(leaveFrom) &&
    isCalendarDate(leaveTo) &&
    leaveFrom <= leaveTo;
  const addLeave = () => {
    if (!leaveFormValid) return;
    const person = people.find((p) => p.id === leavePersonId);
    if (!person) return;
    setPlannedAbsences((current) => [
      ...current,
      {
        id: makePlannedAbsenceId(),
        personId: person.id,
        industry: profile.industry,
        from: leaveFrom,
        to: leaveTo,
      },
    ]);
    setLeaveFrom("");
    setLeaveTo("");
    toast.success(`${firstName(person.name)} out ${formatDateRange(leaveFrom, leaveTo)} added.`);
  };
  const removeLeave = (id: string) =>
    setPlannedAbsences((current) => current.filter((a) => a.id !== id));
  /** People already recorded out today, so "Out today" never doubles up an absence. */
  const outTodayIds = useMemo(
    () => new Set(leave.windows.filter((w) => w.status === "current").map((w) => w.person.id)),
    [leave.windows],
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
    toast.success(
      `${firstName(w.person.name)} out through ${formatDateRange(next.from, next.to)}.`,
    );
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
  const leaveHistory = [...leave.past, ...leave.unmatched];
  const debriefs = useMemo(
    () =>
      leaveDebriefs(tpl, profile.plannedAbsences ?? [], profile.decisions, profile.industry, today),
    [tpl, profile.plannedAbsences, profile.decisions, profile.industry, today],
  );
  /** Debrief entries answered this session, so the card only asks about what is left. */
  const [debriefed, setDebriefed] = useState<Set<string>>(() => new Set());
  const debriefKey = (absenceId: string, knowledgeId: string) => `${absenceId}:${knowledgeId}`;
  const markDebriefed = (absenceId: string) =>
    setPlannedAbsences((current) =>
      current.map((a) => (a.id === absenceId ? { ...a, debriefedAt: today } : a)),
    );
  /** Record one answer; once every entry of that leave has one, the leave stops asking. */
  const settleDebriefItem = (debrief: LeaveDebrief, entry: DebriefItem) => {
    const key = debriefKey(debrief.absence.id, entry.item.id);
    const rest = debrief.items.filter(
      (e) =>
        e.item.id !== entry.item.id && !debriefed.has(debriefKey(debrief.absence.id, e.item.id)),
    );
    if (rest.length === 0) markDebriefed(debrief.absence.id);
    else setDebriefed((current) => new Set(current).add(key));
  };
  const closeHandoff = (entry: DebriefItem, note: string) => {
    if (entry.handoff) reviewDecision(entry.handoff.id, "done", note);
  };
  /** Stand-in ran it for real: register says "can do", confirmed today, hand-off (and training aimed at them) closed. */
  const promoteStandIn = (debrief: LeaveDebrief, entry: DebriefItem, standIn: Person) => {
    const first = firstName(standIn.name);
    const note = `${first} covered ${entry.item.name} while ${firstName(debrief.person.name)} was out (${formatDateRange(debrief.absence.from, debrief.absence.to)}) and can now run it alone.`;
    setLevel(standIn.id, entry.item.id, "proficient");
    closeHandoff(entry, note);
    if (
      entry.training &&
      (!entry.training.linkedPersonId || entry.training.linkedPersonId === standIn.id)
    )
      reviewDecision(entry.training.id, "done", note);
    settleDebriefItem(debrief, entry);
    toast.success(`${first} → Can do ${entry.item.name}, confirmed today.`);
  };
  /** Stand-in got through it but not alone yet: keep them as a learner and make the training a tracked step. */
  const keepTraining = (debrief: LeaveDebrief, entry: DebriefItem, standIn: Person) => {
    const first = firstName(standIn.name);
    const during = `while ${firstName(debrief.person.name)} was out (${formatDateRange(debrief.absence.from, debrief.absence.to)})`;
    if (!entry.standInLevel || entry.standInLevel === "aware")
      setLevel(standIn.id, entry.item.id, "basic");
    closeHandoff(
      entry,
      `${first} covered ${entry.item.name} ${during}; not yet able to run it alone.`,
    );
    if (entry.training) {
      toast.success(`Cross-training ${first} on ${entry.item.name} is already in the Journal.`);
    } else {
      const reviewBy = reviewDateIn30Days();
      logContinuityDecision(
        entry.item.name,
        `Cross-train ${first} on ${entry.item.name}: covered it ${during} but cannot yet run it alone.`,
        entry.item.id,
        "cover",
        reviewBy,
        standIn.id,
      );
      confirmLogged(reviewBy);
    }
    settleDebriefItem(debrief, entry);
  };
  /** Nothing to change on the register: just close the leave's hand-off. */
  const closeDebriefItem = (debrief: LeaveDebrief, entry: DebriefItem) => {
    closeHandoff(
      entry,
      `Leave over (${formatDateRange(debrief.absence.from, debrief.absence.to)}); ${entry.item.name} back with ${firstName(debrief.person.name)}.`,
    );
    settleDebriefItem(debrief, entry);
  };
  const leaving = useMemo(
    () => leavers(tpl, profile.decisions, today),
    [tpl, profile.decisions, today],
  );
  const [leaverPersonId, setLeaverPersonId] = useState("");
  const [leaverLastDay, setLeaverLastDay] = useState("");
  /** People still on the team with no last day recorded yet. */
  const staying = useMemo(() => people.filter((p) => !p.lastDay), [people]);
  const leaverFormValid = Boolean(leaverPersonId) && isCalendarDate(leaverLastDay);
  const recordLastDay = () => {
    if (!leaverFormValid) return;
    const person = staying.find((p) => p.id === leaverPersonId);
    if (!person) return;
    setCustomPeople((current) => setLastDay(current, person.id, leaverLastDay));
    setLeaverPersonId("");
    setLeaverLastDay("");
    toast.success(
      `${firstName(person.name)}'s last day recorded — the hand-over checklist is below.`,
    );
  };
  const changeLastDay = (l: Leaver, lastDay: string) => {
    if (!isCalendarDate(lastDay)) return;
    setCustomPeople((current) => setLastDay(current, l.person.id, lastDay));
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
        `${first}'s last day is ${l.lastDay} — mark ${first} as left once it has passed.`,
      );
      return;
    }
    if (
      !window.confirm(
        `Mark ${l.person.name} as left? ${first} stays in the history but no longer counts as cover for anything on the register${
          l.handover.length > 0
            ? ` — ${l.handover.length} ${l.handover.length === 1 ? "entry" : "entries"} will have nobody who can run ${l.handover.length === 1 ? "it" : "them"} alone`
            : ""
        }.`,
      )
    )
      return;
    setCustomPeople((current) => markLeft(current, l.person.id, today));
    toast.success(`${first} marked as left.`);
  };
  const [importIssues, setImportIssues] = useState<RegisterImportIssue[]>([]);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const selected: ItemCoverage | undefined =
    report.items.find((i) => i.item.id === selectedId) ?? report.singlePoints[0] ?? report.items[0];

  const addItem = () => {
    const name = draftName.trim();
    if (!name) return;
    const item: KnowledgeItem = {
      id: makeKnowledgeId(),
      name,
      kind: draftKind,
      criticality: draftCriticality,
      category: draftKind === "knowledge" ? "tribal" : "process",
      description: "",
      linkedProcessIds: [],
      documented: false,
      confirmedAt: today,
    };
    setCustomKnowledge((current) => [...current, item]);
    setSelectedId(item.id);
    setDraftName("");
  };

  const updateItem = (id: string, patch: Partial<KnowledgeItem>) =>
    setCustomKnowledge((current) =>
      current.map((k) => (k.id === id ? { ...k, ...patch, confirmedAt: today } : k)),
    );

  const confirmItems = (ids: string[]) => {
    const set = new Set(ids);
    setCustomKnowledge((current) =>
      current.map((k) => (set.has(k.id) ? { ...k, confirmedAt: today } : k)),
    );
    toast.success(
      ids.length === 1
        ? `Confirmed — re-check again in ${CONFIRMATION_MAX_AGE_DAYS} days.`
        : `${ids.length} items confirmed.`,
    );
  };

  const removeItem = (id: string) => {
    setCustomKnowledge((current) => current.filter((k) => k.id !== id));
    setCustomRelations((current) => current.filter((r) => r.knowledgeId !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const setLevel = (personId: string, knowledgeId: string, level: KnowledgeLevel | undefined) => {
    setCustomRelations((current) => setRelationLevel(current, personId, knowledgeId, level));
    setCustomKnowledge((current) =>
      current.map((k) => (k.id === knowledgeId ? { ...k, confirmedAt: today } : k)),
    );
  };

  const checkInSetLevel = (
    personId: string,
    knowledgeId: string,
    level: KnowledgeLevel | undefined,
  ) => {
    if (!checkInBaseline || checkInBaseline.key !== registerKey) {
      setCheckInBaseline({ key: registerKey, report });
    }
    setLevel(personId, knowledgeId, level);
  };

  const resetToTemplate = () => {
    setCustomKnowledge(null);
    setCustomRelations(null);
    setImportIssues([]);
    setCheckInBaseline(null);
  };

  const downloadCsv = (text: string, filename: string) =>
    downloadText(filename, text, "text/csv;charset=utf-8");

  const importCsv = async (file: File) => {
    setImportIssues([]);
    try {
      const result = parseRegisterCsv(await file.text(), tpl);
      setImportIssues(result.issues);
      if (!result.knowledge.length) {
        toast.error(result.issues[0]?.message ?? "No duties or tasks found in that file");
        return;
      }
      setCustomKnowledge(result.knowledge);
      setCustomRelations(result.relations);
      setSelectedId(null);
      setCheckInBaseline(null);
      toast.success(
        `Imported ${result.knowledge.length} items and ${result.relations.length} assignments${
          result.issues.length ? `; ${result.issues.length} thing(s) need attention` : ""
        }`,
      );
    } catch {
      toast.error("Import failed", { description: "Choose a readable CSV file and try again." });
    }
  };

  const mostDepended = report.people.find((l) => l.person.active);
  // The same count the Dashboard and the business profile's sole-owner figure use.
  const singlePoints = useMemo(() => criticalSinglePoints(tpl), [tpl]);
  const importantSinglePoints = report.items.filter(
    (i) => i.item.criticality === "important" && i.primaries.length <= 1,
  ).length;
  const effectiveAbsentIds = useMemo(() => {
    const valid = absentIds.filter((id) => people.some((p) => p.id === id));
    if (valid.length > 0) return valid;
    const fallback = report.people.find((l) => l.person.active)?.person.id;
    return fallback ? [fallback] : [];
  }, [absentIds, people, report.people]);
  const absence = useMemo(
    () => (effectiveAbsentIds.length > 0 ? absenceImpact(tpl, effectiveAbsentIds) : null),
    [tpl, effectiveAbsentIds],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Backed up"
          value={registerReady ? `${report.coverageIndex}%` : "—"}
          hint={
            registerReady
              ? "Share of work two or more people can run alone (weighted by criticality)."
              : NOT_ASSESSED_HINT
          }
          tone={
            !registerReady
              ? "default"
              : report.coverageIndex >= 70
                ? "ok"
                : report.coverageIndex >= 40
                  ? "warn"
                  : "danger"
          }
        />
        <Stat
          label="Single points"
          value={registerReady ? String(singlePoints.count) : "—"}
          hint={
            registerReady
              ? `Items the business stops without: ${singlePoints.nobody} with nobody and ${singlePoints.onePerson} with one person who can run them alone.${
                  importantSinglePoints > 0
                    ? ` ${importantSinglePoints} more ${importantSinglePoints === 1 ? "hurts" : "hurt"} within a week.`
                    : ""
                }`
              : NOT_ASSESSED_HINT
          }
          tone={!registerReady ? "default" : singlePoints.count === 0 ? "ok" : "danger"}
        />
        <Stat
          label="Learners in place"
          value={registerReady ? String(report.counts.thin) : "—"}
          hint={
            registerReady
              ? "One person can run it and someone else has started learning."
              : NOT_ASSESSED_HINT
          }
          tone={registerReady ? "warn" : "default"}
        />
        <Stat
          label="Written down"
          value={registerReady ? `${docs.documentedIndex}%` : "—"}
          hint={
            registerReady
              ? `${docs.counts.none} with nothing written, ${docs.counts.unlocated} written but location not recorded.`
              : NOT_ASSESSED_HINT
          }
          tone={
            !registerReady
              ? "default"
              : docs.documentedIndex >= 70
                ? "ok"
                : docs.documentedIndex >= 40
                  ? "warn"
                  : "danger"
          }
        />
        <Stat
          label="Most depended on"
          value={registerReady && mostDepended ? mostDepended.person.name : "—"}
          hint={
            registerReady && mostDepended
              ? `${mostDepended.dependence}% of must-do work stops if they are out (app's own index).`
              : registerReady
                ? "Add people to see who the business leans on."
                : NOT_ASSESSED_HINT
          }
          tone={
            registerReady && mostDepended && mostDepended.dependence >= 50 ? "danger" : "default"
          }
        />
      </div>

      {registerFrom === "starter" && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium">
            Starter list from the {industryMeta(profile.industry).label.toLowerCase()} example
          </p>
          <p className="mt-1 leading-relaxed text-muted">
            These {tpl.knowledge.length} duties, tasks and pieces of know-how are what a business
            like yours usually runs on. Mark who can do each, edit or delete what does not apply, or
            start from a blank list. The figures above stay blank until someone is marked.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={() => setCustomKnowledge([])}
          >
            Start from a blank list
          </Button>
        </div>
      )}
      {registerFrom === "own" && tpl.knowledge.length === 0 && (
        <div className="rounded-lg border border-border bg-panel/60 p-4 text-sm text-muted">
          Your register is empty. Add the duties, tasks and know-how the business runs on below, or
          import a spreadsheet, then mark who can do each.
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Who can do what</CardTitle>
            <CardDescription>
              Every duty, task and piece of know-how the business runs on, and who can do it. Anyone
              can hold as many as they like; each item should have at least two people who can run
              it alone.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => csvInputRef.current?.click()}
              title="Replace the register with a spreadsheet: one row per item, one column per person"
            >
              <Upload className="size-3.5" /> Import CSV
            </Button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="Import register CSV"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importCsv(file);
                event.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadCsv(registerToCsv(tpl), "precog-who-can-do-what.csv")}
              title="Download the current register to edit in a spreadsheet"
            >
              <Download className="size-3.5" /> Export CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => downloadCsv(registerTemplateCsv(tpl), "precog-register-template.csv")}
              title="Blank grid with your team as columns"
            >
              Blank template
            </Button>
            {registerFrom === "own" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToTemplate}
                title="Back to the starter list"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <RegisterGrid
            importIssues={importIssues}
            setImportIssues={setImportIssues}
            addItem={addItem}
            draftName={draftName}
            setDraftName={setDraftName}
            draftKind={draftKind}
            setDraftKind={setDraftKind}
            draftCriticality={draftCriticality}
            setDraftCriticality={setDraftCriticality}
            people={people}
            report={report}
            safeItemPage={safeItemPage}
            setItemPage={setItemPage}
            itemPages={itemPages}
            safePeoplePage={safePeoplePage}
            setPeoplePage={setPeoplePage}
            peoplePages={peoplePages}
            visiblePeople={visiblePeople}
            visibleItems={visibleItems}
            selected={selected}
            setSelectedId={setSelectedId}
            trackFreshness={trackFreshness}
            staleIds={staleIds}
            tpl={tpl}
            setLevel={setLevel}
            removeItem={removeItem}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cross-training plan</CardTitle>
              <CardDescription>
                What to do next, most urgent first. Each step names who should learn and who should
                teach.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!registerReady ? (
                <p className="text-sm text-muted">{NOT_ASSESSED_PLAN}</p>
              ) : report.plan.length === 0 ? (
                <p className="text-sm text-ok">
                  Every item has at least two people who can run it alone. Revisit this after anyone
                  joins, leaves, or changes role.
                </p>
              ) : (
                <ol className="space-y-2">
                  {report.plan.slice(0, 8).map((m, i) => (
                    <li
                      key={m.item.id}
                      className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm hover:bg-elevated/60"
                      onClick={() => setSelectedId(m.item.id)}
                    >
                      <span className="font-mono text-xs text-muted">{i + 1}.</span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{m.item.name}</span>
                          <Badge variant={STATUS_VARIANT[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                        </div>
                        <p className="text-muted">{m.action}</p>
                        {trackedBy(m.item.id, "cover") ? (
                          <p className="text-xs text-subtle">
                            In the Journal · review by {trackedBy(m.item.id, "cover")}
                          </p>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              logMove(m);
                            }}
                          >
                            <BookOpen className="size-3.5" /> Log as decision
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                  {report.plan.length > 8 && (
                    <li className="text-xs text-muted">
                      {report.plan.length - 8} more below the fold — fix these first.
                    </li>
                  )}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Write it down</CardTitle>
              <CardDescription>
                A backup is only as good as the procedure they can follow. Items with nothing
                written down, or a procedure nobody has said where to find, ranked by how much stops
                if the one person who knows is out.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {docs.gaps.length === 0 ? (
                <p className="text-sm text-ok">
                  Every item has a written procedure and a recorded place to find it. Re-check
                  whenever a duty changes hands.
                </p>
              ) : (
                <ol className="space-y-2">
                  {docs.gaps.slice(0, 8).map((g, i) => (
                    <li
                      key={g.item.id}
                      className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm hover:bg-elevated/60"
                      onClick={() => setSelectedId(g.item.id)}
                    >
                      <span className="font-mono text-xs text-muted">{i + 1}.</span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{g.item.name}</span>
                          <Badge variant={g.state === "none" ? "danger" : "warn"}>
                            {DOCUMENTATION_LABEL[g.state]}
                          </Badge>
                          <Badge variant={STATUS_VARIANT[g.coverage]}>
                            {STATUS_LABEL[g.coverage]}
                          </Badge>
                        </div>
                        <p className="text-muted">{g.action}</p>
                        {trackedBy(g.item.id, g.step) ? (
                          <p className="text-xs text-subtle">
                            In the Journal · review by {trackedBy(g.item.id, g.step)}
                          </p>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              logGap(g);
                            }}
                          >
                            <BookOpen className="size-3.5" /> Log as decision
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                  {docs.gaps.length > 8 && (
                    <li className="text-xs text-muted">
                      {docs.gaps.length - 8} more — tick “A written procedure exists” and record
                      where it lives on each item as you go.
                    </li>
                  )}
                </ol>
              )}
            </CardContent>
          </Card>

          {trackFreshness && freshness.stale.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Confirm it&apos;s still true</CardTitle>
                <CardDescription>
                  {freshness.stale.length} item(s) not confirmed in the last{" "}
                  {CONFIRMATION_MAX_AGE_DAYS} days. People leave, learn and forget; a register
                  nobody re-checks is a false comfort. Sit down with each person and go through what
                  the register says they can do.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {checkIns.checkIns.map((c) => (
                    <Button
                      key={c.person.id}
                      size="sm"
                      variant={checkInView === c.person.id ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setCheckInChoice(c.person.id)}
                      aria-pressed={checkInView === c.person.id}
                    >
                      <UserCheck className="size-3.5" /> {c.person.name} ({c.items.length})
                    </Button>
                  ))}
                  {checkIns.unheld.length > 0 && (
                    <Button
                      size="sm"
                      variant={checkInView === UNHELD_VIEW ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setCheckInChoice(UNHELD_VIEW)}
                      aria-pressed={checkInView === UNHELD_VIEW}
                    >
                      Nobody holds ({checkIns.unheld.length})
                    </Button>
                  )}
                </div>

                {activeCheckIn ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted">
                      Ask {activeCheckIn.person.name}: can you still do each of these, and at this
                      level?
                      {activeCheckIn.soleCount > 0 &&
                        ` ${activeCheckIn.soleCount} of them nobody else can run alone.`}
                    </p>
                    <ol className="space-y-2">
                      {activeCheckIn.items.map((entry, i) => (
                        <li
                          key={entry.item.id}
                          className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"
                        >
                          <span className="font-mono text-xs text-muted">{i + 1}.</span>
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{entry.item.name}</span>
                              <Badge variant={STATUS_VARIANT[entry.coverage]}>
                                {STATUS_LABEL[entry.coverage]}
                              </Badge>
                              <span className="text-xs text-muted">
                                {entry.confirmedAt
                                  ? `last confirmed ${entry.confirmedAt}`
                                  : "never confirmed"}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                className={cn(inputClass, "text-xs")}
                                value={entry.level}
                                onChange={(e) =>
                                  checkInSetLevel(
                                    activeCheckIn.person.id,
                                    entry.item.id,
                                    e.target.value as KnowledgeLevel,
                                  )
                                }
                                aria-label={`${activeCheckIn.person.name} on ${entry.item.name}`}
                              >
                                {[...LEVEL_ORDER].reverse().map((l) => (
                                  <option key={l} value={l}>
                                    {LEVEL_LABEL[l]}
                                  </option>
                                ))}
                              </select>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => confirmItems([entry.item.id])}
                              >
                                Still does it
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-danger"
                                onClick={() =>
                                  checkInSetLevel(activeCheckIn.person.id, entry.item.id, undefined)
                                }
                              >
                                No longer
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() =>
                        confirmItems(activeCheckIn.items.map((entry) => entry.item.id))
                      }
                    >
                      <UserCheck className="size-3.5" /> Everything here is still true for{" "}
                      {activeCheckIn.person.name}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted">
                      Nobody on the active team holds these, so there is no one to ask — confirm
                      they still matter, or assign someone in the grid.
                    </p>
                    <ol className="space-y-2">
                      {checkIns.unheld.map((entry, i) => (
                        <li
                          key={entry.item.id}
                          className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"
                        >
                          <span className="font-mono text-xs text-muted">{i + 1}.</span>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="font-medium">{entry.item.name}</div>
                            <p className="text-muted">{entry.action}</p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => confirmItems([entry.item.id])}
                            >
                              Still accurate
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ol>
                    {checkIns.unheld.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => confirmItems(checkIns.unheld.map((entry) => entry.item.id))}
                      >
                        All {checkIns.unheld.length} still accurate
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {trackFreshness && checkInDrops.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>What this check-in changed</CardTitle>
                <CardDescription>
                  {checkInDrops.length} item(s) lost coverage since you started re-confirming. The
                  register is more honest now — these are the gaps it uncovered.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ol className="space-y-2">
                  {checkInDrops.map((d, i) => {
                    const move = d.move;
                    return (
                      <li
                        key={d.item.id}
                        className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"
                      >
                        <span className="font-mono text-xs text-muted">{i + 1}.</span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{d.item.name}</span>
                            <Badge variant={STATUS_VARIANT[d.to]}>{STATUS_LABEL[d.to]}</Badge>
                            <span className="text-xs text-muted">was: {STATUS_LABEL[d.from]}</span>
                          </div>
                          <p className="text-muted">
                            {d.remaining.length === 0
                              ? "Nobody left on the active team can run this alone."
                              : `${d.remaining.map((p) => p.name).join(" and ")} ${
                                  d.remaining.length === 1 ? "is" : "are"
                                } left to run it alone.`}
                            {move && ` ${move.action}`}
                          </p>
                          {move &&
                            (trackedBy(d.item.id, "cover") ? (
                              <span className="text-xs text-muted">
                                In the Journal · review by {trackedBy(d.item.id, "cover")}
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => logMove(move)}
                              >
                                <BookOpen className="size-3.5" /> Log as decision
                              </Button>
                            ))}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setCheckInBaseline(null)}
                >
                  Done reviewing these
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {selected && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{selected.item.name}</CardTitle>
                  <Badge variant={STATUS_VARIANT[selected.status]}>
                    {STATUS_LABEL[selected.status]}
                  </Badge>
                </div>
                <CardDescription>
                  {selected.item.description || CRITICALITY_LABEL[selected.item.criticality]}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    If nobody can do it
                    <select
                      className={inputClass}
                      value={selected.item.criticality}
                      onChange={(e) =>
                        updateItem(selected.item.id, { criticality: e.target.value as Criticality })
                      }
                    >
                      {(Object.keys(CRITICALITY_LABEL) as Criticality[]).map((c) => (
                        <option key={c} value={c}>
                          {CRITICALITY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 self-end text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={Boolean(selected.item.documented)}
                      onChange={(e) =>
                        updateItem(selected.item.id, { documented: e.target.checked })
                      }
                    />
                    A written procedure exists that a backup could follow
                  </label>
                </div>
                {selected.item.documented && (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Where the procedure lives (drive path, binder, link)
                    <input
                      className={inputClass}
                      value={selected.item.procedureLocation ?? ""}
                      maxLength={200}
                      placeholder="e.g. Shared drive › Office › Payroll checklist.pdf"
                      onChange={(e) =>
                        updateItem(selected.item.id, { procedureLocation: e.target.value })
                      }
                    />
                  </label>
                )}
                {trackFreshness && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>Last confirmed {selected.item.confirmedAt ?? "never"}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => updateItem(selected.item.id, { confirmedAt: today })}
                    >
                      Still accurate
                    </Button>
                  </div>
                )}
                <PeopleLine
                  label="Can run it alone"
                  people={selected.primaries.map((p) => p.name)}
                />
                <PeopleLine label="Learning" people={selected.learners.map((p) => p.name)} />
                <PeopleLine label="Aware only" people={selected.aware.map((p) => p.name)} />
                {selected.suggestedBackups.length > 0 &&
                  (isMarked(selected) ? (
                    <div>
                      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                        Best people to train next
                      </div>
                      <ul className="space-y-1">
                        {selected.suggestedBackups.slice(0, 3).map((s) => (
                          <li key={s.person.id} className="flex flex-wrap items-baseline gap-2">
                            <span className="font-medium">{s.person.name}</span>
                            <span className="text-xs text-muted">{s.reasons.join("; ")}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs text-muted">
                      Nobody is marked on this item yet. Mark who can do it; the app suggests who to
                      train once someone is marked.
                    </p>
                  ))}
              </CardContent>
            </Card>
          )}

          <OutTomorrowCard
            people={people}
            effectiveAbsentIds={effectiveAbsentIds}
            setAbsentIds={setAbsentIds}
            registerReady={registerReady}
            absence={absence}
            setSelectedId={setSelectedId}
            absenceStepTracked={absenceStepTracked}
            logAbsenceAction={logAbsenceAction}
          />

          <PlannedLeaveCard
            people={people}
            outTodayIds={outTodayIds}
            markOutToday={markOutToday}
            leavePersonId={leavePersonId}
            setLeavePersonId={setLeavePersonId}
            leaveFrom={leaveFrom}
            setLeaveFrom={setLeaveFrom}
            leaveTo={leaveTo}
            setLeaveTo={setLeaveTo}
            leaveFormValid={leaveFormValid}
            addLeave={addLeave}
            leave={leave}
            leaveHistory={leaveHistory}
            debriefs={debriefs}
            debriefed={debriefed}
            debriefKey={debriefKey}
            promoteStandIn={promoteStandIn}
            keepTraining={keepTraining}
            closeDebriefItem={closeDebriefItem}
            markDebriefed={markDebriefed}
            today={today}
            registerReady={registerReady}
            removeLeave={removeLeave}
            stillOutTomorrow={stillOutTomorrow}
            backAtWork={backAtWork}
            setSelectedId={setSelectedId}
            absenceStepTracked={absenceStepTracked}
            logAbsenceAction={logAbsenceAction}
            showPastLeave={showPastLeave}
            setShowPastLeave={setShowPastLeave}
            tpl={tpl}
          />

          <LeavingTeamCard
            staying={staying}
            leaverPersonId={leaverPersonId}
            setLeaverPersonId={setLeaverPersonId}
            leaverLastDay={leaverLastDay}
            setLeaverLastDay={setLeaverLastDay}
            leaverFormValid={leaverFormValid}
            recordLastDay={recordLastDay}
            leaving={leaving}
            today={today}
            registerReady={registerReady}
            setSelectedId={setSelectedId}
            changeLastDay={changeLastDay}
            cancelLeaving={cancelLeaving}
            markAsLeft={markAsLeft}
            absenceStepTracked={absenceStepTracked}
            logAbsenceAction={logAbsenceAction}
          />

          <DependenceCard registerReady={registerReady} report={report} />
        </div>
      </div>
    </div>
  );
}
