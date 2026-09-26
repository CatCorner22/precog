import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import {
  DualReleaseChannelsSection,
  DualReleasePolicyOptionsCard,
} from "@/components/precog/dual-release-channels-section";
import { DualReleaseExceptionsCard } from "@/components/precog/dual-release-exceptions-card";
import { DualReleaseMiniStat } from "@/components/precog/dual-release-parts";
import { DualReleaseSimulatorCard } from "@/components/precog/dual-release-simulator-card";
import { useDualReleasePanel } from "@/components/precog/use-dual-release-panel";

export function DualReleasePanel({ onOpenSod }: { onOpenSod?: () => void }) {
  const model = useDualReleasePanel();
  const { policy, exSummary, toggleMaster, logAsRemediation } = model;

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
          Base thresholds plus <strong className="text-fg">exceptions</strong> for trusted payees,
          temporary raises, force-dual bands, or rare waives. Exceptions are time-bound,
          reason-coded, and feed the decision journal.
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
        <DualReleaseMiniStat label="Raises" value={String(exSummary.raises)} tone="primary" />
        <DualReleaseMiniStat label="Force dual" value={String(exSummary.forceDual)} tone="warn" />
        <DualReleaseMiniStat label="Waives" value={String(exSummary.waives)} tone="danger" />
        <DualReleaseMiniStat
          label="Expiring soon"
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
