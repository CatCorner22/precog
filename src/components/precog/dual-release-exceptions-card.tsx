import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatUsd } from "@/lib/utils";
import { Clock, Plus, Trash2 } from "lucide-react";
import { formatDay } from "@/lib/precog/dates";
import type { ExceptionAction, ThresholdException } from "@/lib/precog/controls/dual-release";
import {
  EXCEPTION_ACTION_LABELS,
  exceptionActionLabel,
} from "@/components/precog/dual-release-constants";
import type { DualReleasePanelModel } from "@/components/precog/use-dual-release-panel";

export function DualReleaseExceptionsCard({ model }: { model: DualReleasePanelModel }) {
  const {
    people,
    policy,
    seed,
    showExForm,
    setShowExForm,
    exForm,
    updateExForm,
    exceptions,
    toggleExChannel,
    addException,
    toggleException,
    removeException,
  } = model;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-primary" />
              Threshold exceptions
            </CardTitle>
            <CardDescription>
              When several exceptions match, the most specific applies: a named payee beats a named
              person, then a role, then an amount band, then a channel.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowExForm((v) => !v)}>
            <Plus className="size-3.5" />
            {showExForm ? "Cancel" : "Add exception"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showExForm && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs text-muted sm:col-span-2">
                Label
                <input
                  value={exForm.label}
                  onChange={(e) => updateExForm({ label: e.target.value })}
                  placeholder="For example: Trusted lab ACH raise"
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted">
                Action
                <select
                  value={exForm.action}
                  onChange={(e) => updateExForm({ action: e.target.value as ExceptionAction })}
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                >
                  {EXCEPTION_ACTION_LABELS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <span className="mt-0.5 block text-xs text-subtle">
                  {EXCEPTION_ACTION_LABELS.find((a) => a.id === exForm.action)?.hint}
                </span>
              </label>
              {(exForm.action === "raise_threshold" || exForm.action === "lower_threshold") && (
                <label className="block text-xs text-muted">
                  Exception threshold (USD)
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={exForm.thresholdUsd}
                    onChange={(e) => updateExForm({ thresholdUsd: Number(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                  />
                </label>
              )}
              <label className="block text-xs text-muted sm:col-span-2">
                Payee contains (optional)
                <input
                  value={exForm.payee}
                  onChange={(e) => updateExForm({ payee: e.target.value })}
                  placeholder={seed.defaultPayee}
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted">
                Person (optional)
                <select
                  value={exForm.personId}
                  onChange={(e) => updateExForm({ personId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                >
                  <option value="">— any —</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-muted">
                Role (optional)
                <select
                  value={exForm.role}
                  onChange={(e) => updateExForm({ role: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                >
                  <option value="">— any —</option>
                  {[...new Set(people.map((p) => p.role))].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-muted">
                Effective from
                <input
                  type="date"
                  value={exForm.from}
                  onChange={(e) => updateExForm({ from: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted">
                Effective to
                <input
                  type="date"
                  value={exForm.to}
                  onChange={(e) => updateExForm({ to: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted">
                Amount from (optional)
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={exForm.amountMin}
                  onChange={(e) => updateExForm({ amountMin: e.target.value })}
                  placeholder="Any amount"
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted">
                Amount to (optional)
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={exForm.amountMax}
                  onChange={(e) => updateExForm({ amountMax: e.target.value })}
                  placeholder="Any amount"
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted sm:col-span-2">
                Reason (required)
                <input
                  value={exForm.reason}
                  onChange={(e) => updateExForm({ reason: e.target.value })}
                  placeholder="Why is this exception justified?"
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted sm:col-span-2">
                Risk you keep (optional)
                <input
                  value={exForm.residual}
                  onChange={(e) => updateExForm({ residual: e.target.value })}
                  placeholder="How you will watch the payments this exception lets through"
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
            </div>
            <div>
              <p id="exception-channels" className="mb-1 text-xs text-muted">
                Channels (none chosen means all)
              </p>
              <div
                role="group"
                aria-labelledby="exception-channels"
                className="flex flex-wrap gap-1.5"
              >
                {policy.rules.map((rule) => (
                  <button
                    key={rule.channel}
                    type="button"
                    aria-pressed={exForm.channels.includes(rule.channel)}
                    onClick={() => toggleExChannel(rule.channel)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs",
                      exForm.channels.includes(rule.channel)
                        ? "border-primary/40 bg-primary/10 text-fg"
                        : "border-border bg-elevated text-muted",
                    )}
                  >
                    {rule.label}
                  </button>
                ))}
              </div>
            </div>
            <Button
              size="sm"
              onClick={addException}
              disabled={!exForm.label.trim() || !exForm.reason.trim()}
            >
              Save exception
            </Button>
          </div>
        )}

        {exceptions.length === 0 && <p className="text-sm text-muted">No exceptions configured.</p>}
        {exceptions.map((ex) => (
          <div
            key={ex.id}
            className={cn(
              "rounded-xl border px-3 py-3 text-sm",
              ex.enabled ? "border-border bg-elevated" : "border-border/60 bg-panel opacity-70",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{ex.label}</span>
                  {ex.sample && <Badge variant="default">Sample</Badge>}
                  <Badge
                    variant={
                      ex.action === "waive_dual"
                        ? "danger"
                        : ex.action === "force_dual"
                          ? "warn"
                          : "primary"
                    }
                  >
                    {exceptionActionLabel(ex.action)}
                  </Badge>
                  {!ex.enabled && <Badge variant="default">Off</Badge>}
                  {ex.thresholdUsd != null && (
                    <Badge variant="default">{formatUsd(ex.thresholdUsd)}</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">{ex.reason}</p>
                <p className="mt-1 text-xs text-subtle">{exceptionScope(ex, model)}</p>
                {ex.residualNote && (
                  <p className="mt-1 text-xs text-warn">Risk kept: {ex.residualNote}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => toggleException(ex.id, !ex.enabled)}
                >
                  {ex.enabled ? "Disable" : "Enable"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-danger"
                  onClick={() => {
                    if (
                      window.confirm(`Delete the exception "${ex.label}"? You cannot undo this.`)
                    ) {
                      removeException(ex.id);
                    }
                  }}
                  aria-label={`Delete the exception ${ex.label}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Where an exception applies: "ACH payments · payee contains "northgate" · Maya Chen · $1 to $499". */
function exceptionScope(
  ex: ThresholdException,
  { policy, tpl }: Pick<DualReleasePanelModel, "policy" | "tpl">,
): string {
  const channelLabel = (channel: string) =>
    policy.rules.find((rule) => rule.channel === channel)?.label ?? channel;
  const parts = [ex.channels.length ? ex.channels.map(channelLabel).join(", ") : "All channels"];
  if (ex.payeeContains) parts.push(`payee contains "${ex.payeeContains}"`);
  if (ex.personId) {
    parts.push(
      tpl.people.find((p) => p.id === ex.personId)?.name ?? "a person no longer on the team",
    );
  }
  if (ex.role) parts.push(`role ${ex.role}`);
  if (ex.amountMinUsd !== undefined || ex.amountMaxUsd !== undefined) {
    parts.push(
      `${ex.amountMinUsd !== undefined ? formatUsd(ex.amountMinUsd) : "any amount"} to ${
        ex.amountMaxUsd !== undefined ? formatUsd(ex.amountMaxUsd) : "any amount"
      }`,
    );
  }
  if (ex.effectiveFrom || ex.effectiveTo) {
    parts.push(
      `${ex.effectiveFrom ? formatDay(ex.effectiveFrom) : "now"} to ${
        ex.effectiveTo ? formatDay(ex.effectiveTo) : "no end date"
      }`,
    );
  }
  return parts.join(" · ");
}
