import { useEffect } from "react";
import { ControlCalendarCard } from "@/components/precog/control-calendar";
import { ControlEvidencePanel } from "@/components/precog/control-evidence/panel";
import { DecisionJournal } from "@/components/precog/decision-journal";
import { MonthlyReview } from "@/components/precog/monthly-review";
import { tabLabel } from "@/lib/precog/navigation";
import { usePresentation } from "@/lib/precog/presentation";

/** The sections the Monthly review tab can open on; `item` names one of them. */
const SECTIONS = ["checks", "evidence", "calendar", "decisions"] as const;

/**
 * The Monthly review tab: this month's checks, the control evidence log, the
 * control work due this week, and the Decisions log, on one screen. It works
 * signed out and on a sample; each panel says what signing in adds.
 */
export function MonthlyArea({
  item,
  openTab,
}: {
  /** A section to scroll to: "decisions" opens on the Decisions log. */
  item: string | null;
  openTab: (tab: string, item?: string | null, build?: boolean) => void;
}) {
  const { say } = usePresentation();

  useEffect(() => {
    if (!item || !(SECTIONS as readonly string[]).includes(item)) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(item)?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [item]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{tabLabel("monthly", say)}</h1>
        <p className="text-sm text-muted">
          The checks to run this month, the record of each check, the control work due this week,
          and the decisions you logged, with their review dates.
        </p>
      </div>
      <section id="checks" className="scroll-mt-40">
        <MonthlyReview />
      </section>
      <section id="evidence" className="scroll-mt-40">
        <ControlEvidencePanel />
      </section>
      <section id="calendar" className="scroll-mt-40">
        <ControlCalendarCard
          onOpenProcess={(id) => openTab("map", id, true)}
          onOpenJournal={() => openTab("journal")}
          onOpenBuilder={() => openTab("map", null, true)}
        />
      </section>
      <section id="decisions" aria-label={tabLabel("journal", say)} className="scroll-mt-40">
        <DecisionJournal onOpenLinked={openTab} headingLevel={2} />
      </section>
    </div>
  );
}
