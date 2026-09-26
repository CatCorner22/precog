import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatUsd } from "@/lib/utils";
import type { DualReleasePanelModel } from "@/components/precog/use-dual-release-panel";

export function DualReleaseChannelsSection({ model }: { model: DualReleasePanelModel }) {
  const { policy, coverage, toggleChannel, setThreshold } = model;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {coverage.map((c) => (
        <Card key={c.channel} className={cn(!c.covered && "opacity-70")}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm">{c.label}</CardTitle>
              <div className="flex gap-1">
                {c.activeExceptions > 0 && <Badge variant="warn">{c.activeExceptions} ex</Badge>}
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
                checked={policy.rules.find((r) => r.channel === c.channel)?.enabled ?? false}
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
        <CardDescription>How hard the gate is</CardDescription>
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
          Hard-block release if second signer missing
        </label>
        <p className="rounded-lg border border-border bg-panel p-3 text-xs text-muted">
          Exceptions never hide themselves: the simulator shows base vs effective threshold and
          residual notes. An active dual-waive shows here and in every evaluation; whether it
          affects your premium depends on your carrier's control warranties.
        </p>
      </CardContent>
    </Card>
  );
}
