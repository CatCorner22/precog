import { useEffect, useState, type ReactNode } from "react";
import { ControlCalendarCard } from "@/components/precog/control-calendar";
import { ControlEvidencePanel } from "@/components/precog/control-evidence/panel";
import { DecisionJournal } from "@/components/precog/decision-journal";
import { MonthlyReview } from "@/components/precog/monthly-review";
import { tabLabel } from "@/lib/precog/navigation";
import { usePresentation } from "@/lib/precog/presentation";
import { revealMonthlyItem } from "./monthly-area.logic";
import { checkPeriod } from "./monthly-check-id";
import { PageIntro } from "./page-intro";

/**
 * The Monthly review tab: this month's checks first. The evidence log, the
 * week's control work and the Decisions log stay closed until the owner opens
 * them. Number patterns in a CSV live under How Precog scores. It works
 * signed out and on a sample; each panel says what signing in adds.
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
  const [recordOpen, setRecordOpen] = useState(item === "evidence");
  const [calendarOpen, setCalendarOpen] = useState(item === "calendar");
  const [decisionsOpen, setDecisionsOpen] = useState(item === "decisions");

  useEffect(() => {
    if (item === "number-patterns") {
      openTab("scores", "csv");
      return;
    }
    if (item === "evidence") setRecordOpen(true);
    if (item === "calendar") setCalendarOpen(true);
    if (item === "decisions") setDecisionsOpen(true);
  }, [item, openTab]);

  useEffect(() => {
    if (!item || item === "number-patterns") return;
    const frame = requestAnimationFrame(() => revealMonthlyItem(item, document));
    return () => cancelAnimationFrame(frame);
  }, [item, recordOpen, calendarOpen, decisionsOpen]);

  return (
    <div className="space-y-6">
      <PageIntro
        tab="monthly"
        purpose="Run this month's checks, record each result, and keep the decisions you logged under review."
        method={
          <p>
            The checks to run this month come first. The record of each check, the control work due
            this week, and the decisions you logged stay closed until you open them. Number patterns
            in a CSV are under How Precog scores.
          </p>
        }
      />
      <section id="checks">
        <MonthlyReview focusPeriod={checkPeriod(item)} />
      </section>
      <RecordFold
        id="evidence"
        title="Record of each check"
        open={recordOpen}
        onToggle={setRecordOpen}
      >
        <ControlEvidencePanel />
      </RecordFold>
      <RecordFold
        id="calendar"
        title="Control work due this week"
        open={calendarOpen}
        onToggle={setCalendarOpen}
      >
        <ControlCalendarCard
          onOpenProcess={() => openTab("procedures")}
          onOpenJournal={() => openTab("journal")}
          onOpenBuilder={() => openTab("procedures")}
        />
      </RecordFold>
      <RecordFold
        id="decisions"
        title={tabLabel("journal", say)}
        open={decisionsOpen}
        onToggle={setDecisionsOpen}
      >
        <DecisionJournal onOpenLinked={openTab} headingLevel={2} />
      </RecordFold>
    </div>
  );
}

/** A closed record under the month's checks. A link that names it opens it. */
function RecordFold({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
      className="rounded-xl border border-border bg-surface px-4 py-3"
    >
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}
