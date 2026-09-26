import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatUsd } from "@/lib/utils";
import { Clock, Plus, Trash2 } from "lucide-react";
import type { ExceptionAction } from "@/lib/precog/controls/dual-release";
import {
  DUAL_RELEASE_CHANNELS,
  EXCEPTION_ACTIONS,
} from "@/components/precog/dual-release-constants";
import type { DualReleasePanelModel } from "@/components/precog/use-dual-release-panel";

export function DualReleaseExceptionsCard({ model }: { model: DualReleasePanelModel }) {
  const {
    tpl,
    people,
    policy,
    seed,
    showExForm,
    setShowExForm,
    exLabel,
    setExLabel,
    exAction,
    setExAction,
    exThreshold,
    setExThreshold,
    exChannels,
    exPayee,
    setExPayee,
    exPersonId,
    setExPersonId,
    exRole,
    setExRole,
    exFrom,
    setExFrom,
    exTo,
    setExTo,
    exReason,
    setExReason,
    exResidual,
    setExResidual,
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
              Most specific match wins (payee → person → role → amount band → channel)
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
                  value={exLabel}
                  onChange={(e) => setExLabel(e.target.value)}
                  placeholder="e.g. Trusted lab ACH raise"
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted">
                Action
                <select
                  value={exAction}
                  onChange={(e) => setExAction(e.target.value as ExceptionAction)}
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                >
                  {EXCEPTION_ACTIONS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <span className="mt-0.5 block text-xs text-subtle">
                  {EXCEPTION_ACTIONS.find((a) => a.id === exAction)?.hint}
                </span>
              </label>
              {(exAction === "raise_threshold" || exAction === "lower_threshold") && (
                <label className="block text-xs text-muted">
                  Exception threshold (USD)
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={exThreshold}
                    onChange={(e) => setExThreshold(Number(e.target.value) || 0)}
                    className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                  />
                </label>
              )}
              <label className="block text-xs text-muted sm:col-span-2">
                Payee contains (optional)
                <input
                  value={exPayee}
                  onChange={(e) => setExPayee(e.target.value)}
                  placeholder={seed.defaultPayee}
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted">
                Person (optional)
                <select
                  value={exPersonId}
                  onChange={(e) => setExPersonId(e.target.value)}
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
                  value={exRole}
                  onChange={(e) => setExRole(e.target.value)}
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
                  value={exFrom}
                  onChange={(e) => setExFrom(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted">
                Effective to
                <input
                  type="date"
                  value={exTo}
                  onChange={(e) => setExTo(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted sm:col-span-2">
                Reason (required)
                <input
                  value={exReason}
                  onChange={(e) => setExReason(e.target.value)}
                  placeholder="Why is this exception justified?"
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
              <label className="block text-xs text-muted sm:col-span-2">
                Residual note
                <input
                  value={exResidual}
                  onChange={(e) => setExResidual(e.target.value)}
                  placeholder="How residual risk is monitored"
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                />
              </label>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">Channels</p>
              <div className="flex flex-wrap gap-1.5">
                {DUAL_RELEASE_CHANNELS.map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => toggleExChannel(ch)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs",
                      exChannels.includes(ch)
                        ? "border-primary/40 bg-primary/10 text-fg"
                        : "border-border bg-elevated text-muted",
                    )}
                  >
                    {policy.rules.find((r) => r.channel === ch)?.label ?? ch}
                  </button>
                ))}
              </div>
            </div>
            <Button size="sm" onClick={addException} disabled={!exLabel.trim() || !exReason.trim()}>
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
                    {ex.action.replace("_", " ")}
                  </Badge>
                  {!ex.enabled && <Badge variant="default">disabled</Badge>}
                  {ex.thresholdUsd != null && (
                    <Badge variant="default">{formatUsd(ex.thresholdUsd)}</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">{ex.reason}</p>
                <p className="mt-1 text-xs text-subtle">
                  {ex.channels.length ? ex.channels.join(", ") : "all channels"}
                  {ex.payeeContains ? ` · payee ~"${ex.payeeContains}"` : ""}
                  {ex.personId
                    ? ` · person ${tpl.people.find((p) => p.id === ex.personId)?.name ?? ex.personId}`
                    : ""}
                  {ex.role ? ` · role ${ex.role}` : ""}
                  {ex.effectiveFrom || ex.effectiveTo
                    ? ` · ${ex.effectiveFrom ?? "…"} → ${ex.effectiveTo ?? "…"}`
                    : ""}
                </p>
                {ex.residualNote && (
                  <p className="mt-1 text-xs text-warn">Residual: {ex.residualNote}</p>
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
                  onClick={() => removeException(ex.id)}
                  aria-label="Delete exception"
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
