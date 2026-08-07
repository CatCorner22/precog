import { useMemo, useState } from "react";
import { people } from "@/lib/precog/demo-data";
import {
  dualReleaseCoverage,
  evaluateRelease,
  listEligibleApprovers,
  type ReleaseChannel,
  type ReleaseEvaluation,
} from "@/lib/precog/controls/dual-release";
import { usePractice } from "@/lib/precog/practice-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatUsd } from "@/lib/utils";
import {
  CheckCircle2,
  Lock,
  ShieldCheck,
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

export function DualReleasePanel({
  onOpenSod,
}: {
  onOpenSod?: () => void;
}) {
  const { profile, setDualRelease, setStaff, addDecision } = usePractice();
  const policy = profile.dualRelease;

  const [channel, setChannel] = useState<ReleaseChannel>("ach");
  const [amount, setAmount] = useState(2500);
  const [initiatorId, setInitiatorId] = useState("p2"); // Maya OM
  const [secondId, setSecondId] = useState<string>("p1"); // Owner
  const [lastEval, setLastEval] = useState<ReleaseEvaluation | null>(null);

  const coverage = useMemo(() => dualReleaseCoverage(policy), [policy]);
  const eligible = useMemo(
    () => listEligibleApprovers(policy, channel),
    [policy, channel],
  );

  const activeRule = policy.rules.find((r) => r.channel === channel);

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
      memo: "Simulator release",
    });
    setLastEval(result);
  }

  function logAsRemediation() {
    addDecision({
      subject: "Enable dual-release controls",
      kind: "remediate",
      note: `Dual release ${policy.enabled ? "ON" : "OFF"}; channels: ${coverage
        .filter((c) => c.covered)
        .map((c) => c.label)
        .join(", ")}`,
      reviewBy: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
      linkedTab: "sod",
    });
  }

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Dual release</Badge>
          <Badge variant={policy.enabled ? "ok" : "danger"}>
            {policy.enabled ? "Policy ON" : "Policy OFF"}
          </Badge>
        </div>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <ShieldCheck className="size-5 text-primary" />
          Dual-release controls
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Two distinct people must complete high-risk money moves. Configure thresholds, simulate
          a release, and feed mitigation into SoD conflict scores and insurance dual-control
          credit.
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {coverage.map((c) => (
          <Card key={c.channel} className={cn(!c.covered && "opacity-70")}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm">{c.label}</CardTitle>
                <Badge variant={c.covered ? "ok" : "default"}>
                  {c.covered ? "active" : "off"}
                </Badge>
              </div>
              <CardDescription>
                Threshold {formatUsd(c.thresholdUsd)}
                {c.thresholdUsd === 0 ? " (always dual)" : "+"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={policy.rules.find((r) => r.channel === c.channel)?.enabled ?? false}
                  disabled={!policy.enabled}
                  onChange={(e) => toggleChannel(c.channel, e.target.checked)}
                  className="size-3.5 accent-[var(--color-primary)]"
                />
                Channel enabled
              </label>
              <label className="block text-xs text-muted">
                Threshold (USD)
                <input
                  type="number"
                  min={0}
                  step={50}
                  disabled={!policy.enabled}
                  value={policy.rules.find((r) => r.channel === c.channel)?.thresholdUsd ?? 0}
                  onChange={(e) =>
                    setThreshold(c.channel, Number(e.target.value) || 0)
                  }
                  className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1 text-sm text-fg"
                />
              </label>
              <p className="text-[10px] text-subtle">
                Mitigates: {c.mitigatesRuleIds.join(", ") || "—"}
              </p>
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
              When dual release is ON, practice dual-control flag and insurance discount
              eligibility update automatically. SoD conflicts on mitigated rule IDs drop in
              score and show a mitigation badge.
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
              Test whether a payment / write-off / deposit would clear
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
                Rule: dual above {formatUsd(activeRule.thresholdUsd)}. Seconds:{" "}
                {activeRule.secondApproverRoles.join(", ")}.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={runEval}>
                <UserCheck className="size-3.5" />
                Evaluate release
              </Button>
            </div>

            {lastEval && <EvalResult eval={lastEval} eligible={eligible} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EvalResult({
  eval: result,
  eligible,
}: {
  eval: ReleaseEvaluation;
  eligible: ReturnType<typeof listEligibleApprovers>;
}) {
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
          {formatUsd(result.amountUsd)} · threshold {formatUsd(result.thresholdUsd)}
        </span>
      </div>
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
      {result.eligibleSeconds.length > 0 && (
        <p className="mt-2 text-[11px] text-subtle">
          Eligible seconds:{" "}
          {result.eligibleSeconds.map((p) => p.name).join(", ") ||
            eligible
              .filter((p) => p.canSecond)
              .map((p) => p.name)
              .join(", ")}
        </p>
      )}
      <p className="mt-2 text-[11px] text-subtle">{result.controlCredit.note}</p>
    </div>
  );
}
