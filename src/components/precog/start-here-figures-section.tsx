import { MetricCard } from "@/components/precog/home-shell-parts";
import { openConflictBreakdown } from "@/lib/precog/headline/open-conflicts";
import type { NavFn } from "@/lib/precog/navigation";
import type { StartHereModel } from "@/lib/precog/start-here/model";

/**
 * Home's headline figures, at most two: the open duty conflicts and the share
 * of work with a stand-in. Each opens the screen that explains it. The
 * conflict figure counts every open conflict, as the report and the
 * duty-conflict tab do, and its hint gives the parts that add up to it.
 */
export function StartHereFiguresSection({
  model,
  onOpenDetail,
}: {
  model: StartHereModel["figures"];
  onOpenDetail: NavFn;
}) {
  const { open, openCritical, openHigh, openOther, registerReady, coverageIndex } = model;
  return (
    <section aria-label="Headline figures" className="grid gap-3 sm:grid-cols-2">
      <MetricCard
        label="Open duty conflicts"
        value={String(open)}
        hint={openConflictBreakdown({ critical: openCritical, high: openHigh, other: openOther })}
        tone={openCritical > 0 ? "danger" : open > 0 ? "warn" : "primary"}
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
