import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fieldCls } from "@/components/ui/field-classes";
import { secretKindsIn, SECRET_WARNING } from "@/lib/precog/procedures/credential-guard";
import { newStep, stepHasContent, withoutDraftMarks } from "@/lib/precog/procedures/lifecycle";
import type { ProcedureDraft } from "@/lib/precog/procedures/draft";
import { industryMeta } from "@/lib/precog/industry";
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
import { DutyConflictNote } from "./procedure-proof";
import { DraftFromNotes } from "./draft-from-notes";
import { BestPracticeCheck } from "./best-practice-check";
import { procedureRecommendations } from "@/lib/precog/procedures/quality";
import { localDateKey } from "@/lib/precog/dates";
import { useToday } from "@/lib/use-today";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { procedureDutyConflicts } from "@/lib/precog/procedures/duty-conflicts";
import { personDuties } from "@/lib/precog/sod/assignments";
import { ENTITLEMENTS, type EntitlementId } from "@/lib/precog/sod/conflict-rules";

const labelCls = "flex flex-col gap-1 text-xs text-muted";
const TITLE_NEEDED = "Give the procedure a title.";
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
  // Where keyboard focus goes after a step control that may disappear is used (an element id).
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(focusId);
    if (el instanceof HTMLButtonElement && el.disabled) {
      // A step moved to an end: its button that way is disabled, so use the other one.
      const other = focusId.endsWith("-down")
        ? focusId.replace(/-down$/, "-up")
        : focusId.replace(/-up$/, "-down");
      document.getElementById(other)?.focus();
    } else el?.focus();
    setFocusId(null);
  }, [focusId]);
  const set = <K extends keyof Procedure>(key: K, value: Procedure[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  // Editing a step's text makes it the person's own, so it is no longer an AI draft or a suggestion.
  const setStep = (id: string, patch: Partial<ProcedureStep>) =>
    set(
      "steps",
      draft.steps.map((s) =>
        s.id === id
          ? "text" in patch
            ? withoutDraftMarks({ ...s, ...patch })
            : { ...s, ...patch }
          : s,
      ),
    );
  /** Add a draft's steps after the written ones, and its purpose and prerequisites where empty. */
  const addDraft = (d: ProcedureDraft) => {
    const kept = draft.steps.filter(stepHasContent);
    const added = d.steps
      .slice(0, PROCEDURE_LIMITS.steps - kept.length)
      .map((text) =>
        d.source === "grok" ? { ...newStep(text), aiDrafted: true as const } : newStep(text),
      );
    setDraft((prev) => ({
      ...prev,
      steps: [...kept, ...added],
      purpose: prev.purpose?.trim() ? prev.purpose : d.purpose || prev.purpose,
      prerequisites: [
        ...new Set([
          ...prev.prerequisites.map((p) => p.trim()).filter(Boolean),
          ...d.prerequisites,
        ]),
      ].slice(0, PROCEDURE_LIMITS.prerequisites),
    }));
    if (added[0]) setFocusId(`step-${added[0].id}`);
  };
  const place = places.find((p) => p.id === draft.placeId);
  const today = localDateKey(useToday());
  // Checked as the owner types, so the advice follows the edits.
  const recommendations = useMemo(
    () =>
      procedureRecommendations(draft, {
        place: place ?? null,
        today,
        canAddPictures: pictureAccess.ok,
      }),
    [draft, place, today, pictureAccess.ok],
  );
  const filledSteps = draft.steps.filter(stepHasContent).length;
  const moveStep = (index: number, delta: -1 | 1) => {
    const steps = [...draft.steps];
    const [step] = steps.splice(index, 1);
    steps.splice(index + delta, 0, step);
    set("steps", steps);
    setFocusId(`step-${step.id}-${delta < 0 ? "up" : "down"}`);
  };
  const removeStep = (index: number) => {
    const steps = draft.steps.filter((_, i) => i !== index);
    set("steps", steps);
    // Focus the step that took its place, or the one before it, or "Add step".
    const next = steps[index] ?? steps[index - 1];
    setFocusId(next ? `step-${next.id}` : "procedure-add-step");
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
      setError(TITLE_NEEDED);
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
        .filter(stepHasContent),
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
          one action per step. Changing the steps clears the verification until the reviewer
          verifies them again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <label className={labelCls}>
          Title
          <input
            className={inputCls}
            value={draft.title}
            maxLength={PROCEDURE_LIMITS.title}
            placeholder="For example: Reconcile the checking account"
            onChange={(e) => {
              set("title", e.target.value);
              if (error === TITLE_NEEDED && e.target.value.trim()) setError(null);
            }}
          />
        </label>

        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            Where to do it
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
              placeholder="For example: Banking › Reconcile"
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
              placeholder="For example: When the bank statement arrives, by the 5th"
              onChange={(e) => set("trigger", e.target.value)}
            />
          </label>
        </div>

        <label className={labelCls}>
          What you need first, one per line (name the sign-in or key, never the password)
          <textarea
            className={inputCls}
            rows={2}
            value={draft.prerequisites.join("\n")}
            placeholder={"Bookkeeper sign-in to QuickBooks Online\nLast month's bank statement"}
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
            <p className="text-xs text-muted">
              No steps yet. Add the first one below, or draft them from notes.
            </p>
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
                    {step.aiDrafted && (
                      <p className="text-xs text-accent">
                        Drafted by Grok. Compare it with the screen or the place, then edit it or
                        verify the procedure.
                      </p>
                    )}
                    {step.suggested && !step.aiDrafted && (
                      <p className="text-xs text-accent">
                        Suggested common practice. Change it to match your own screens, names and
                        people, then verify the procedure.
                      </p>
                    )}
                    <textarea
                      id={`step-${step.id}`}
                      className={inputCls}
                      rows={2}
                      value={step.text}
                      maxLength={PROCEDURE_LIMITS.stepText}
                      placeholder="For example: Open Banking and choose the checking account."
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
                      id={`step-${step.id}-up`}
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
                      id={`step-${step.id}-down`}
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
                      onClick={() => removeStep(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-start gap-2">
            <Button
              id="procedure-add-step"
              size="sm"
              variant="outline"
              disabled={draft.steps.length >= PROCEDURE_LIMITS.steps}
              onClick={() => {
                const step = newStep();
                set("steps", [...draft.steps, step]);
                setFocusId(`step-${step.id}`);
              }}
            >
              <Plus className="size-3.5" /> Add step
            </Button>
          </div>
          <DraftFromNotes
            title={draft.title}
            placeName={place?.name ?? ""}
            module={draft.module ?? ""}
            industryLabel={industryMeta(draft.industry).label}
            room={PROCEDURE_LIMITS.steps - filledSteps}
            onAdd={addDraft}
          />
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
            Reviewer (verifies that the steps still work)
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
            Verify it every (days)
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
        {initial.verifiedAt && draft.reviewEveryDays > initial.reviewEveryDays && (
          <p className="text-xs text-muted">
            A longer interval needs a new check: when you save, Precog clears the verification, and
            the reviewer verifies the steps again.
          </p>
        )}
        {draft.reviewerPersonId && draft.reviewerPersonId === draft.ownerPersonId && (
          <p className="text-xs text-muted">
            The person who does the task is also its reviewer. A different reviewer finds the steps
            the author skips without noticing.
          </p>
        )}

        <fieldset>
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            Stand-ins (who cover it when the usual person is out)
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

        <DutiesField
          draft={draft}
          onChange={(dutyIds) => set("dutyIds", dutyIds.length ? dutyIds : undefined)}
        />

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

        <BestPracticeCheck recommendations={recommendations} />

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

/**
 * The duties following this procedure exercises, with the usual person's
 * duties listed first, and a warning for each named backup who would then
 * hold two duties that should be kept apart.
 */
function DutiesField({
  draft,
  onChange,
}: {
  draft: Procedure;
  onChange: (next: EntitlementId[]) => void;
}) {
  const tpl = useTemplate();
  const { profile } = usePractice();
  const selected = draft.dutyIds ?? [];
  const owner = tpl.people.find((p) => p.id === draft.ownerPersonId);
  const ownerDuties = new Set<string>(owner ? personDuties(owner, tpl.roleTemplates) : []);
  const choices = ENTITLEMENTS.filter((e) => e.id !== "view_reports_only").sort(
    (a, b) => Number(ownerDuties.has(b.id)) - Number(ownerDuties.has(a.id)),
  );
  const warnings = draft.backupPersonIds
    .map((id) => ({
      name: tpl.people.find((p) => p.id === id)?.name ?? "A stand-in",
      conflicts: procedureDutyConflicts(tpl, profile.dualRelease, draft, id, profile.staff),
    }))
    .filter((w) => w.conflicts.length > 0);
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
        Duties someone exercises by following it
      </legend>
      <p className="text-xs text-muted">
        Tick what a person does by following these steps
        {owner ? `; ${owner.name}'s duties come first` : ""}. Below, the editor warns about any
        stand-in who would then hold two conflicting duties.
      </p>
      <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
        {choices.map((e) => (
          <label key={e.id} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={selected.includes(e.id)}
              onChange={(ev) =>
                onChange(
                  ev.target.checked
                    ? [...selected, e.id].slice(0, PROCEDURE_LIMITS.duties)
                    : selected.filter((id) => id !== e.id),
                )
              }
            />
            {e.label}
          </label>
        ))}
      </div>
      {warnings.map((w) => (
        <DutyConflictNote key={w.name} name={w.name} conflicts={w.conflicts} />
      ))}
    </fieldset>
  );
}
