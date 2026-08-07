import { useMemo, useState } from "react";
import { people } from "@/lib/precog/demo-data";
import {
  activeExceptionSummary,
  dualReleaseCoverage,
  evaluateRelease,
  listEligibleApprovers,
  makeExceptionId,
  type ExceptionAction,
  type ReleaseChannel,
  type ReleaseEvaluation,
  type ThresholdException,
} from "@/lib/precog/controls/dual-release";
import { usePractice } from "@/lib/precog/practice-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatUsd } from "@/lib/utils";
import {
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  XCircle,
} from "lucide-react";

const CHANNELS: ReleaseChannel[] = [
  "ach",
  "check",
  "writeoff",
  "vendor_new",
  "deposit",
  "payroll",
];

const ACTIONS: { id: ExceptionAction; label: string; hint: string }[] = [
  {
    id: "raise_threshold",
    label: "Raise threshold",
    hint: "Allow single release up to a higher amount",
  },
  {
    id: "lower_threshold",
    label: "Lower threshold",
    hint: "Stricter — dual required sooner",
  },
  {
    id: "force_dual",
    label: "Force dual",
    hint: "Always require two signers when match",
  },
  {
    id: "waive_dual",
    label: "Waive dual",
    hint: "Skip dual (logs residual — use sparingly)",
  },
];

export function DualReleasePanel({
  onOpenSod,
}: {
  onOpenSod?: () => void;
}) {
  const { profile, setDualRelease, setStaff, addDecision } = usePractice();
  const policy = profile.dualRelease;

  const [channel, setChannel] = useState<ReleaseChannel>("ach");
  const [amount, setAmount] = useState(2500);
  const [initiatorId, setInitiatorId] = useState("p2");
  const [secondId, setSecondId] = useState<string>("p1");
  const [payee, setPayee] = useState("Apex Dental Lab");
  const [lastEval, setLastEval] = useState<ReleaseEvaluation | null>(null);
  const [showExForm, setShowExForm] = useState(false);

  // New exception form state
  const [exLabel, setExLabel] = useState("");
  const [exAction, setExAction] = useState<ExceptionAction>("raise_threshold");
  const [exThreshold, setExThreshold] = useState(3500);
  const [exChannels, setExChannels] = useState<ReleaseChannel[]>(["ach"]);
  const [exPayee, setExPayee] = useState("");
  const [exPersonId, setExPersonId] = useState("");
  const [exRole, setExRole] = useState("");
  const [exFrom, setExFrom] = useState("");
  const [exTo, setExTo] = useState("");
  const [exReason, setExReason] = useState("");
  const [exResidual, setExResidual] = useState("");

  const coverage = useMemo(() => dualReleaseCoverage(policy), [policy]);
  const eligible = useMemo(
    () => listEligibleApprovers(policy, channel),
    [policy, channel],
  );
  const exSummary = useMemo(() => activeExceptionSummary(policy), [policy]);
  const activeRule = policy.rules.find((r) => r.channel === channel);
  const exceptions = policy.exceptions ?? [];

  function toggleMaster(enabled: boolean) {
    setDualRelease({ ...policy, enabled });
    setStaff({ ...profile.staff, dualControlPayments: enabled });
  }

  function toggleChannel(ch: ReleaseChannel, enabled: boolean) {
    setDualRelease({
      ...policy,
      rules: policy.rules.map((r) =>
        r.channel === ch ? { ...r, enabled } : r,
      ),
    });
  }

  function setThreshold(ch: ReleaseChannel, thresholdUsd: number) {
    setDualRelease({
      ...policy,
      rules: policy.rules.map((r) =>
        r.channel === ch
          ? { ...r, thresholdUsd: Math.max(0, Math.round(thresholdUsd)) }
          : r,
      ),
    });
  }

  function runEval() {
    const result = evaluateRelease(policy, {
      channel,
      amountUsd: amount,
      initiatorPersonId: initiatorId,
      secondPersonId: secondId || undefined,
      payee,
      memo: "Simulator release",
    });
    setLastEval(result);
  }

  function upsertException(ex: ThresholdException) {
    const list = exceptions.filter((e) => e.id !== ex.id);
    setDualRelease({ ...policy, exceptions: [ex, ...list] });
  }

  function removeException(id: string) {
    setDualRelease({
      ...policy,
      exceptions: exceptions.filter((e) => e.id !== id),
    });
  }

  function toggleException(id: string, enabled: boolean) {
    setDualRelease({
      ...policy,
      exceptions: exceptions.map((e) =>
        e.id === id ? { ...e, enabled } : e,
      ),
    });
  }

  function addException() {
    if (!exLabel.trim() || !exReason.trim()) return;
    const ex: ThresholdException = {
      id: makeExceptionId(),
      label: exLabel.trim().slice(0, 80),
      channels: exChannels,
      action: exAction,
      thresholdUsd:
        exAction === "raise_threshold" || exAction === "lower_threshold"
          ? Math.max(0, Math.round(exThreshold))
          : undefined,
      payeeContains: exPayee.trim() || undefined,
      personId: exPersonId || undefined,
      role: exRole || undefined,
      effectiveFrom: exFrom || undefined,
      effectiveTo: exTo || undefined,
      enabled: true,
      reason: exReason.trim().slice(0, 300),
      residualNote: exResidual.trim().slice(0, 300) || undefined,
      approvedByPersonId: "p1",
      createdAt: new Date().toISOString().slice(0, 10),
    };
    upsertException(ex);
    addDecision({
      subject: `Threshold exception: ${ex.label}`,
      kind: ex.action === "waive_dual" ? "accept_residual" : "remediate",
      note: `${ex.action} · ${ex.reason}${ex.residualNote ? ` · Residual: ${ex.residualNote}` : ""}`,
      reviewBy: ex.effectiveTo || undefined,
      linkedTab: "sod",
    });
    setShowExForm(false);
    setExLabel("");
    setExReason("");
    setExResidual("");
    setExPayee("");
  }

  function logAsRemediation() {
    addDecision({
      subject: "Enable dual-release controls",
      kind: "remediate",
      note: `Dual release ${policy.enabled ? "ON" : "OFF"}; ${exSummary.total} active exception(s); channels: ${coverage
        .filter((c) => c.covered)
        .map((c) => c.label)
        .join(", ")}`,
      reviewBy: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
      linkedTab: "sod",
    });
  }

  function toggleExChannel(ch: ReleaseChannel) {
    setExChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  }

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Dual release</Badge>
          <Badge variant={policy.enabled ? "ok" : "danger"}>
            {policy.enabled ? "Policy ON" : "Policy OFF"}
          </Badge>
          <Badge variant="default">
            {exSummary.total} active exception{exSummary.total === 1 ? "" : "s"}
          </Badge>
          {exSummary.expiringSoon > 0 && (
            <Badge variant="warn">{exSummary.expiringSoon} expiring ≤30d</Badge>
          )}
        </div>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <ShieldCheck className="size-5 text-primary" />
          Dual-release controls
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Base thresholds plus <strong className="text-fg">exceptions</strong> for trusted
          payees, temporary raises, force-dual bands, or rare waives. Exceptions are
          time-bound, reason-coded, and feed the decision journal.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={policy.enabled ? "default" : "secondary"}
            onClick={() => toggleMaster(!policy.enabled)}
          >
            {policy.enabled ? "Disable dual release" : "Enable dual release"}
          </Button>
          <Button size="sm" variant="secondary" onClick={logAsRemediation}>
            Log in decision journal
          </Button>
          {onOpenSod && (
            <Button size="sm" variant="outline" onClick={onOpenSod}>
              View SoD impact
            </Button>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Raises" value={String(exSummary.raises)} tone="primary" />
        <MiniStat label="Force dual" value={String(exSummary.forceDual)} tone="warn" />
        <MiniStat label="Waives" value={String(exSummary.waives)} tone="danger" />
        <MiniStat
          label="Expiring soon"
          value={String(exSummary.expiringSoon)}
          tone={exSummary.expiringSoon ? "warn" : "ok"}
        />
      </div>

      {/* Threshold exceptions */}
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
                    {ACTIONS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <span className="mt-0.5 block text-[10px] text-subtle">
                    {ACTIONS.find((a) => a.id === exAction)?.hint}
                  </span>
                </label>
                {(exAction === "raise_threshold" ||
                  exAction === "lower_threshold") && (
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
                    placeholder="Apex Dental Lab"
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
                  {CHANNELS.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => toggleExChannel(ch)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[11px]",
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
              <Button
                size="sm"
                onClick={addException}
                disabled={!exLabel.trim() || !exReason.trim()}
              >
                Save exception
              </Button>
            </div>
          )}

          {exceptions.length === 0 && (
            <p className="text-sm text-muted">No exceptions configured.</p>
          )}
          {exceptions.map((ex) => (
            <div
              key={ex.id}
              className={cn(
                "rounded-xl border px-3 py-3 text-sm",
                ex.enabled
                  ? "border-border bg-elevated"
                  : "border-border/60 bg-panel opacity-70",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{ex.label}</span>
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
                  <p className="mt-1 text-[11px] text-subtle">
                    {ex.channels.length
                      ? ex.channels.join(", ")
                      : "all channels"}
                    {ex.payeeContains ? ` · payee ~"${ex.payeeContains}"` : ""}
                    {ex.personId
                      ? ` · person ${people.find((p) => p.id === ex.personId)?.name ?? ex.personId}`
                      : ""}
                    {ex.role ? ` · role ${ex.role}` : ""}
                    {ex.effectiveFrom || ex.effectiveTo
                      ? ` · ${ex.effectiveFrom ?? "…"} → ${ex.effectiveTo ?? "…"}`
                      : ""}
                  </p>
                  {ex.residualNote && (
                    <p className="mt-1 text-[11px] text-warn">Residual: {ex.residualNote}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {coverage.map((c) => (
          <Card key={c.channel} className={cn(!c.covered && "opacity-70")}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm">{c.label}</CardTitle>
                <div className="flex gap-1">
                  {c.activeExceptions > 0 && (
                    <Badge variant="warn">{c.activeExceptions} ex</Badge>
                  )}
                  <Badge variant={c.covered ? "ok" : "default"}>
                    {c.covered ? "active" : "off"}
                  </Badge>
                </div>
              </div>
              <CardDescription>
                Base {formatUsd(c.thresholdUsd)}
                {c.thresholdUsd === 0 ? " (always dual)" : "+"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={
                    policy.rules.find((r) => r.channel === c.channel)?.enabled ?? false
                  }
                  disabled={!policy.enabled}
                  onChange={(e) => toggleChannel(c.channel, e.target.checked)}
                  className="size-3.5 accent-[var(--color-primary)]"
                />
                Channel enabled
              </label>
              <label className="block text-xs text-muted">
                Base threshold (USD)
                <input
                  type="number"
                  min={0}
                  step={50}
                  disabled={!policy.enabled}
                  value={
                    policy.rules.find((r) => r.channel === c.channel)?.thresholdUsd ?? 0
                  }
                  onChange={(e) =>
                    setThreshold(c.channel, Number(e.target.value) || 0)
                  }
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1 text-sm text-fg"
                />
              </label>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Policy options</CardTitle>
            <CardDescription>How hard the gate is</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={policy.ownerCanSecondAny}
                onChange={(e) =>
                  setDualRelease({
                    ...policy,
                    ownerCanSecondAny: e.target.checked,
                  })
                }
                className="size-4 accent-[var(--color-primary)]"
              />
              Owner may second-sign any channel
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={policy.hardBlockWithoutSecond}
                onChange={(e) =>
                  setDualRelease({
                    ...policy,
                    hardBlockWithoutSecond: e.target.checked,
                  })
                }
                className="size-4 accent-[var(--color-primary)]"
              />
              Hard-block release if second signer missing
            </label>
            <p className="rounded-lg border border-border bg-panel p-3 text-xs text-muted">
              Exceptions never hide themselves: the simulator shows base vs effective
              threshold and residual notes. Active dual-waives reduce insurance dual-control
              credit eligibility.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="size-4" />
              Release simulator
            </CardTitle>
            <CardDescription>
              Includes payee matching for exceptions (try “Apex Dental Lab”)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block text-xs text-muted">
              Channel
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as ReleaseChannel)}
                className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
              >
                {CHANNELS.map((ch) => (
                  <option key={ch} value={ch}>
                    {policy.rules.find((r) => r.channel === ch)?.label ?? ch}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted">
              Payee
              <input
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
              />
            </label>
            <label className="block text-xs text-muted">
              Amount (USD)
              <input
                type="number"
                min={0}
                step={50}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs text-muted">
                First signer
                <select
                  value={initiatorId}
                  onChange={(e) => setInitiatorId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-muted">
                Second signer
                <select
                  value={secondId}
                  onChange={(e) => setSecondId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg"
                >
                  <option value="">— none —</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.role}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {activeRule && (
              <p className="text-[11px] text-subtle">
                Base dual above {formatUsd(activeRule.thresholdUsd)}. Seconds:{" "}
                {activeRule.secondApproverRoles.join(", ")}.
              </p>
            )}
            <Button size="sm" onClick={runEval}>
              <UserCheck className="size-3.5" />
              Evaluate release
            </Button>

            {lastEval && <EvalResult eval={lastEval} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "danger" | "warn" | "ok" | "primary";
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <Badge
          variant={
            tone === "danger"
              ? "danger"
              : tone === "warn"
                ? "warn"
                : tone === "ok"
                  ? "ok"
                  : "primary"
          }
        >
          {label}
        </Badge>
        <p className="mt-1 text-xl font-semibold tabular">{value}</p>
      </CardContent>
    </Card>
  );
}

function EvalResult({ eval: result }: { eval: ReleaseEvaluation }) {
  const ok = result.ok;
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3 text-sm",
        ok ? "border-ok/30 bg-ok/5" : "border-danger/30 bg-danger/5",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {ok ? (
          <CheckCircle2 className="size-4 text-ok" />
        ) : (
          <XCircle className="size-4 text-danger" />
        )}
        <Badge variant={ok ? "ok" : "danger"}>{result.status}</Badge>
        <span className="text-xs text-muted">
          {formatUsd(result.amountUsd)} · effective {formatUsd(result.thresholdUsd === Infinity ? 0 : result.thresholdUsd)}
          {result.baseThresholdUsd !== result.thresholdUsd &&
            result.thresholdUsd !== Infinity && (
              <span className="text-subtle">
                {" "}
                (base {formatUsd(result.baseThresholdUsd)})
              </span>
            )}
        </span>
      </div>
      {result.appliedException && (
        <p className="mt-2 rounded-md border border-warn/30 bg-warn/10 px-2 py-1 text-xs text-fg">
          Exception: <strong>{result.appliedException.label}</strong> (
          {result.appliedException.action.replace("_", " ")})
          {result.appliedException.residualNote
            ? ` — ${result.appliedException.residualNote}`
            : ""}
        </p>
      )}
      <ul className="mt-2 space-y-1 text-xs text-muted">
        {result.reasons.map((r) => (
          <li key={r}>· {r}</li>
        ))}
      </ul>
      {result.nextSteps.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-fg">
          {result.nextSteps.map((r) => (
            <li key={r}>→ {r}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-subtle">{result.controlCredit.note}</p>
    </div>
  );
}
