import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AbsenceImpact } from "@/lib/precog/continuity/absence-impact";
import type { AbsenceWindow } from "@/lib/precog/continuity/planned-absence";
import type { Person } from "@/lib/precog/types";
import { LeaveWindow } from "./leave-cards";

const today = "2026-10-08";
const person: Person = { id: "ana", name: "Ana Ruiz", role: "Owner", active: true };
const impact: AbsenceImpact = {
  people: [person],
  assessed: false,
  remaining: [],
  stops: [],
  alreadyStopped: [],
  continues: [],
  orphanedProcesses: [],
  dependence: 0,
  actions: [],
};

function rendered(from: string) {
  const window: AbsenceWindow = {
    absence: { id: "leave-ana", personId: person.id, industry: "dental", from, to: from },
    person,
    daysUntil: 0,
    lengthDays: 1,
    status: "current",
    overlaps: [],
    impact,
    peak: { from, to: from, people: [person], extraStops: [] },
    standInsAway: [],
    todayImpact: impact,
  };
  return renderToStaticMarkup(
    <LeaveWindow
      window={window}
      today={today}
      onRemove={() => {}}
      onExtend={() => {}}
      onBack={() => {}}
      onSelect={() => {}}
      tracked={() => undefined}
      onLog={() => {}}
    />,
  ).replace(/&#x27;/g, "'");
}

describe("LeaveWindow same-day return", () => {
  it("labels back-today as cancelling the absence", () => {
    const html = rendered(today);
    expect(html).toContain('aria-label="Cancel Ana\'s absence — back today"');
    expect(html).toContain("Cancel — back today");
  });

  it("keeps the usual back label after the absence has started", () => {
    const html = rendered("2026-10-07");
    expect(html).toContain('aria-label="Ana is back"');
    expect(html).toContain("Back</button>");
  });
});
