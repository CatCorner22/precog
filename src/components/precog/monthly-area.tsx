import { lazy, Suspense, useEffect } from "react";
import { ControlCalendarCard } from "@/components/precog/control-calendar";
import { ControlEvidencePanel } from "@/components/precog/control-evidence/panel";
import { DecisionJournal } from "@/components/precog/decision-journal";
import { TabLoading } from "@/components/precog/home-shell-parts";
import { MonthlyReview } from "@/components/precog/monthly-review";
import { tabLabel } from "@/lib/precog/navigation";
import { usePresentation } from "@/lib/precog/presentation";
import { checkPeriod, revealMonthlyItem } from "./monthly-area.logic";
import { PageIntro } from "./page-intro";

/**
 * The Monthly review tab: this month's checks, the control evidence log, the
 * control work due this week, the Decisions log, and the number-pattern
 * screen for a CSV of transactions, on one screen. It works signed out and on
 * a sample; each panel says what signing in adds.
 */
export function MonthlyArea({
  item,
  openTab,
}: {
  /**
   * A section to scroll to ("decisions" opens on the Decisions log), or one
   * check, "check-<period>-<key>", to scroll to and focus.
   */
  item: string | null;
  openTab: (tab: string, item?: string | null, build?: boolean) => void;
}) {
  const { say } = usePresentation();

  useEffect(() => {
    if (!item) return;
    const frame = requestAnimationFrame(() => revealMonthlyItem(item, document));
    return () => cancelAnimationFrame(frame);
  }, [item]);

  return (
    <div className="space-y-6">
      <PageIntro
        tab="monthly"
        purpose="Run this month's checks, record each result, and keep the decisions you logged under review."
        method={
          <p>
            In order down the page: the checks to run this month, the record of each check, the
            control work due this week, the decisions you logged with their review dates, and a
            screen for number patterns in a CSV of transactions.
          </p>
        }
      />
      <section id="checks">
        <MonthlyReview focusPeriod={checkPeriod(item)} />
      </section>
      <section id="evidence">
        <ControlEvidencePanel />
      </section>
      <section id="calendar">
        <ControlCalendarCard
          onOpenProcess={(id) => openTab("map", id, true)}
          onOpenJournal={() => openTab("journal")}
          onOpenBuilder={() => openTab("map", null, true)}
        />
      </section>
      <section id="decisions" aria-label={tabLabel("journal", say)}>
        <DecisionJournal onOpenLinked={openTab} headingLevel={2} />
      </section>
      <section id="number-patterns" aria-labelledby="number-patterns-heading" className="space-y-3">
        <h2 id="number-patterns-heading" className="text-lg font-semibold">
          Number patterns in a CSV
        </h2>
        <Suspense fallback={<TabLoading />}>
          <ForensicPanel headingLevel={3} />
        </Suspense>
      </section>
    </div>
  );
}

/** The screen and its statistics load only when the Monthly review opens. */
const ForensicPanel = lazy(() =>
  import("@/components/precog/forensic-panel").then((module) => ({
    default: module.ForensicPanel,
  })),
);
