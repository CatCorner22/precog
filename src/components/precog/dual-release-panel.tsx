import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import {
  DualReleaseChannelsSection,
  DualReleasePolicyOptionsCard,
} from "@/components/precog/dual-release-channels-section";
import { DualReleaseExceptionsCard } from "@/components/precog/dual-release-exceptions-card";
import { StatTile } from "@/components/ui/stat-tile";
import { DualReleaseSimulatorCard } from "@/components/precog/dual-release-simulator-card";
import { useDualReleasePanel } from "@/components/precog/use-dual-release-panel";
import { useTabName } from "@/lib/precog/presentation";

export function DualReleasePanel({ onOpenSod }: { onOpenSod?: () => void }) {
  const tabName = useTabName();
  const model = useDualReleasePanel();
  const { policy, exSummary, toggleMaster, logAsRemediation } = model;

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Dual release</Badge>
          <Badge variant={policy.enabled ? "ok" : "danger"}>{policy.enabled ? "On" : "Off"}</Badge>
          <Badge variant="default">
            {exSummary.total} active exception{exSummary.total === 1 ? "" : "s"}
          </Badge>
          {exSummary.expiringSoon > 0 && (
            <Badge variant="warn">{exSummary.expiringSoon} ending within 30 days</Badge>
          )}
        </div>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <ShieldCheck className="size-5 text-primary" />
          Dual-release controls
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Set the amount above which two people must release a payment, per channel.{" "}
          <strong className="text-fg">Exceptions</strong> for trusted payees, temporary raises, or
          rare waivers are dated, carry a reason, and go to the {tabName("journal")}.
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
            Add to the {tabName("journal")}
          </Button>
          {onOpenSod && (
            <Button size="sm" variant="outline" onClick={onOpenSod}>
              See the duty conflicts this narrows
            </Button>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Higher limits" value={String(exSummary.raises)} tone="primary" />
        <StatTile label="Always two signers" value={String(exSummary.forceDual)} tone="warn" />
        <StatTile label="Waivers" value={String(exSummary.waives)} tone="danger" />
        <StatTile
          label="Ending within 30 days"
          value={String(exSummary.expiringSoon)}
          tone={exSummary.expiringSoon ? "warn" : "ok"}
        />
      </div>

      <DualReleaseExceptionsCard model={model} />
      <DualReleaseChannelsSection model={model} />

      <div className="grid gap-4 lg:grid-cols-2">
        <DualReleasePolicyOptionsCard model={model} />
        <DualReleaseSimulatorCard model={model} />
      </div>
    </div>
  );
}
