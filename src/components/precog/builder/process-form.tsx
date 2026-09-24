import { EvidenceList } from "@/components/precog/builder/evidence-list";
import { SuggestPanel } from "@/components/precog/builder/suggest-panel";

import { useEffect, useMemo, useRef, useState } from "react";

import { useTemplate } from "@/lib/precog/use-template";
import { textPatch } from "@/lib/precog/builder/process-text";
import type {
  LeanWasteKind,
  ProcessIdea,
  ProcessNode,
  ProcessRisk,
  ProcessRiskKind,
  ProcessWaste,
} from "@/lib/precog/types";

import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import { AlertTriangle, BookOpen, Lightbulb, Recycle, Trash2 } from "lucide-react";
import {
  CADENCE_LABEL,
  PROCESS_CADENCES,
  PROCESS_DOCUMENTATION_LABEL,
  parseCadence,
  processDocumentationState,
} from "@/lib/precog/process-record";

import { Save } from "lucide-react";

import {
  RISK_KINDS,
  IDEA_CATEGORIES,
  EFFORTS,
  IDEA_STATUS,
  WASTE_KINDS,
  uid,
  inputCls,
  labelCls,
} from "@/components/precog/builder/form-shared";
import { ChipPicker, SectionHeader } from "@/components/precog/builder/chips";
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
  const [name, setName] = useState(process.name);
  const [desc, setDesc] = useState(process.description);
  const [inputs, setInputs] = useState((process.inputs ?? []).join(", "));
  const [outputs, setOutputs] = useState((process.outputs ?? []).join(", "));
  const [systems, setSystems] = useState((process.systems ?? []).join(", "));
  const [location, setLocation] = useState(process.procedureLocation ?? "");

  // Debounce text field commits so typing doesn't thrash the graph.
  useEffect(() => {
    const t = setTimeout(() => {
      const patch = textPatch({ name, desc, inputs, outputs, systems, location }, process);
      if (Object.keys(patch).length) onChange(patch);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, desc, inputs, outputs, systems, location]);

  // The form remounts for each process, so an edit still inside the debounce
  // window when the owner selects another process, or closes the panel, is
  // committed as the form unmounts instead of being dropped.
  const latest = useRef({
    fields: { name, desc, inputs, outputs, systems, location },
    process,
    onChange,
  });
  useEffect(() => {
    latest.current = {
      fields: { name, desc, inputs, outputs, systems, location },
      process,
      onChange,
    };
  });
  useEffect(
    () => () => {
      const { fields, process: current, onChange: commit } = latest.current;
      const patch = textPatch(fields, current);
      if (Object.keys(patch).length) commit(patch);
    },
    [],
  );

  const docState = processDocumentationState(process);

  const stages = useMemo(() => {
    const max = Math.max(4, ...all.map((p) => p.stage ?? 0));
    return Array.from({ length: max + 2 }, (_, i) => i);
  }, [all]);

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_88px]">
        <label>
          <span className={labelCls}>Name</span>
          <input
            className={inputCls}
            data-builder-field="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
      <label>
        <span className={labelCls}>Description</span>
        <textarea
          className={cn(inputCls, "min-h-[52px] resize-y")}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label>
          <span className={labelCls}>Inputs (comma-separated)</span>
          <input className={inputCls} value={inputs} onChange={(e) => setInputs(e.target.value)} />
        </label>
        <label>
          <span className={labelCls}>Outputs</span>
          <input
            className={inputCls}
            value={outputs}
            onChange={(e) => setOutputs(e.target.value)}
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
        <div className="grid gap-2 sm:grid-cols-2">
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
              onChange={(e) => setSystems(e.target.value)}
            />
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
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
                if (v !== "yes") setLocation("");
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
              value={location}
              disabled={!process.documented}
              onChange={(e) => setLocation(e.target.value)}
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
        label="Owners"
        options={tpl.people.map((p) => ({ id: p.id, label: `${p.name} · ${p.role}` }))}
        selected={process.ownerPersonIds ?? []}
        onToggle={(id) => onChange({ ownerPersonIds: toggleIn(process.ownerPersonIds ?? [], id) })}
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

export function RiskList({
  risks,
  onChange,
  knowledgeOptions,
  controlOptions,
  scenarioOptions,
}: {
  risks: ProcessRisk[];
  onChange: (r: ProcessRisk[]) => void;
  knowledgeOptions: { id: string; label: string }[];
  controlOptions: { id: string; label: string }[];
  scenarioOptions: { id: string; label: string }[];
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProcessRiskKind>("fraud");
  const [sev, setSev] = useState(3);
  const [lik, setLik] = useState(3);
  const [note, setNote] = useState("");
  const [knowledgeId, setKnowledgeId] = useState("");
  const [controlId, setControlId] = useState("");
  const [scenarioId, setScenarioId] = useState("");

  function commit() {
    if (!title.trim()) return;
    onChange([
      ...risks,
      {
        id: uid("r"),
        title: title.trim().slice(0, 80),
        kind,
        severity: sev as ProcessRisk["severity"],
        likelihood: lik as ProcessRisk["likelihood"],
        note: note.trim().slice(0, 200),
        linkedKnowledgeId: knowledgeId || undefined,
        linkedControlId: controlId || undefined,
        linkedScenarioId: scenarioId || undefined,
      },
    ]);
    setTitle("");
    setNote("");
    setKnowledgeId("");
    setControlId("");
    setScenarioId("");
    setAdding(false);
  }

  function updateRisk(id: string, patch: Partial<ProcessRisk>) {
    onChange(risks.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-1.5">
      <SectionHeader
        icon={<AlertTriangle className="size-3 text-danger" />}
        title="Risks"
        count={risks.length}
        adding={adding}
        onAdd={() => setAdding((v) => !v)}
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
                {r.kind} · S{r.severity}×L{r.likelihood}
                {r.note ? ` · ${r.note}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChange(risks.filter((x) => x.id !== r.id))}
              className="text-subtle hover:text-danger"
              aria-label="Remove risk"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
          <div className="grid gap-1 sm:grid-cols-3">
            <select
              className={inputCls}
              value={r.linkedControlId ?? ""}
              onChange={(e) => updateRisk(r.id, { linkedControlId: e.target.value || undefined })}
            >
              <option value="">Link control…</option>
              {controlOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={r.linkedScenarioId ?? ""}
              onChange={(e) => updateRisk(r.id, { linkedScenarioId: e.target.value || undefined })}
            >
              <option value="">Link scenario…</option>
              {scenarioOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={r.linkedKnowledgeId ?? ""}
              onChange={(e) => updateRisk(r.id, { linkedKnowledgeId: e.target.value || undefined })}
            >
              <option value="">Link knowledge…</option>
              {knowledgeOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
      {adding && (
        <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
          <input
            className={inputCls}
            placeholder="Risk title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-3 gap-1.5">
            <select
              className={inputCls}
              value={kind}
              onChange={(e) => setKind(e.target.value as ProcessRiskKind)}
            >
              {RISK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={sev}
              onChange={(e) => setSev(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  Severity {n}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={lik}
              onChange={(e) => setLik(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  Likelihood {n}
                </option>
              ))}
            </select>
          </div>
          <input
            className={inputCls}
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="grid gap-1 sm:grid-cols-3">
            <select
              className={inputCls}
              value={controlId}
              onChange={(e) => setControlId(e.target.value)}
            >
              <option value="">Link control (optional)</option>
              {controlOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
            >
              <option value="">Link scenario (optional)</option>
              {scenarioOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={knowledgeId}
              onChange={(e) => setKnowledgeId(e.target.value)}
            >
              <option value="">Link knowledge (optional)</option>
              {knowledgeOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={commit} disabled={!title.trim()}>
            Add risk
          </Button>
        </div>
      )}
    </div>
  );
}

export function IdeaList({
  ideas,
  onChange,
}: {
  ideas: ProcessIdea[];
  onChange: (i: ProcessIdea[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ProcessIdea["category"]>("control");
  const [effort, setEffort] = useState<ProcessIdea["effort"]>("low");
  const [impact, setImpact] = useState<ProcessIdea["impact"]>("high");
  const [status, setStatus] = useState<ProcessIdea["status"]>("backlog");
  const [note, setNote] = useState("");

  function commit() {
    if (!title.trim()) return;
    onChange([
      ...ideas,
      {
        id: uid("i"),
        title: title.trim().slice(0, 80),
        category,
        effort,
        impact,
        status,
        note: note.trim().slice(0, 200),
      },
    ]);
    setTitle("");
    setNote("");
    setAdding(false);
  }

  return (
    <div className="space-y-1.5">
      <SectionHeader
        icon={<Lightbulb className="size-3 text-warn" />}
        title="Improvement ideas"
        count={ideas.length}
        adding={adding}
        onAdd={() => setAdding((v) => !v)}
      />
      {ideas.map((i) => (
        <div
          key={i.id}
          className="flex items-start gap-2 rounded-md border border-border bg-elevated px-2 py-1.5 text-xs"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-fg">{i.title}</p>
            <p className="text-subtle">
              {i.category} · {i.effort} effort · {i.impact} impact · {i.status}
            </p>
          </div>
          <select
            className="rounded border border-border bg-surface px-1 text-xs text-muted"
            value={i.status}
            onChange={(e) =>
              onChange(
                ideas.map((x) =>
                  x.id === i.id ? { ...x, status: e.target.value as ProcessIdea["status"] } : x,
                ),
              )
            }
          >
            {IDEA_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onChange(ideas.filter((x) => x.id !== i.id))}
            className="text-subtle hover:text-danger"
            aria-label="Remove idea"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
      {adding && (
        <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
          <input
            className={inputCls}
            placeholder="Idea title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <select
              className={inputCls}
              value={category}
              onChange={(e) => setCategory(e.target.value as ProcessIdea["category"])}
            >
              {IDEA_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={effort}
              onChange={(e) => setEffort(e.target.value as ProcessIdea["effort"])}
            >
              {EFFORTS.map((c) => (
                <option key={c} value={c}>
                  {c} effort
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={impact}
              onChange={(e) => setImpact(e.target.value as ProcessIdea["impact"])}
            >
              {EFFORTS.map((c) => (
                <option key={c} value={c}>
                  {c} impact
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={status}
              onChange={(e) => setStatus(e.target.value as ProcessIdea["status"])}
            >
              {IDEA_STATUS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <input
            className={inputCls}
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button size="sm" onClick={commit} disabled={!title.trim()}>
            Add idea
          </Button>
        </div>
      )}
    </div>
  );
}

export function WasteList({
  wastes,
  onChange,
}: {
  wastes: ProcessWaste[];
  onChange: (w: ProcessWaste[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<LeanWasteKind>("muda_waiting");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  function commit() {
    if (!label.trim()) return;
    onChange([
      ...wastes,
      { id: uid("w"), kind, label: label.trim().slice(0, 80), note: note.trim().slice(0, 200) },
    ]);
    setLabel("");
    setNote("");
    setAdding(false);
  }

  return (
    <div className="space-y-1.5">
      <SectionHeader
        icon={<Recycle className="size-3 text-muted" />}
        title="Lean waste"
        count={wastes.length}
        adding={adding}
        onAdd={() => setAdding((v) => !v)}
      />
      {wastes.map((w) => (
        <div
          key={w.id}
          className="flex items-start gap-2 rounded-md border border-border bg-elevated px-2 py-1.5 text-xs"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-fg">{w.label}</p>
            <p className="text-subtle">
              {WASTE_KINDS.find((k) => k.id === w.kind)?.label ?? w.kind}
              {w.note ? ` · ${w.note}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(wastes.filter((x) => x.id !== w.id))}
            className="text-subtle hover:text-danger"
            aria-label="Remove waste"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
      {adding && (
        <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
          <div className="grid grid-cols-[120px_1fr] gap-1.5">
            <select
              className={inputCls}
              value={kind}
              onChange={(e) => setKind(e.target.value as LeanWasteKind)}
            >
              {WASTE_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              placeholder="What is wasted?"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>
          <input
            className={inputCls}
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button size="sm" onClick={commit} disabled={!label.trim()}>
            Add waste
          </Button>
        </div>
      )}
    </div>
  );
}
