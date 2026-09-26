import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";
import { Lock, UserCheck } from "lucide-react";
import type { ReleaseChannel } from "@/lib/precog/controls/dual-release";
import { DUAL_RELEASE_CHANNELS } from "@/components/precog/dual-release-constants";
import { DualReleaseEvalResult } from "@/components/precog/dual-release-parts";
import type { DualReleasePanelModel } from "@/components/precog/use-dual-release-panel";

export function DualReleaseSimulatorCard({ model }: { model: DualReleasePanelModel }) {
  const {
    people,
    policy,
    payeeHint,
    channel,
    setChannel,
    payee,
    setPayee,
    amount,
    setAmount,
    initiatorId,
    setInitiatorId,
    secondId,
    setSecondId,
    activeRule,
    secondsLine,
    runEval,
    lastEval,
  } = model;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="size-4" />
          Release simulator
        </CardTitle>
        <CardDescription>
          {payeeHint
            ? `Includes payee matching for exceptions (try “${payeeHint}”)`
            : "Includes payee matching for any exception you add below"}
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
            {DUAL_RELEASE_CHANNELS.map((ch) => (
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
          <p className="text-xs text-subtle">
            Base dual above {formatUsd(activeRule.thresholdUsd)}. Seconds: {secondsLine}.
          </p>
        )}
        <Button size="sm" onClick={runEval}>
          <UserCheck className="size-3.5" />
          Evaluate release
        </Button>

        {lastEval && <DualReleaseEvalResult eval={lastEval} />}
      </CardContent>
    </Card>
  );
}
