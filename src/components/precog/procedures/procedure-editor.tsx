import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fieldCls } from "@/components/ui/field-classes";
import { secretKindsIn, SECRET_WARNING } from "@/lib/precog/procedures/credential-guard";
import { newStep } from "@/lib/precog/procedures/lifecycle";
import {
  MAX_REVIEW_DAYS,
  MIN_REVIEW_DAYS,
  PROCEDURE_LIMITS,
  reviewDays,
  webUrl,
} from "@/lib/precog/procedures/normalize";
import type { Place, Procedure, ProcedureStep } from "@/lib/precog/procedures/types";
import type { KnowledgeItem, Person } from "@/lib/precog/types";
import { StepPictures, type PictureAccess } from "./step-pictures";

const labelCls = "flex flex-col gap-1 text-xs text-muted";
const inputCls = `${fieldCls} w-full`;

/**
 * Edits a copy of one procedure; nothing is saved until Save. Steps are
 * added, moved and removed with labelled buttons, so the whole editor works
 * from the keyboard. A step that looks like it holds a password, card number
 * or code shows a warning; it never blocks the save.
 */
export function ProcedureEditor({
  initial,
  isNew,
  places,
  people,
  knowledge,
  pictureAccess,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Procedure;
  isNew: boolean;
  places: readonly Place[];
  people: readonly Person[];
  knowledge: readonly KnowledgeItem[];
  /** Whether step pictures can be added, and why not. */
  pictureAccess: PictureAccess;
  /** False when the procedure did not fit and was not saved. */
  onSave: (next: Procedure) => boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<Procedure>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Procedure>(key: K, value: Procedure[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setStep = (id: string, patch: Partial<ProcedureStep>) =>
    set(
      "steps",
      draft.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  const moveStep = (index: number, delta: -1 | 1) => {
    const steps = [...draft.steps];
    const [step] = steps.splice(index, 1);
    steps.splice(index + delta, 0, step);
    set("steps", steps);
  };
  const secrets = useMemo(
    () =>
      secretKindsIn([
        ...draft.steps.flatMap((s) => [s.text, s.caution ?? ""]),
        ...draft.prerequisites,
        draft.purpose ?? "",
        draft.trigger ?? "",
      ]),
    [draft],
  );
  const activePeople = people.filter((p) => p.active);

  function save() {
    const title = draft.title.trim();
    if (!title) {
      setError("Give the procedure a title.");
      return;
    }
    const url = draft.url?.trim() ? webUrl(draft.url) : "";
    if (draft.url?.trim() && !url) {
      setError("The link must start with https:// or http://.");
      return;
    }
    const next: Procedure = {
      ...draft,
      title,
      url: url || undefined,
      module: draft.module?.trim() || undefined,
      purpose: draft.purpose?.trim() || undefined,
      trigger: draft.trigger?.trim() || undefined,
      prerequisites: draft.prerequisites.map((p) => p.trim()).filter(Boolean),
      steps: draft.steps
        .map((s) => ({ ...s, text: s.text.trim(), caution: s.caution?.trim() || undefined }))
        .filter((s) => s.text || s.caution || s.imageIds?.length || s.requiresPhoto),
      backupPersonIds: draft.backupPersonIds.filter((id) => id !== draft.ownerPersonId),
      reviewEveryDays: reviewDays(draft.reviewEveryDays),
    };
    if (!onSave(next)) {
      setError(
        "This procedure does not fit: the business already holds as many procedures as it can store. Shorten some steps or remove an old procedure.",
      );
      return;
    }
    setError(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isNew ? "New procedure" : "Edit procedure"}</CardTitle>
        <CardDescription>
          Write it for someone who has never done the task. Start each step with a verb and keep to
          one action per step. Changing the steps clears the verification until someone checks them
          again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <label className={labelCls}>
          Title
          <input
            className={inputCls}
            value={draft.title}
            maxLength={PROCEDURE_LIMITS.title}
            placeholder="e.g. Reconcile the checking account"
            onChange={(e) => set("title", e.target.value)}
          />
        </label>

        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            Where it is done
          </legend>
          <label className={labelCls}>
            Platform or place
            <select
              className={inputCls}
              value={draft.placeId ?? ""}
              onChange={(e) => set("placeId", e.target.value || undefined)}
            >
              <option value="">Not set</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.kind === "physical" ? " (physical place)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Module or screen
            <input
              className={inputCls}
              value={draft.module ?? ""}
              maxLength={PROCEDURE_LIMITS.module}
              placeholder="e.g. Banking › Reconcile"
              onChange={(e) => set("module", e.target.value)}
            />
          </label>
          <label className={labelCls}>
            Link to that screen (optional)
            <input
              className={inputCls}
              type="url"
              value={draft.url ?? ""}
              maxLength={PROCEDURE_LIMITS.url}
              placeholder="https://"
              onChange={(e) => set("url", e.target.value)}
            />
          </label>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Why it matters and what done looks like
            <textarea
              className={inputCls}
              rows={2}
              value={draft.purpose ?? ""}
              maxLength={PROCEDURE_LIMITS.purpose}
              onChange={(e) => set("purpose", e.target.value)}
            />
          </label>
          <label className={labelCls}>
            When to do it
            <textarea
              className={inputCls}
              rows={2}
              value={draft.trigger ?? ""}
              maxLength={PROCEDURE_LIMITS.trigger}
              placeholder="e.g. When the bank statement arrives, by the 5th"
              onChange={(e) => set("trigger", e.target.value)}
            />
          </label>
        </div>

        <label className={labelCls}>
          What you need first, one per line (name the login or key, never the password)
          <textarea
            className={inputCls}
            rows={2}
            value={draft.prerequisites.join("\n")}
            placeholder={"Bookkeeper login to QuickBooks Online\nLast month's bank statement"}
            onChange={(e) =>
              set(
                "prerequisites",
                e.target.value.split("\n").slice(0, PROCEDURE_LIMITS.prerequisites),
              )
            }
          />
        </label>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Steps</div>
          {draft.steps.length === 0 && (
            <p className="text-xs text-muted">No steps yet. Add the first one below.</p>
          )}
          <ol className="space-y-3">
            {draft.steps.map((step, index) => (
              <li key={step.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 w-6 shrink-0 text-right text-xs font-semibold text-muted">
                    {index + 1}.
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <label className="sr-only" htmlFor={`step-${step.id}`}>
                      Step {index + 1}
                    </label>
                    <textarea
                      id={`step-${step.id}`}
                      className={inputCls}
                      rows={2}
                      value={step.text}
                      maxLength={PROCEDURE_LIMITS.stepText}
                      placeholder="e.g. Open Banking and choose the checking account."
                      onChange={(e) => setStep(step.id, { text: e.target.value })}
                    />
                    <input
                      aria-label={`Caution for step ${index + 1} (optional)`}
                      className={inputCls}
                      value={step.caution ?? ""}
                      maxLength={PROCEDURE_LIMITS.caution}
                      placeholder="Caution (optional): what not to do here"
                      onChange={(e) => setStep(step.id, { caution: e.target.value })}
                    />
                    <StepPictures
                      stepNumber={index + 1}
                      imageIds={step.imageIds ?? []}
                      requiresPhoto={Boolean(step.requiresPhoto)}
                      access={pictureAccess}
                      onChange={({ imageIds, requiresPhoto }) =>
                        setStep(step.id, {
                          imageIds: imageIds.length ? imageIds : undefined,
                          requiresPhoto: requiresPhoto ? true : undefined,
                        })
                      }
                    />
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      aria-label={`Move step ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => moveStep(index, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      aria-label={`Move step ${index + 1} down`}
                      disabled={index === draft.steps.length - 1}
                      onClick={() => moveStep(index, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      aria-label={`Remove step ${index + 1}`}
                      onClick={() =>
                        set(
                          "steps",
                          draft.steps.filter((s) => s.id !== step.id),
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <Button
            size="sm"
            variant="outline"
            disabled={draft.steps.length >= PROCEDURE_LIMITS.steps}
            onClick={() => set("steps", [...draft.steps, newStep()])}
          >
            <Plus className="size-3.5" /> Add step
          </Button>
        </div>

        {secrets.length > 0 && (
          <div
            role="alert"
            className="space-y-1 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn"
          >
            {secrets.map((kind) => (
              <p key={kind} className="flex gap-2">
                <ShieldAlert className="size-4 shrink-0" aria-hidden />
                {SECRET_WARNING[kind]}
              </p>
            ))}
          </div>
        )}

        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            People
          </legend>
          <label className={labelCls}>
            Who does it today
            <select
              className={inputCls}
              value={draft.ownerPersonId ?? ""}
              onChange={(e) => set("ownerPersonId", e.target.value || undefined)}
            >
              <option value="">Not set</option>
              {activePeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Who checks it still works
            <select
              className={inputCls}
              value={draft.reviewerPersonId ?? ""}
              onChange={(e) => set("reviewerPersonId", e.target.value || undefined)}
            >
              <option value="">The owner</option>
              {activePeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Check it every (days)
            <input
              className={inputCls}
              type="number"
              min={MIN_REVIEW_DAYS}
              max={MAX_REVIEW_DAYS}
              value={draft.reviewEveryDays}
              onChange={(e) => set("reviewEveryDays", Number(e.target.value))}
            />
          </label>
        </fieldset>
        {draft.reviewerPersonId && draft.reviewerPersonId === draft.ownerPersonId && (
          <p className="text-xs text-muted">
            The person who does the task is also the one checking it. Someone else checking catches
            steps the author skips without noticing.
          </p>
        )}

        <fieldset>
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            Who should be able to follow it when that person is out
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {activePeople
              .filter((p) => p.id !== draft.ownerPersonId)
              .map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.backupPersonIds.includes(p.id)}
                    onChange={(e) =>
                      set(
                        "backupPersonIds",
                        e.target.checked
                          ? [...draft.backupPersonIds, p.id].slice(0, PROCEDURE_LIMITS.backups)
                          : draft.backupPersonIds.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            What it covers on Who knows what
          </legend>
          <div className="flex max-h-48 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
            {knowledge.map((k) => (
              <label key={k.id} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={draft.knowledgeIds.includes(k.id)}
                  onChange={(e) =>
                    set(
                      "knowledgeIds",
                      e.target.checked
                        ? [...draft.knowledgeIds, k.id].slice(0, PROCEDURE_LIMITS.links)
                        : draft.knowledgeIds.filter((id) => id !== k.id),
                    )
                  }
                />
                {k.name}
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={save}>Save procedure</Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          {!isNew && (
            <Button variant="danger" className="ml-auto" onClick={onDelete}>
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
