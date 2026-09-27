import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo } from "react";
import { defaultDualReleasePolicy } from "@/lib/precog/controls/dual-release";
import { cn, formatUsd } from "@/lib/utils";
import type { DualReleasePanelModel } from "@/components/precog/use-dual-release-panel";

export function DualReleaseChannelsSection({ model }: { model: DualReleasePanelModel }) {
  const { tpl, policy, coverage, toggleChannel, setThreshold } = model;
  // The app's starting amount per channel: a threshold still equal to it is
  // marked, so the owner can tell an amount they chose from one the app chose.
  const appDefault = useMemo(
    () => new Map(defaultDualReleasePolicy(tpl).rules.map((r) => [r.channel, r.thresholdUsd])),
    [tpl],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {coverage.map((c) => (
        <Card key={c.channel} className={cn(!c.covered && "opacity-70")}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm">{c.label}</CardTitle>
              <div className="flex gap-1">
                {c.activeExceptions > 0 && (
                  <Badge variant="warn">
                    {c.activeExceptions} exception{c.activeExceptions === 1 ? "" : "s"}
                  </Badge>
                )}
                <Badge variant={c.covered ? "ok" : "default"}>{c.covered ? "On" : "Off"}</Badge>
              </div>
            </div>
            <CardDescription>
              {c.thresholdUsd === 0
                ? "Two people on every amount"
                : `Two people above ${formatUsd(c.thresholdUsd)}`}
              {appDefault.get(c.channel) === c.thresholdUsd && (
                <span className="text-subtle"> · app default, change it below</span>
              )}
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
              Channel on
            </label>
            <label className="block text-xs text-muted">
              Two people above this amount (USD)
              <input
                type="number"
                min={0}
                step={50}
                disabled={!policy.enabled}
                value={policy.rules.find((r) => r.channel === c.channel)?.thresholdUsd ?? 0}
                onChange={(e) => setThreshold(c.channel, Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-border bg-elevated px-2 py-1 text-sm text-fg"
              />
            </label>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DualReleasePolicyOptionsCard({ model }: { model: DualReleasePanelModel }) {
  const { policy, setPolicyOption } = model;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Policy options</CardTitle>
        <CardDescription>Who may sign second, and what happens when nobody does</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={policy.ownerCanSecondAny}
            onChange={(e) => setPolicyOption({ ownerCanSecondAny: e.target.checked })}
            className="size-4 accent-[var(--color-primary)]"
          />
          Owner may second-sign any channel
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={policy.hardBlockWithoutSecond}
            onChange={(e) => setPolicyOption({ hardBlockWithoutSecond: e.target.checked })}
            className="size-4 accent-[var(--color-primary)]"
          />
          Stop the payment when the second signer is missing
        </label>
        <p className="rounded-lg border border-border bg-panel p-3 text-xs text-muted">
          Every exception stays visible: the simulator shows the channel&apos;s threshold next to
          the one the exception sets, with the risk you keep. An active waiver shows here and in
          every check. Whether it changes your premium depends on what your policy requires you to
          have in place; ask your broker.
        </p>
      </CardContent>
    </Card>
  );
}
