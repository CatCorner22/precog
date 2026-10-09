import { MetricCard } from "@/components/precog/home-shell-parts";
import { openConflictBreakdown } from "@/lib/precog/headline/open-conflicts";
import type { NavFn } from "@/lib/precog/navigation";
import type { StartHereModel } from "@/lib/precog/start-here/model";

/**
 * Home's open duty-conflict count, and, when asked, the stand-in share.
 * The conflict figure counts every open conflict, as the report and the
 * duty-conflict tab do, and its hint gives the parts that add up to it.
 * The stand-in figure is Precog's own index. Until someone is marked on the
 * register that card is the next step instead of a dash.
 */
export function StartHereFiguresSection({
  model,
  onOpenDetail,
  part,
}: {
  model: StartHereModel["figures"];
  onOpenDetail: NavFn;
  /** "conflicts" is the open count. "standin" is Precog's own coverage index. */
  part?: "conflicts" | "standin";
}) {
  const { open, openCritical, openHigh, openOther, registerReady, coverageIndex } = model;
  const showConflicts = part !== "standin";
  const showStandin = part !== "conflicts";
  return (
    <section
      aria-label={part === "standin" ? "Stand-in figure" : "Headline figures"}
      className={showConflicts && showStandin ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}
    >
      {showConflicts && (
        <MetricCard
          label="Open duty conflicts"
          value={String(open)}
          hint={openConflictBreakdown({ critical: openCritical, high: openHigh, other: openOther })}
          tone={openCritical > 0 ? "danger" : open > 0 ? "warn" : "primary"}
          onClick={() => onOpenDetail("sod")}
        />
      )}
      {showStandin &&
        (registerReady ? (
          <MetricCard
            label="Has a stand-in"
            value={`${coverageIndex}%`}
            hint="work two or more people can run"
            tone="primary"
            onClick={() => onOpenDetail("knowledge")}
          />
        ) : (
          <MetricCard
            label="Next step"
            value="Mark stand-ins"
            hint="About three minutes: who else can run each duty? Then Precog can say what stops when someone is out."
            tone="warn"
            onClick={() => onOpenDetail("knowledge")}
          />
        ))}
    </section>
  );
}
