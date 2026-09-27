import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Lightbulb, Recycle, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { inputCls, labelCls } from "@/components/ui/field-classes";
import { ChipPicker, SectionHeader } from "@/components/precog/builder/chips";
import { EvidenceList } from "@/components/precog/builder/evidence-list";
import { SuggestPanel } from "@/components/precog/builder/suggest-panel";
import { useAddForm } from "@/components/precog/builder/use-add-form";
import type { ProcessTextFields } from "@/lib/precog/builder/process-text";
import {
  commitFormText,
  initialFormText,
  PROCESS_TEXT_LIMITS as LIMITS,
  syncFormText,
} from "@/lib/precog/builder/process-text-sync";
import {
  CADENCE_LABEL,
  PROCESS_CADENCES,
  PROCESS_DOCUMENTATION_LABEL,
  parseCadence,
  processDocumentationState,
} from "@/lib/precog/process-record";
import {
  IDEA_CATEGORIES,
  IDEA_CATEGORY_LABEL,
  IDEA_STATUSES,
  IDEA_STATUS_LABEL,
  ideaSummary,
  LEVELS,
  LEVEL_LABEL,
  RISK_KINDS,
  RISK_KIND_LABEL,
  RISK_SCALE_STEPS,
  riskSummary,
  WASTE_KINDS,
  WASTE_KIND_LABEL,
} from "@/lib/precog/process-vocab";
import { uid } from "@/lib/precog/text";
import type {
  LeanWasteKind,
  Person,
  ProcessIdea,
  ProcessNode,
  ProcessRisk,
  ProcessRiskKind,
  ProcessWaste,
} from "@/lib/precog/types";
import { useTemplate } from "@/lib/precog/practice-context";
import { cn } from "@/lib/utils";

/**
 * The selected process's editor in the map builder. Panels lay out by the
 * builder card's width (container queries), not the window's, since the card
 * sits in a narrow column on a laptop.
 */
export function ProcessForm({
  process,
  all,
  onChange,
  onDelete,
  onSaveAsBlock,
}: {
  process: ProcessNode;
  all: ProcessNode[];
  onChange: (patch: Partial<ProcessNode>) => void;
  onDelete: () => void;
  onSaveAsBlock: () => void;
}) {
  const tpl = useTemplate();
  // The form's own copy of the text fields. An undo, import or restore that
  // changes the process text replaces the copy, so a stale copy is never
  // committed back over the change.
  const [text, setText] = useState(() => initialFormText(process));
  const synced = syncFormText(text, process);
  if (synced !== text) setText(synced);
  const { name, desc, inputs, outputs, systems, location } = synced.fields;
  const setField = (field: keyof ProcessTextFields, value: string) =>
    setText((t) => ({ ...t, fields: { ...t.fields, [field]: value } }));

  // The latest fields, process and callback, for the debounce and the
  // unmount commit, which run outside render.
  const latest = useRef({ fields: synced.fields, process, onChange });
  useEffect(() => {
    latest.current = { fields: synced.fields, process, onChange };
  });
  const commit = useCallback(() => {
    const { fields, process: current, onChange: write } = latest.current;
    const { patch, seenKey } = commitFormText(fields, current);
    if (!Object.keys(patch).length) return;
    setText((t) => ({ ...t, seenKey }));
    write(patch);
  }, []);

  // Debounce text field commits so typing doesn't thrash the graph.
  useEffect(() => {
    const t = setTimeout(commit, 350);
    return () => clearTimeout(t);
  }, [synced.fields, commit]);

  // The form remounts for each process, so an edit still inside the debounce
  // window when the owner selects another process, or closes the panel, is
  // committed as the form unmounts instead of being dropped.
  useEffect(() => commit, [commit]);

  const docState = processDocumentationState(process);

  const stages = useMemo(() => {
    const max = Math.max(4, ...all.map((p) => p.stage ?? 0));
    return Array.from({ length: max + 2 }, (_, i) => i);
  }, [all]);

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  const owners = process.ownerPersonIds ?? [];

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="grid gap-2 @sm:grid-cols-[1fr_88px]">
        <label>
          <span className={labelCls}>Name</span>
          <input
            className={inputCls}
            data-builder-field="name"
            maxLength={LIMITS.name}
            value={name}
            onChange={(e) => setField("name", e.target.value)}
          />
        </label>
        <label>
          <span className={labelCls}>Stage</span>
          <select
            className={inputCls}
            value={process.stage ?? 0}
            onChange={(e) => onChange({ stage: Number(e.target.value) })}
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="flex items-baseline justify-between gap-2">
          <span className={labelCls}>Description</span>
          <span className="text-xs text-subtle tabular">
            {desc.length} / {LIMITS.description}
          </span>
        </span>
        <textarea
          className={cn(inputCls, "min-h-[52px] resize-y")}
          maxLength={LIMITS.description}
          value={desc}
          onChange={(e) => setField("desc", e.target.value)}
        />
      </label>
      <div className="grid gap-2 @sm:grid-cols-2">
        <label>
          <span className={labelCls}>Inputs (comma-separated)</span>
          <input
            className={inputCls}
            value={inputs}
            onChange={(e) => setField("inputs", e.target.value)}
          />
        </label>
        <label>
          <span className={labelCls}>Outputs</span>
          <input
            className={inputCls}
            value={outputs}
            onChange={(e) => setField("outputs", e.target.value)}
          />
        </label>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <BookOpen className="size-3.5 text-primary" /> Continuity record
          </p>
          <p className="text-xs text-muted">
            What a stand-in needs on day one: how often this runs, where it runs, and where the
            written steps live.
          </p>
        </div>
        <div className="grid gap-2 @sm:grid-cols-2">
          <label>
            <span className={labelCls}>How often it runs</span>
            <select
              className={inputCls}
              value={process.cadence ?? ""}
              onChange={(e) => onChange({ cadence: parseCadence(e.target.value) ?? undefined })}
            >
              <option value="">Not recorded</option>
              {PROCESS_CADENCES.map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>Systems used (comma-separated)</span>
            <input
              className={inputCls}
              placeholder="Practice management system, bank portal"
              value={systems}
              onChange={(e) => setField("systems", e.target.value)}
            />
          </label>
        </div>
        <div className="grid gap-2 @sm:grid-cols-2">
          <label>
            <span className={labelCls}>Written procedure</span>
            <select
              className={inputCls}
              value={process.documented === undefined ? "" : process.documented ? "yes" : "no"}
              onChange={(e) => {
                const v = e.target.value;
                onChange({
                  documented: v === "" ? undefined : v === "yes",
                  ...(v !== "yes" ? { procedureLocation: undefined } : {}),
                });
                if (v !== "yes") setField("location", "");
              }}
            >
              <option value="">Not recorded</option>
              <option value="no">No, nothing written down</option>
              <option value="yes">Yes, a stand-in could follow it</option>
            </select>
          </label>
          <label>
            <span className={labelCls}>Where it lives</span>
            <input
              className={inputCls}
              placeholder="Shared drive path, binder, or link"
              maxLength={LIMITS.location}
              value={location}
              disabled={!process.documented}
              onChange={(e) => setField("location", e.target.value)}
            />
          </label>
        </div>
        <p
          className={cn(
            "text-xs",
            docState === "located"
              ? "text-ok"
              : docState === "unlocated"
                ? "text-warn"
                : "text-muted",
          )}
        >
          {PROCESS_DOCUMENTATION_LABEL[docState]}
          {docState === "none" && " — if this owner is out, a stand-in has nothing to follow."}
          {docState === "unlocated" && " — record where it lives so a stand-in can find it."}
        </p>
      </div>

      <ChipPicker
        label="Depends on"
        options={all.filter((p) => p.id !== process.id).map((p) => ({ id: p.id, label: p.name }))}
        selected={process.dependencies}
        onToggle={(id) => onChange({ dependencies: toggleIn(process.dependencies, id) })}
      />
      <ChipPicker
        label="Process owners"
        options={ownerOptions(tpl.people, owners)}
        selected={owners}
        onToggle={(id) => onChange({ ownerPersonIds: toggleIn(owners, id) })}
      />
      <ChipPicker
        label="Controls"
        options={tpl.controls.map((c) => ({
          id: c.id,
          label: c.name,
          tone: c.segregated ? undefined : "danger",
        }))}
        selected={process.controlIds}
        onToggle={(id) => onChange({ controlIds: toggleIn(process.controlIds, id) })}
      />

      <SuggestPanel process={process} onChange={onChange} />

      <RiskList
        risks={process.risks ?? []}
        onChange={(risks) => onChange({ risks })}
        knowledgeOptions={tpl.knowledge.map((k) => ({ id: k.id, label: k.name }))}
        controlOptions={tpl.controls.map((c) => ({ id: c.id, label: c.name }))}
        scenarioOptions={tpl.scenarios.map((s) => ({ id: s.id, label: s.title }))}
      />
      <IdeaList ideas={process.ideas ?? []} onChange={(ideas) => onChange({ ideas })} />
      <WasteList wastes={process.wastes ?? []} onChange={(wastes) => onChange({ wastes })} />
      <EvidenceList
        process={process}
        people={tpl.people}
        onChange={(evidence) => onChange({ evidence })}
      />

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-2">
        <Button size="sm" variant="secondary" onClick={onSaveAsBlock}>
          <Save className="size-3.5" /> Save as block
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          <Trash2 className="size-3.5" /> Delete process
        </Button>
      </div>
    </div>
  );
}

/**
 * People who can own the process: everyone still working here, then anyone
 * who has left but still holds it, marked "(left)" so the owner can take
 * them off.
 */
function ownerOptions(people: Person[], selected: string[]) {
  const label = (p: Person) => `${p.name} · ${p.role}`;
  return [
    ...people.filter((p) => p.active).map((p) => ({ id: p.id, label: label(p) })),
    ...people
      .filter((p) => !p.active && selected.includes(p.id))
      .map((p) => ({ id: p.id, label: `${label(p)} (left)`, tone: "danger" as const })),
  ];
}

type Option = { id: string; label: string };

function RiskList({
  risks,
  onChange,
  knowledgeOptions,
  controlOptions,
  scenarioOptions,
}: {
  risks: ProcessRisk[];
  onChange: (r: ProcessRisk[]) => void;
  knowledgeOptions: Option[];
  controlOptions: Option[];
  scenarioOptions: Option[];
}) {
  const form = useAddForm(
    {
      title: "",
      note: "",
      kind: "fraud" as ProcessRiskKind,
      severity: 3 as ProcessRisk["severity"],
      likelihood: 3 as ProcessRisk["likelihood"],
      linkedControlId: "",
      linkedScenarioId: "",
      linkedKnowledgeId: "",
    },
    ["kind", "severity", "likelihood"],
  );
  const { draft, set } = form;

  function updateRisk(id: string, patch: Partial<ProcessRisk>) {
    onChange(risks.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const links = [
    { field: "linkedControlId", label: "Linked control", options: controlOptions },
    { field: "linkedScenarioId", label: "Linked scenario", options: scenarioOptions },
    { field: "linkedKnowledgeId", label: "Linked knowledge", options: knowledgeOptions },
  ] as const;

  return (
    <div className="space-y-1.5">
      <SectionHeader
        icon={<AlertTriangle className="size-3 text-danger" />}
        title="Risks"
        count={risks.length}
        adding={form.adding}
        onAdd={form.toggle}
      />
      {risks.map((r) => (
        <div
          key={r.id}
          className="space-y-1 rounded-md border border-border bg-elevated px-2 py-1.5 text-xs"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-fg">{r.title}</p>
              <p className="text-subtle">
                {riskSummary(r)}
                {r.note ? ` · ${r.note}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChange(risks.filter((x) => x.id !== r.id))}
              className="text-subtle hover:text-danger"
              aria-label={`Remove risk ${r.title}`}
            >
              <Trash2 className="size-3" />
            </button>
          </div>
          <div className="grid gap-1 @md:grid-cols-3">
            {links.map((link) => (
              <select
                key={link.field}
                className={inputCls}
                aria-label={`${link.label} for ${r.title}`}
                value={r[link.field] ?? ""}
                onChange={(e) => updateRisk(r.id, { [link.field]: e.target.value || undefined })}
              >
                <option value="">{link.label}: none</option>
                {link.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </div>
      ))}
      {form.adding && (
        <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
          <input
            className={inputCls}
            placeholder="Risk title"
            aria-label="Risk title"
            maxLength={LIMITS.itemTitle}
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            autoFocus
          />
          <div className="grid gap-1.5 @sm:grid-cols-3">
            <select
              className={inputCls}
              aria-label="Kind of risk"
              value={draft.kind}
              onChange={(e) => set("kind", e.target.value as ProcessRiskKind)}
            >
              {RISK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {RISK_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              aria-label="Severity, 1 to 5"
              value={draft.severity}
              onChange={(e) => set("severity", Number(e.target.value) as ProcessRisk["severity"])}
            >
              {RISK_SCALE_STEPS.map((n) => (
                <option key={n} value={n}>
                  Severity {n} of 5
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              aria-label="Likelihood, 1 to 5"
              value={draft.likelihood}
              onChange={(e) =>
                set("likelihood", Number(e.target.value) as ProcessRisk["likelihood"])
              }
            >
              {RISK_SCALE_STEPS.map((n) => (
                <option key={n} value={n}>
                  Likelihood {n} of 5
                </option>
              ))}
            </select>
          </div>
          <input
            className={inputCls}
            placeholder="Note (optional)"
            aria-label="Note"
            maxLength={LIMITS.itemNote}
            value={draft.note}
            onChange={(e) => set("note", e.target.value)}
          />
          <div className="grid gap-1 @md:grid-cols-3">
            {links.map((link) => (
              <select
                key={link.field}
                className={inputCls}
                aria-label={link.label}
                value={draft[link.field]}
                onChange={(e) => set(link.field, e.target.value)}
              >
                <option value="">{link.label}: none</option>
                {link.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            ))}
          </div>
          <Button
            size="sm"
            disabled={!form.ready}
            onClick={() =>
              form.submit((d) =>
                onChange([
                  ...risks,
                  {
                    id: uid("r"),
                    title: d.title.trim(),
                    kind: d.kind,
                    severity: d.severity,
                    likelihood: d.likelihood,
                    note: d.note.trim(),
                    linkedKnowledgeId: d.linkedKnowledgeId || undefined,
                    linkedControlId: d.linkedControlId || undefined,
                    linkedScenarioId: d.linkedScenarioId || undefined,
                  },
                ]),
              )
            }
          >
            Add risk
          </Button>
        </div>
      )}
    </div>
  );
}

function IdeaList({
  ideas,
  onChange,
}: {
  ideas: ProcessIdea[];
  onChange: (i: ProcessIdea[]) => void;
}) {
  const form = useAddForm(
    {
      title: "",
      note: "",
      category: "control" as ProcessIdea["category"],
      effort: "low" as ProcessIdea["effort"],
      impact: "high" as ProcessIdea["impact"],
      status: "backlog" as ProcessIdea["status"],
    },
    ["category", "effort", "impact", "status"],
  );
  const { draft, set } = form;

  return (
    <div className="space-y-1.5">
      <SectionHeader
        icon={<Lightbulb className="size-3 text-warn" />}
        title="Improvement ideas"
        count={ideas.length}
        adding={form.adding}
        onAdd={form.toggle}
      />
      {ideas.map((i) => (
        <div
          key={i.id}
          className="flex items-start gap-2 rounded-md border border-border bg-elevated px-2 py-1.5 text-xs"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-fg">{i.title}</p>
            <p className="text-subtle">{ideaSummary(i)}</p>
          </div>
          <select
            className="rounded border border-border bg-surface px-1 text-xs text-muted"
            aria-label={`Status of ${i.title}`}
            value={i.status}
            onChange={(e) =>
              onChange(
                ideas.map((x) =>
                  x.id === i.id ? { ...x, status: e.target.value as ProcessIdea["status"] } : x,
                ),
              )
            }
          >
            {IDEA_STATUSES.map((s) => (
              <option key={s} value={s}>
                {IDEA_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onChange(ideas.filter((x) => x.id !== i.id))}
            className="text-subtle hover:text-danger"
            aria-label={`Remove idea ${i.title}`}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
      {form.adding && (
        <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
          <input
            className={inputCls}
            placeholder="Idea title"
            aria-label="Idea title"
            maxLength={LIMITS.itemTitle}
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-1.5 @md:grid-cols-4">
            <select
              className={inputCls}
              aria-label="Category"
              value={draft.category}
              onChange={(e) => set("category", e.target.value as ProcessIdea["category"])}
            >
              {IDEA_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {IDEA_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              aria-label="Effort"
              value={draft.effort}
              onChange={(e) => set("effort", e.target.value as ProcessIdea["effort"])}
            >
              {LEVELS.map((c) => (
                <option key={c} value={c}>
                  {LEVEL_LABEL[c]} effort
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              aria-label="Impact"
              value={draft.impact}
              onChange={(e) => set("impact", e.target.value as ProcessIdea["impact"])}
            >
              {LEVELS.map((c) => (
                <option key={c} value={c}>
                  {LEVEL_LABEL[c]} impact
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              aria-label="Status"
              value={draft.status}
              onChange={(e) => set("status", e.target.value as ProcessIdea["status"])}
            >
              {IDEA_STATUSES.map((c) => (
                <option key={c} value={c}>
                  {IDEA_STATUS_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <input
            className={inputCls}
            placeholder="Note (optional)"
            aria-label="Note"
            maxLength={LIMITS.itemNote}
            value={draft.note}
            onChange={(e) => set("note", e.target.value)}
          />
          <Button
            size="sm"
            disabled={!form.ready}
            onClick={() =>
              form.submit((d) =>
                onChange([
                  ...ideas,
                  {
                    id: uid("i"),
                    title: d.title.trim(),
                    category: d.category,
                    effort: d.effort,
                    impact: d.impact,
                    status: d.status,
                    note: d.note.trim(),
                  },
                ]),
              )
            }
          >
            Add idea
          </Button>
        </div>
      )}
    </div>
  );
}

function WasteList({
  wastes,
  onChange,
}: {
  wastes: ProcessWaste[];
  onChange: (w: ProcessWaste[]) => void;
}) {
  const form = useAddForm({ title: "", note: "", kind: "muda_waiting" as LeanWasteKind }, ["kind"]);
  const { draft, set } = form;

  return (
    <div className="space-y-1.5">
      <SectionHeader
        icon={<Recycle className="size-3 text-muted" />}
        title="Lean waste"
        count={wastes.length}
        adding={form.adding}
        onAdd={form.toggle}
      />
      {wastes.map((w) => (
        <div
          key={w.id}
          className="flex items-start gap-2 rounded-md border border-border bg-elevated px-2 py-1.5 text-xs"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-fg">{w.label}</p>
            <p className="text-subtle">
              {WASTE_KIND_LABEL[w.kind] ?? w.kind}
              {w.note ? ` · ${w.note}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(wastes.filter((x) => x.id !== w.id))}
            className="text-subtle hover:text-danger"
            aria-label={`Remove waste ${w.label}`}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
      {form.adding && (
        <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
          <div className="grid grid-cols-[120px_1fr] gap-1.5">
            <select
              className={inputCls}
              aria-label="Kind of waste"
              value={draft.kind}
              onChange={(e) => set("kind", e.target.value as LeanWasteKind)}
            >
              {WASTE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {WASTE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              placeholder="What is wasted?"
              aria-label="What is wasted"
              maxLength={LIMITS.itemTitle}
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              autoFocus
            />
          </div>
          <input
            className={inputCls}
            placeholder="Note (optional)"
            aria-label="Note"
            maxLength={LIMITS.itemNote}
            value={draft.note}
            onChange={(e) => set("note", e.target.value)}
          />
          <Button
            size="sm"
            disabled={!form.ready}
            onClick={() =>
              form.submit((d) =>
                onChange([
                  ...wastes,
                  { id: uid("w"), kind: d.kind, label: d.title.trim(), note: d.note.trim() },
                ]),
              )
            }
          >
            Add waste
          </Button>
        </div>
      )}
    </div>
  );
}
