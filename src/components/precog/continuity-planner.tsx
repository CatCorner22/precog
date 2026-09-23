import { useMemo, useRef, useState } from "react";
import { useToday } from "@/lib/precog/decisions/use-today";
import {
  BookOpen,
  CalendarDays,
  Download,
  LogOut,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  UserCheck,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
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
  checkInPlan,
  coverageDrops,
  coverageReport,
  DOCUMENTATION_LABEL,
  documentationDebt,
  isCalendarDate,
  LEVEL_LABEL,
  LEVEL_ORDER,
  firstName,
  makeKnowledgeId,
  relationLevel,
  setRelationLevel,
  staleItems,
  STATUS_LABEL,
  type AbsenceAction,
  type ContinuityStep,
  type CoverageReport,
  type CoverageStatus,
  type CrossTrainingMove,
  type DocumentationGap,
  type ItemCoverage,
  CONFIRMATION_MAX_AGE_DAYS,
} from "@/lib/precog/continuity/coverage";
import { registerAssessed, registerSource } from "@/lib/precog/continuity/register-state";
import { industryMeta } from "@/lib/precog/industry";
import {
  endAbsence,
  extendAbsence,
  formatDateRange,
  handoffDeadline,
  leadLabel,
  plannedAbsenceReport,
  procedurePointer,
  unplannedAbsenceToday,
  type AbsenceWindow,
} from "@/lib/precog/continuity/planned-absence";
import {
  describeDebriefItem,
  leaveDebriefs,
  standInAlreadyStrong,
  type DebriefItem,
  type LeaveDebrief,
} from "@/lib/precog/continuity/leave-debrief";
import {
  describeLeaver,
  HANDOVER_URGENT_DAYS,
  handoverDeadline,
  leaverLead,
  leavers,
  canMarkLeft,
  markLeft,
  setLastDay,
  type HandoverItem,
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

const KIND_LABEL: Record<KnowledgeKind, string> = {
  duty: "Duty",
  task: "Task",
  knowledge: "Know-how",
};

const CRITICALITY_LABEL: Record<Criticality, string> = {
  critical: "Business stops without it",
  important: "Hurts within a week",
  "nice-to-have": "Can wait",
};

const STATUS_VARIANT: Record<CoverageStatus, "danger" | "warn" | "accent" | "ok"> = {
  uncovered: "danger",
  single: "danger",
  thin: "warn",
  covered: "ok",
};

const LEVEL_SHORT: Record<KnowledgeLevel, string> = {
  expert: "Expert",
  proficient: "Can do",
  basic: "Learning",
  aware: "Aware",
};

/** Check-in tab for stale items nobody on the active team holds. */
const UNHELD_VIEW = "__unheld__";

const inputClass = "rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg";

function naturalNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

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

  const downloadCsv = (text: string, filename: string) => {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

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
          value={registerReady ? String(report.counts.single + report.counts.uncovered) : "—"}
          hint={
            registerReady
              ? `${report.counts.uncovered} with nobody, ${report.counts.single} with one person.`
              : NOT_ASSESSED_HINT
          }
          tone={
            !registerReady
              ? "default"
              : report.counts.single + report.counts.uncovered === 0
                ? "ok"
                : "danger"
          }
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
          {importIssues.length > 0 && (
            <div className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-warn">Import notes</p>
                <button
                  type="button"
                  onClick={() => setImportIssues([])}
                  className="text-[11px] text-subtle underline hover:text-fg"
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
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-elevated text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-left font-medium">Coverage</th>
                    {people.map((p) => (
                      <th key={p.id} className="px-2 py-2 text-left font-medium">
                        <div className="truncate" title={p.role}>
                          {p.name}
                        </div>
                        <div className="truncate text-[10px] font-normal opacity-70">{p.role}</div>
                      </th>
                    ))}
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((row) => {
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
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{row.item.name}</span>
                            {trackFreshness && staleIds.has(row.item.id) && (
                              <Badge variant="warn">Re-confirm</Badge>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted">
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
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={STATUS_VARIANT[row.status]}>
                            {STATUS_LABEL[row.status]}
                          </Badge>
                        </td>
                        {people.map((p) => {
                          const level = relationLevel(tpl.relations, p.id, row.item.id);
                          return (
                            <td
                              key={p.id}
                              className="px-2 py-2"
                              onClick={(e) => e.stopPropagation()}
                            >
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
                            className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger"
                            onClick={() => removeItem(row.item.id)}
                            aria-label={`Remove ${row.item.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
          )}
          <p className="text-xs text-muted">
            Levels:{" "}
            {LEVEL_ORDER.map((l) => `${LEVEL_SHORT[l]} = ${LEVEL_LABEL[l].toLowerCase()}`).join(
              " · ",
            )}
            . Only "Expert" and "Can do" count as a real backup.
          </p>
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserMinus className="size-4 text-muted" />
                If someone is out tomorrow
              </CardTitle>
              <CardDescription>
                Sick, on leave, or gone. What stops, who picks it up, and what to do first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <fieldset className="flex flex-col gap-1 text-xs text-muted">
                <legend>Who is out (tick everyone)</legend>
                <div className="flex flex-wrap gap-2">
                  {people.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5"
                    >
                      <input
                        type="checkbox"
                        checked={effectiveAbsentIds.includes(p.id)}
                        aria-label={p.name}
                        onChange={() => {
                          if (effectiveAbsentIds.includes(p.id)) {
                            if (effectiveAbsentIds.length === 1) return;
                            setAbsentIds(effectiveAbsentIds.filter((id) => id !== p.id));
                          } else {
                            setAbsentIds([...effectiveAbsentIds, p.id]);
                          }
                        }}
                      />
                      {p.name} · {p.role}
                    </label>
                  ))}
                </div>
              </fieldset>
              {!registerReady ? (
                <p className="text-muted">{NOT_ASSESSED_ABSENCE}</p>
              ) : absence ? (
                <>
                  {absence.people.length > 1 && (
                    <p className="text-xs font-medium text-muted">
                      If {naturalNames(absence.people.map((p) => firstName(p.name)))} are all out:
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        absence.dependence >= 50
                          ? "danger"
                          : absence.dependence >= 25
                            ? "warn"
                            : "ok"
                      }
                    >
                      {absence.dependence}% of must-do work stops
                    </Badge>
                    <span className="text-xs text-muted">
                      {absence.stops.length} stop · {absence.continues.length} continue
                      {absence.orphanedProcesses.length > 0 &&
                        ` · ${absence.orphanedProcesses.length} process${absence.orphanedProcesses.length === 1 ? "" : "es"} without an owner`}
                    </span>
                  </div>
                  {absence.stops.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                        Stops on day one
                      </div>
                      <ul className="space-y-1.5">
                        {absence.stops.map((s) => (
                          <li
                            key={s.item.id}
                            className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 hover:bg-elevated/60"
                            onClick={() => setSelectedId(s.item.id)}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{s.item.name}</span>
                              <Badge
                                variant={s.item.criticality === "critical" ? "danger" : "default"}
                              >
                                {CRITICALITY_LABEL[s.item.criticality]}
                              </Badge>
                              <span className="text-xs text-muted">
                                → {s.standIn ? s.standIn.name : "nobody"}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted">{s.note}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <AlreadyStopped items={absence.alreadyStopped} onSelect={setSelectedId} />
                  {absence.continues.length > 0 && (
                    <PeopleLine
                      label="Keeps running"
                      people={absence.continues.map((k) => k.name)}
                    />
                  )}
                  <div>
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                      Contingency steps
                    </div>
                    <ol className="list-decimal space-y-1 pl-5">
                      {absence.actions.map((a) => (
                        <li key={a.text}>
                          {a.text}
                          {a.knowledgeIds.length > 0 &&
                            (absenceStepTracked(a) ? (
                              <span className="ml-2 text-xs text-subtle">
                                In the Journal · review by {absenceStepTracked(a)}
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="ml-1 h-6 px-1.5 text-xs"
                                onClick={() => logAbsenceAction(a)}
                              >
                                <BookOpen className="size-3.5" /> Log as decision
                              </Button>
                            ))}
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              ) : (
                <p className="text-muted">Add people to the team to simulate an absence.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-4 text-muted" />
                Out today and planned leave
              </CardTitle>
              <CardDescription>
                Someone called in sick? Press their name and today&apos;s cover sheet appears: what
                stops, who steps in, where the procedure lives. Known absences — holidays, parental
                leave, surgery — go in the form. Overlapping absences are flagged, and once anyone
                is back a debrief asks whether the stand-in can now run it alone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {people.length === 0 ? (
                <p className="text-muted">Add people to the team to record leave.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted">Out today:</span>
                  {people.map((p) => {
                    const out = outTodayIds.has(p.id);
                    return (
                      <Button
                        key={p.id}
                        size="sm"
                        variant={out ? "secondary" : "outline"}
                        className="h-7 px-2 text-xs"
                        disabled={out}
                        aria-label={out ? `${p.name} is already out today` : `${p.name} out today`}
                        onClick={() => markOutToday(p)}
                      >
                        <UserMinus className="size-3.5" /> {firstName(p.name)}
                        {out ? " · out" : ""}
                      </Button>
                    );
                  })}
                </div>
              )}
              {people.length > 0 && (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addLeave();
                  }}
                >
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Who
                    <select
                      className={inputClass}
                      value={leavePersonId}
                      onChange={(e) => setLeavePersonId(e.target.value)}
                    >
                      <option value="">Choose…</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    First day out
                    <input
                      type="date"
                      className={inputClass}
                      value={leaveFrom}
                      onChange={(e) => setLeaveFrom(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Last day out
                    <input
                      type="date"
                      className={inputClass}
                      value={leaveTo}
                      min={leaveFrom || undefined}
                      onChange={(e) => setLeaveTo(e.target.value)}
                    />
                  </label>
                  <Button type="submit" size="sm" disabled={!leaveFormValid}>
                    <Plus className="size-4" /> Add leave
                  </Button>
                </form>
              )}
              {leave.windows.length === 0 && leaveHistory.length === 0 && people.length > 0 && (
                <p className="text-xs text-muted">
                  Nobody is out or has leave booked. Add known absences and the weekly plan, printed
                  report and Pioneer will warn ahead of each one; press a name above the day someone
                  calls in sick.
                </p>
              )}
              {debriefs.map((d) => (
                <LeaveDebriefCard
                  key={d.absence.id}
                  debrief={d}
                  people={people}
                  answered={(e) => debriefed.has(debriefKey(d.absence.id, e.item.id))}
                  onPromote={(e, s) => promoteStandIn(d, e, s)}
                  onKeepTraining={(e, s) => keepTraining(d, e, s)}
                  onClose={(e) => closeDebriefItem(d, e)}
                  onDismiss={() => {
                    markDebriefed(d.absence.id);
                    toast.success("Absence closed without register changes.");
                  }}
                />
              ))}
              {leave.windows.map((w) => (
                <LeaveWindow
                  key={w.absence.id}
                  window={w}
                  today={today}
                  assessed={registerReady}
                  onRemove={() => removeLeave(w.absence.id)}
                  onExtend={() => stillOutTomorrow(w)}
                  onBack={() => backAtWork(w)}
                  onSelect={setSelectedId}
                  tracked={(a) => absenceStepTracked(a, w.absence.id)}
                  onLog={(a) => logAbsenceAction(a, handoffDeadline(w, today), w.absence.id)}
                />
              ))}
              {leaveHistory.length > 0 && (
                <div className="text-xs text-muted">
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => setShowPastLeave((v) => !v)}
                  >
                    {showPastLeave ? "Hide" : "Show"} {leaveHistory.length} past or unmatched{" "}
                    {leaveHistory.length === 1 ? "entry" : "entries"}
                  </button>
                  {showPastLeave && (
                    <ul className="mt-1 space-y-1">
                      {leaveHistory.map((a) => {
                        const person = tpl.people.find((p) => p.id === a.personId);
                        return (
                          <li key={a.id} className="flex items-center justify-between gap-2">
                            <span>
                              {person?.name ?? "Someone no longer on the team"} ·{" "}
                              {formatDateRange(a.from, a.to)}
                              {!person || !person.active ? " · not on the active team" : ""}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5"
                              aria-label="Remove leave"
                              onClick={() => removeLeave(a.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogOut className="size-4 text-muted" />
                Leaving the team
              </CardTitle>
              <CardDescription>
                Someone has given notice? Record their last day. They keep counting as cover until
                then, and the hand-over below lists everything only they can run, who to train and
                what to write down &mdash; each step due before they go.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {staying.length > 0 && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Who
                    <select
                      className={inputClass}
                      value={leaverPersonId}
                      onChange={(e) => setLeaverPersonId(e.target.value)}
                      aria-label="Who is leaving"
                    >
                      <option value="">Choose…</option>
                      {staying.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Last working day
                    <input
                      type="date"
                      className={inputClass}
                      value={leaverLastDay}
                      onChange={(e) => setLeaverLastDay(e.target.value)}
                      aria-label="Last working day"
                    />
                  </label>
                  <Button size="sm" disabled={!leaverFormValid} onClick={recordLastDay}>
                    <Plus className="size-3.5" /> Record last day
                  </Button>
                </div>
              )}
              {leaving.length === 0 && (
                <p className="text-xs text-muted">
                  Nobody has given notice. When someone does, record the date here rather than
                  removing them &mdash; the weekly plan, printed report and Pioneer will count down
                  to it and chase the hand-over.
                </p>
              )}
              {leaving.map((l) => (
                <LeaverCard
                  key={l.person.id}
                  leaver={l}
                  today={today}
                  assessed={registerReady}
                  onSelect={setSelectedId}
                  onChangeDate={(d) => changeLastDay(l, d)}
                  onCancel={() => cancelLeaving(l)}
                  onMarkLeft={() => markAsLeft(l)}
                  tracked={(a) => absenceStepTracked(a)}
                  onLog={(a) => logAbsenceAction(a, handoverDeadline(l, today))}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Who the business leans on</CardTitle>
              <CardDescription>
                Share of must-do work that stops if each person is out — the app's own index, in
                which a critical item counts three, an important item two, and a can-wait item
                nothing. Spread the top names' sole items to bring these down.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!registerReady && <p className="text-sm text-muted">{NOT_ASSESSED_ABSENCE}</p>}
              {registerReady &&
                report.people
                  .filter((l) => l.person.active)
                  .map((l) => (
                    <div key={l.person.id} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{l.person.name}</span>
                        <span className="text-xs text-muted">
                          {l.soleItems.length} sole · {l.sharedItems.length} shared ·{" "}
                          {l.learningItems.length} learning
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-elevated">
                        <div
                          className={cn(
                            "h-full rounded",
                            l.dependence >= 50
                              ? "bg-danger"
                              : l.dependence >= 25
                                ? "bg-warn"
                                : "bg-ok",
                          )}
                          style={{ width: `${Math.max(2, l.dependence)}%` }}
                        />
                      </div>
                      {l.soleItems.length > 0 && (
                        <div className="mt-1 text-xs text-muted">
                          Only they can do: {l.soleItems.map((k) => k.name).join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const NOT_ASSESSED_HINT = "Fills in once someone is marked on an item.";

/**
 * Whether anyone is marked on the item at any level. Until then every
 * candidate ties on generic reasons, so the app names nobody to train.
 */
function isMarked(row: ItemCoverage): boolean {
  return row.primaries.length + row.learners.length + row.aware.length > 0;
}
const NOT_ASSESSED_PLAN =
  "Nobody is marked on the register yet, so there is nobody to name. Mark who can do each item above; the plan then names who to train and who should teach.";
const NOT_ASSESSED_ABSENCE =
  "Not assessed yet: nobody is marked on the register, so the app cannot tell what stops when someone is out. Mark who can do each item above and this fills in.";

/** Register items nobody can run alone: stopped whoever is in, listed apart from what the absence stops. */
function AlreadyStopped({
  items,
  onSelect,
}: {
  items: KnowledgeItem[];
  onSelect: (knowledgeId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
        Already stopped · nobody can run {items.length === 1 ? "it" : "these"} alone
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated/60"
              onClick={() => onSelect(item.id)}
            >
              {item.name} · {CRITICALITY_LABEL[item.criticality]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "ok" | "warn" | "danger" | "default";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-2xl font-semibold",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

function LeaveWindow({
  window: w,
  today,
  assessed,
  onRemove,
  onExtend,
  onBack,
  onSelect,
  tracked,
  onLog,
}: {
  window: AbsenceWindow;
  today: string;
  /** False while nobody is marked on the register: the window cannot say what stops. */
  assessed: boolean;
  onRemove: () => void;
  onExtend: () => void;
  onBack: () => void;
  onSelect: (knowledgeId: string) => void;
  tracked: (a: AbsenceAction) => string | undefined;
  onLog: (a: AbsenceAction) => void;
}) {
  const first = firstName(w.person.name);
  const current = w.status === "current";
  // A window that has started shows what stops today; the peak stays for planning.
  const impact = current && w.todayImpact ? w.todayImpact : w.impact;
  const deadline = handoffDeadline(w, today);
  const unplanned = Boolean(w.absence.unplanned);
  return (
    <div className={cn("rounded-md border p-3", current ? "border-danger/50" : "border-border")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {w.person.name} · {formatDateRange(w.absence.from, w.absence.to)}
          </span>
          <Badge variant={current ? "danger" : w.daysUntil <= 7 ? "warn" : "default"}>
            {current
              ? unplanned
                ? "Out unexpectedly"
                : "Out now"
              : `${unplanned ? "Unplanned · " : ""}${leadLabel(w.daysUntil)}`}
          </Badge>
          <span className="text-xs text-muted">
            {unplanned && w.absence.from === today && w.absence.to === today
              ? "today only so far"
              : `${w.lengthDays} day${w.lengthDays === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {current && (
            <>
              {w.absence.to <= today && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  aria-label={`${first} still out tomorrow`}
                  onClick={onExtend}
                >
                  Still out tomorrow
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                aria-label={`${first} is back`}
                onClick={onBack}
              >
                <UserCheck className="size-3.5" /> Back
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5"
            aria-label={`Remove ${first}'s ${unplanned ? "absence" : "leave"}`}
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      {!assessed ? (
        <p className="mt-2 text-xs text-muted">{NOT_ASSESSED_ABSENCE}</p>
      ) : (
        <>
          {w.overlaps.length > 0 && (
            <p className="mt-1 text-xs text-warn">
              Overlapping absence:{" "}
              {w.overlaps
                .map((o) => `${firstName(o.person.name)} also out ${formatDateRange(o.from, o.to)}`)
                .join("; ")}
              .{" "}
              {w.peak.extraStops.length > 0
                ? `Stops below are for ${formatDateRange(w.peak.from, w.peak.to)}, when ${w.peak.people
                    .filter((p) => p.id !== w.person.id)
                    .map((p) => firstName(p.name))
                    .join(" and ")} ${w.peak.people.length === 2 ? "is" : "are"} also away.`
                : "Nothing extra stops on the shared days."}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge
              variant={impact.dependence >= 50 ? "danger" : impact.dependence >= 25 ? "warn" : "ok"}
            >
              {impact.dependence}% of must-do work stops
            </Badge>
            <span className="text-xs text-muted">
              {impact.stops.length} stop · {impact.continues.length} continue
              {impact.orphanedProcesses.length > 0 &&
                ` · ${impact.orphanedProcesses.length} process${impact.orphanedProcesses.length === 1 ? "" : "es"} without an owner`}
            </span>
          </div>
          {impact.stops.length > 0 && (
            <ul className="mt-2 space-y-1">
              {impact.stops.map((s) => (
                <li
                  key={s.item.id}
                  className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 hover:bg-elevated/60"
                  onClick={() => onSelect(s.item.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.item.name}</span>
                    <Badge variant={s.item.criticality === "critical" ? "danger" : "default"}>
                      {CRITICALITY_LABEL[s.item.criticality]}
                    </Badge>
                    <span className="text-xs text-muted">
                      → {s.standIn ? s.standIn.name : "nobody"}
                    </span>
                    {current && (
                      <span
                        className={cn("text-xs", s.item.documented ? "text-muted" : "text-warn")}
                      >
                        · {procedurePointer(s)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{s.note}</p>
                </li>
              ))}
            </ul>
          )}
          {impact.alreadyStopped.length > 0 && (
            <div className="mt-2">
              <AlreadyStopped items={impact.alreadyStopped} onSelect={onSelect} />
            </div>
          )}
          <div className="mt-2">
            <PeopleLine label="Left in the business" people={impact.remaining.map((p) => p.name)} />
          </div>
          {impact.orphanedProcesses.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              No owner left for: {impact.orphanedProcesses.join(", ")}
            </p>
          )}
          {impact.actions.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                {current ? "Do today" : `Before ${deadline}`}
              </div>
              <ol className="list-decimal space-y-1 pl-5">
                {impact.actions.map((a) => (
                  <li key={a.text}>
                    {a.text}
                    {a.knowledgeIds.length > 0 &&
                      (tracked(a) ? (
                        <span className="ml-2 text-xs text-subtle">
                          In the Journal · review by {tracked(a)}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-1 h-6 px-1.5 text-xs"
                          onClick={() => onLog(a)}
                        >
                          <BookOpen className="size-3.5" /> Log as decision
                        </Button>
                      ))}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HandoverRow({ h, onSelect }: { h: HandoverItem; onSelect: (id: string) => void }) {
  const journal = h.training ?? h.documenting;
  return (
    <li
      className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 hover:bg-elevated/60"
      onClick={() => onSelect(h.item.id)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{h.item.name}</span>
        <Badge variant={h.item.criticality === "critical" ? "danger" : "default"}>
          {CRITICALITY_LABEL[h.item.criticality]}
        </Badge>
        <span className="text-xs text-muted">
          →{" "}
          {h.successor
            ? `${h.successor.name}${h.successorLevel ? ` (${LEVEL_SHORT[h.successorLevel]})` : " (starting cold)"}`
            : "nobody to hand it to"}
        </span>
        <span className={cn("text-xs", h.item.documented ? "text-muted" : "text-warn")}>
          ·{" "}
          {h.item.documented
            ? h.item.procedureLocation?.trim()
              ? `written · ${h.item.procedureLocation.trim()}`
              : "written, location not recorded"
            : "nothing written down"}
        </span>
        {journal?.reviewBy && (
          <span className="text-xs text-subtle">
            In the Journal · {h.training ? "training" : "writing it down"} · review by{" "}
            {journal.reviewBy}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">{h.note}</p>
    </li>
  );
}

function LeaverCard({
  leaver: l,
  today,
  assessed,
  onSelect,
  onChangeDate,
  onCancel,
  onMarkLeft,
  tracked,
  onLog,
}: {
  leaver: Leaver;
  today: string;
  /** False while nobody is marked on the register: the hand-over cannot be worked out. */
  assessed: boolean;
  onSelect: (knowledgeId: string) => void;
  onChangeDate: (lastDay: string) => void;
  onCancel: () => void;
  onMarkLeft: () => void;
  tracked: (a: AbsenceAction) => string | undefined;
  onLog: (a: AbsenceAction) => void;
}) {
  const first = firstName(l.person.name);
  const gone = l.status === "gone";
  const urgent = !gone && l.daysLeft <= HANDOVER_URGENT_DAYS;
  const deadline = handoverDeadline(l, today);
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        gone ? "border-danger/50" : urgent ? "border-warn/50" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {l.person.name} · last day {l.lastDay}
          </span>
          <Badge variant={gone ? "danger" : urgent ? "warn" : "default"}>
            {leaverLead(l.daysLeft)}
          </Badge>
          {assessed && (
            <Badge variant={l.dependence >= 50 ? "danger" : l.dependence >= 25 ? "warn" : "ok"}>
              {l.dependence}% of must-do work
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <label className="flex items-center gap-1 text-xs text-muted">
            Change
            <input
              type="date"
              className="h-6 rounded-md border border-border bg-elevated px-1.5 text-xs text-fg"
              value={l.lastDay}
              aria-label={`Change ${first}'s last day`}
              onChange={(e) => onChangeDate(e.target.value)}
            />
          </label>
          {gone && (
            <Button size="sm" className="h-6 px-2 text-xs" onClick={onMarkLeft}>
              <UserMinus className="size-3.5" /> Mark as left
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            aria-label={`${first} is staying`}
            onClick={onCancel}
          >
            Staying after all
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">
        {assessed ? describeLeaver(l) : NOT_ASSESSED_ABSENCE}
      </p>
      {gone && (
        <p className="mt-1 text-xs text-danger">
          {first}&apos;s last day has passed but {first} still counts as cover. Mark as left to take{" "}
          {first} out of the coverage figures; the record stays in the history.
        </p>
      )}
      {assessed && l.handover.length > 0 && (
        <>
          <div className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">
            Hand-over checklist · {l.handover.length} only {first} can run alone
            {l.unlogged > 0 && ` · ${l.unlogged} not yet in the Journal`}
          </div>
          <ul className="mt-1 space-y-1">
            {l.handover.map((h) => (
              <HandoverRow key={h.item.id} h={h} onSelect={onSelect} />
            ))}
          </ul>
        </>
      )}
      {l.shared.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Shared with others, keeps running: {l.shared.map((k) => k.name).join(", ")}
        </p>
      )}
      {l.orphanedProcesses.length > 0 && (
        <p className="mt-1 text-xs text-warn">
          Processes needing a new owner: {l.orphanedProcesses.join(", ")}
        </p>
      )}
      <div className="mt-2">
        <PeopleLine
          label={gone ? "Left in the business" : `Left in the business after ${l.lastDay}`}
          people={l.remaining.map((p) => p.name)}
        />
      </div>
      {assessed && l.actions.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            {gone ? "Overdue — do now" : `Before ${deadline}`}
          </div>
          <ol className="list-decimal space-y-1 pl-5">
            {l.actions.map((a) => (
              <li key={a.text}>
                {a.text}
                {a.knowledgeIds.length > 0 &&
                  (tracked(a) ? (
                    <span className="ml-2 text-xs text-subtle">
                      In the Journal · review by {tracked(a)}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-1 h-6 px-1.5 text-xs"
                      onClick={() => onLog(a)}
                    >
                      <BookOpen className="size-3.5" /> Log as decision
                    </Button>
                  ))}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function LeaveDebriefCard({
  debrief,
  people,
  answered,
  onPromote,
  onKeepTraining,
  onClose,
  onDismiss,
}: {
  debrief: LeaveDebrief;
  people: Person[];
  answered: (entry: DebriefItem) => boolean;
  onPromote: (entry: DebriefItem, standIn: Person) => void;
  onKeepTraining: (entry: DebriefItem, standIn: Person) => void;
  onClose: (entry: DebriefItem) => void;
  onDismiss: () => void;
}) {
  const first = firstName(debrief.person.name);
  /** Who the owner says actually stepped in, when the register had nobody lined up. */
  const [pickedStandIn, setPickedStandIn] = useState<Record<string, string>>({});
  const candidates = people.filter((p) => p.id !== debrief.person.id);
  const open = debrief.items.filter((e) => !answered(e));
  return (
    <div className="rounded-md border border-accent/40 bg-accent/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {first}&apos;s back · out {formatDateRange(debrief.absence.from, debrief.absence.to)}
          </span>
          <Badge variant="accent">Debrief</Badge>
          <span className="text-xs text-muted">
            {debrief.lengthDays} day{debrief.lengthDays === 1 ? "" : "s"} · back{" "}
            {debrief.daysSince === 1 ? "yesterday" : `${debrief.daysSince} days ago`}
          </span>
        </div>
        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={onDismiss}>
          Nothing to record
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Someone just ran {first}&apos;s work for real. Move them up on the register while it is
        fresh, or turn the gap into a tracked cross-training step.
      </p>
      <ul className="mt-2 space-y-2">
        {open.map((e) => {
          const standIn =
            e.standIn ?? candidates.find((p) => p.id === pickedStandIn[e.item.id]) ?? null;
          const standInFirst = standIn ? firstName(standIn.name) : undefined;
          return (
            <li key={e.item.id} className="rounded-md border border-border bg-surface px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{e.item.name}</span>
                <Badge variant={e.item.criticality === "critical" ? "danger" : "default"}>
                  {CRITICALITY_LABEL[e.item.criticality]}
                </Badge>
                {e.standIn && e.standInLevel && (
                  <span className="text-xs text-muted">
                    {standInFirst} today: {LEVEL_SHORT[e.standInLevel]}
                  </span>
                )}
                {e.handoff && <span className="text-xs text-subtle">Hand-off in the Journal</span>}
              </div>
              <p className="mt-0.5 text-xs text-muted">{describeDebriefItem(debrief, e)}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {!e.standIn && (
                  <select
                    className={cn(inputClass, "h-7 py-0 text-xs")}
                    aria-label={`Who stepped in for ${e.item.name}`}
                    value={pickedStandIn[e.item.id] ?? ""}
                    onChange={(ev) =>
                      setPickedStandIn((cur) => ({ ...cur, [e.item.id]: ev.target.value }))
                    }
                  >
                    <option value="">Who stepped in?</option>
                    {candidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
                {standIn && !standInAlreadyStrong(e) ? (
                  <>
                    <Button size="sm" className="h-7 text-xs" onClick={() => onPromote(e, standIn)}>
                      <UserCheck className="size-3.5" /> {standInFirst} can do it alone now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onKeepTraining(e, standIn)}
                    >
                      Not yet — {e.training ? "keep training" : "log cross-training"}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onClose(e)}
                  >
                    {e.handoff ? "Close the hand-off" : "Nobody did — move on"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PeopleLine({ label, people }: { label: string; people: string[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className={people.length ? "" : "text-muted"}>
        {people.length ? people.join(", ") : "nobody"}
      </span>
    </div>
  );
}
