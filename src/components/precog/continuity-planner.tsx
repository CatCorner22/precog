import { useMemo, useRef, useState } from "react";
import { BookOpen, Download, Plus, RotateCcw, Trash2, Upload, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import {
  continuityStepKey,
  isDecisionOpen,
  linkedContinuityStep,
  linkedKnowledgeId,
} from "@/lib/precog/decisions/follow-through";
import {
  parseRegisterCsv,
  registerTemplateCsv,
  registerToCsv,
  type RegisterImportIssue,
} from "@/lib/precog/import/register-csv";
import {
  absenceImpact,
  coverageReport,
  DOCUMENTATION_LABEL,
  documentationDebt,
  LEVEL_LABEL,
  LEVEL_ORDER,
  makeKnowledgeId,
  relationLevel,
  setRelationLevel,
  STATUS_LABEL,
  type AbsenceAction,
  type ContinuityStep,
  type CoverageStatus,
  type CrossTrainingMove,
  type DocumentationGap,
  type ItemCoverage,
} from "@/lib/precog/continuity/coverage";
import type { Criticality, KnowledgeItem, KnowledgeKind, KnowledgeLevel } from "@/lib/precog/types";
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

const inputClass = "rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg";

export function ContinuityPlanner({ initialKnowledgeId }: { initialKnowledgeId?: string | null }) {
  const {
    template: tpl,
    profile,
    setCustomKnowledge,
    setCustomRelations,
    addDecision,
  } = usePractice();
  const report = useMemo(() => coverageReport(tpl), [tpl]);
  const docs = useMemo(() => documentationDebt(tpl), [tpl]);
  /** Review date of the open journal entry for each (item, step) logged from this register. */
  const tracked = useMemo(() => {
    const byStep = new Map<string, string>();
    for (const d of profile.decisions) {
      const id = linkedKnowledgeId(d, profile.industry);
      if (!id || !isDecisionOpen(d) || !d.reviewBy) continue;
      const key = continuityStepKey(id, linkedContinuityStep(d));
      if (!byStep.has(key)) byStep.set(key, d.reviewBy);
    }
    return byStep;
  }, [profile.decisions, profile.industry]);
  const trackedBy = (knowledgeId: string, step: ContinuityStep) =>
    tracked.get(continuityStepKey(knowledgeId, step));

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
    reviewBy: Date,
  ) =>
    addDecision({
      subject,
      kind: "remediate",
      note,
      reviewBy: reviewBy.toISOString().slice(0, 10),
      linkedTab: "knowledge",
      linkedId: knowledgeId,
      linkedStep: step,
    });
  const confirmLogged = (reviewBy: Date, count = 1) =>
    toast.success(
      `${count === 1 ? "Logged" : `${count} steps logged`} in the Journal — the register is re-checked at the review on ${reviewBy.toLocaleDateString()}.`,
    );
  const logMove = (m: CrossTrainingMove) => {
    const reviewBy = reviewDateIn30Days();
    logContinuityDecision(m.item.name, m.action, m.item.id, "cover", reviewBy);
    confirmLogged(reviewBy);
  };
  const logGap = (g: DocumentationGap) => {
    const reviewBy = reviewDateIn30Days();
    logContinuityDecision(g.item.name, g.action, g.item.id, g.step, reviewBy);
    confirmLogged(reviewBy);
  };
  /** One entry per item, so each item's snapshot, review and slip check stand on their own. */
  const logAbsenceAction = (a: AbsenceAction) => {
    const reviewBy = reviewDateIn30Days();
    const pending = a.knowledgeIds
      .map((id) => tpl.knowledge.find((k) => k.id === id))
      .filter((k): k is KnowledgeItem => Boolean(k))
      .filter((k) => !trackedBy(k.id, a.step));
    for (const k of pending) logContinuityDecision(k.name, a.text, k.id, a.step, reviewBy);
    confirmLogged(reviewBy, pending.length);
  };
  /** An absence step is "in the Journal" once every item it names has an open entry for that step. */
  const absenceStepTracked = (a: AbsenceAction) =>
    a.knowledgeIds.length > 0 && a.knowledgeIds.every((id) => trackedBy(id, a.step))
      ? trackedBy(a.knowledgeIds[0], a.step)
      : undefined;
  const people = useMemo(() => tpl.people.filter((p) => p.active), [tpl.people]);
  const usingTemplateRegister = !profile.customKnowledge && !profile.customRelations;

  const [selectedId, setSelectedId] = useState<string | null>(initialKnowledgeId ?? null);
  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState<KnowledgeKind>("duty");
  const [draftCriticality, setDraftCriticality] = useState<Criticality>("important");
  const [absentId, setAbsentId] = useState<string | null>(null);
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
    };
    setCustomKnowledge((current) => [...current, item]);
    setSelectedId(item.id);
    setDraftName("");
  };

  const updateItem = (id: string, patch: Partial<KnowledgeItem>) =>
    setCustomKnowledge((current) => current.map((k) => (k.id === id ? { ...k, ...patch } : k)));

  const removeItem = (id: string) => {
    setCustomKnowledge((current) => current.filter((k) => k.id !== id));
    setCustomRelations((current) => current.filter((r) => r.knowledgeId !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const setLevel = (personId: string, knowledgeId: string, level: KnowledgeLevel | undefined) =>
    setCustomRelations((current) => setRelationLevel(current, personId, knowledgeId, level));

  const resetToTemplate = () => {
    setCustomKnowledge(null);
    setCustomRelations(null);
    setImportIssues([]);
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
      toast.success(
        `Imported ${result.knowledge.length} items and ${result.relations.length} assignments${
          result.issues.length ? `; ${result.issues.length} thing(s) need attention` : ""
        }`,
      );
    } catch {
      toast.error("Import failed", { description: "Choose a readable CSV file and try again." });
    }
  };

  const mostDepended = report.people[0];
  const absentPersonId =
    absentId && people.some((p) => p.id === absentId)
      ? absentId
      : (report.people.find((l) => l.person.active)?.person.id ?? null);
  const absence = useMemo(
    () => (absentPersonId ? absenceImpact(tpl, absentPersonId) : null),
    [tpl, absentPersonId],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Backed up"
          value={`${report.coverageIndex}%`}
          hint="Share of work two or more people can run alone (weighted by criticality)."
          tone={report.coverageIndex >= 70 ? "ok" : report.coverageIndex >= 40 ? "warn" : "danger"}
        />
        <Stat
          label="Single points"
          value={String(report.counts.single + report.counts.uncovered)}
          hint={`${report.counts.uncovered} with nobody, ${report.counts.single} with one person.`}
          tone={report.counts.single + report.counts.uncovered === 0 ? "ok" : "danger"}
        />
        <Stat
          label="Learners in place"
          value={String(report.counts.thin)}
          hint="One person can run it and someone else has started learning."
          tone="warn"
        />
        <Stat
          label="Written down"
          value={`${docs.documentedIndex}%`}
          hint={`${docs.counts.none} with nothing written, ${docs.counts.unlocated} written but location not recorded.`}
          tone={docs.documentedIndex >= 70 ? "ok" : docs.documentedIndex >= 40 ? "warn" : "danger"}
        />
        <Stat
          label="Most depended on"
          value={mostDepended ? mostDepended.person.name : "—"}
          hint={
            mostDepended
              ? `${mostDepended.dependence}% of critical work stops if they are out.`
              : "Add people to see who the business leans on."
          }
          tone={mostDepended && mostDepended.dependence >= 50 ? "danger" : "default"}
        />
      </div>

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
            {!usingTemplateRegister && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToTemplate}
                title="Back to the industry example list"
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
                          <div className="font-medium">{row.item.name}</div>
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
              {report.plan.length === 0 ? (
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
                <PeopleLine
                  label="Can run it alone"
                  people={selected.primaries.map((p) => p.name)}
                />
                <PeopleLine label="Learning" people={selected.learners.map((p) => p.name)} />
                <PeopleLine label="Aware only" people={selected.aware.map((p) => p.name)} />
                {selected.suggestedBackups.length > 0 && (
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
                )}
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
              <label className="flex flex-col gap-1 text-xs text-muted">
                Who is out
                <select
                  className={inputClass}
                  value={absentPersonId ?? ""}
                  onChange={(e) => setAbsentId(e.target.value || null)}
                  aria-label="Who is out"
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.role}
                    </option>
                  ))}
                </select>
              </label>
              {absence ? (
                <>
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
                      {absence.dependence}% of critical work stops
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
              <CardTitle>Who the business leans on</CardTitle>
              <CardDescription>
                Share of critical work that stops if each person is out. Spread the top names' sole
                items to bring these down.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {report.people
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
