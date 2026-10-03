import { MetricCard } from "@/components/precog/home-shell-parts";
import type { NavFn } from "@/lib/precog/navigation";
import type { StartHereModel } from "@/lib/precog/start-here/model";

/**
 * Home's headline figures, at most two: the open duty conflicts and the share
 * of work with a stand-in. Each opens the screen that explains it.
 */
export function StartHereFiguresSection({
  model,
  onOpenDetail,
}: {
  model: StartHereModel["figures"];
  onOpenDetail: NavFn;
}) {
  const { openCritical, openHigh, registerReady, coverageIndex } = model;
  return (
    <section aria-label="Headline figures" className="grid gap-3 sm:grid-cols-2">
      <MetricCard
        label="Open duty conflicts"
        value={String(openCritical + openHigh)}
        hint={`${openCritical} critical · ${openHigh} high`}
        tone={openCritical > 0 ? "danger" : openHigh > 0 ? "warn" : "primary"}
        onClick={() => onOpenDetail("sod")}
      />
      <MetricCard
        label="Has a stand-in"
        value={registerReady ? `${coverageIndex}%` : "—"}
        hint={registerReady ? "work two or more people can run" : "Not assessed yet."}
        tone="primary"
        onClick={() => onOpenDetail("knowledge")}
      />
    </section>
  );
}
