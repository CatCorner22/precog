import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsdTyped } from "@/lib/utils";
import { Lock, UserCheck } from "lucide-react";
import type { ReleaseChannel } from "@/lib/precog/controls/dual-release";
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
            ? `Try a payment before it happens. Type “${payeeHint}” as the payee to see an exception apply.`
            : "Try a payment before it happens. Exceptions you add above apply here too."}
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
            {policy.rules.map((rule) => (
              <option key={rule.channel} value={rule.channel}>
                {rule.label}
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
              <option value="">Nobody</option>
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
            Every payment above {formatUsdTyped(activeRule.thresholdUsd)} needs two people. Who may
            sign second: {secondsLine}.
          </p>
        )}
        <Button size="sm" onClick={runEval}>
          <UserCheck className="size-3.5" />
          Check this payment
        </Button>

        {lastEval && <DualReleaseEvalResult eval={lastEval} />}
      </CardContent>
    </Card>
  );
}
