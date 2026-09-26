import { firstName, LEVEL_LABEL, STATUS_LABEL } from "@/lib/precog/continuity/coverage";
import { DOCUMENTATION_LABEL, documentationState } from "@/lib/precog/continuity/documentation";
import {
  formatDateRange,
  handoffDeadline,
  leadLabel,
  procedurePointer,
} from "@/lib/precog/continuity/planned-absence";
import { standInAlreadyStrong } from "@/lib/precog/continuity/leave-debrief";
import { handoverDeadline, leaverLead } from "@/lib/precog/continuity/leavers";
import { CONFIRMATION_MAX_AGE_DAYS } from "@/lib/precog/continuity/staleness";
import type { IndustryMeta } from "@/lib/precog/industry";
import type { IndustryTemplate } from "@/lib/precog/templates";
import type { DecisionEntry, PracticeProfile } from "@/lib/precog/practice-profile";
import type { ControlReportModel } from "@/lib/precog/report/build-control-report";
import {
  continuityStepKey,
  handoffCommitment,
  linkedContinuityStep,
  linkedKnowledgeId,
  slipLabels,
  type ContinuityCommitment,
} from "@/lib/precog/decisions/follow-through";
import { fmtDate } from "@/components/precog/control-report-helpers";
import { CommitmentTag, Section } from "@/components/precog/control-report-parts";

type ContinuityModel = Pick<
  ControlReportModel,
  | "continuity"
  | "staleness"
  | "checkIns"
  | "docs"
  | "cards"
  | "leave"
  | "debriefs"
  | "leaving"
  | "slips"
  | "committed"
>;

export function ControlReportContinuitySections({
  registerReady,
  tpl,
  industry,
  trackFreshness,
  today,
  profile,
  continuityDecisions,
  openContinuity,
  doneContinuity,
  droppedContinuity,
  model,
}: {
  registerReady: boolean;
  tpl: IndustryTemplate;
  industry: IndustryMeta;
  trackFreshness: boolean;
  today: string;
  profile: PracticeProfile;
  continuityDecisions: DecisionEntry[];
  openContinuity: DecisionEntry[];
  doneContinuity: number;
  droppedContinuity: number;
  model: ContinuityModel;
}) {
  const {
    continuity,
    staleness,
    checkIns,
    docs,
    cards,
    leave,
    debriefs,
    leaving,
    slips,
    committed,
  } = model;

  return (
    <>
      <Section title="Continuity of operations">
        {!registerReady ? (
          <p className="text-sm text-neutral-700">
            Not assessed yet.{" "}
            {tpl.knowledge.length === 0
              ? "The register is empty: the business has not yet listed the duties, tasks and know-how it runs on."
              : `The register holds ${tpl.knowledge.length} starter items from the ${industry.label.toLowerCase()} example with nobody marked on any of them, so no continuity figure is reported.`}
          </p>
        ) : (
          <>
            <p className="text-sm text-neutral-700">
              <strong>{continuity.coverageIndex}%</strong> of work (weighted by criticality) has two
              or more people who can run it alone. {continuity.counts.uncovered} item
              {continuity.counts.uncovered === 1 ? "" : "s"} nobody can run,{" "}
              {continuity.counts.single} with exactly one person, {continuity.counts.thin} with one
              person plus a learner.
            </p>
            {continuity.singlePoints.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600">
                No critical or important item is uncovered or relies on one person without a
                learner.
              </p>
            ) : (
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {continuity.singlePoints.map((s) => (
                  <li key={s.item.id} className="border-b border-neutral-200 py-1">
                    <div className="flex justify-between gap-2">
                      <span>
                        {s.item.name}
                        <span className="text-neutral-500">
                          {" "}
                          · {s.primaries[0]?.name ?? "nobody"}
                        </span>
                      </span>
                      <span className="text-xs text-neutral-600">{STATUS_LABEL[s.status]}</span>
                    </div>
                    {s.suggestedBackups[0] && (
                      <div className="text-xs text-neutral-500">
                        Train next: {s.suggestedBackups[0].person.name} (
                        {s.suggestedBackups[0].reasons[0]})
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {continuity.plan.length > 0 && (
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                {continuity.plan.slice(0, 5).map((m) => (
                  <li key={m.item.id}>
                    {m.action}
                    <CommitmentTag c={committed.get(continuityStepKey(m.item.id, "cover"))} />
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-sm text-neutral-700">
              <strong>{docs.documentedIndex}%</strong> of work (weighted by criticality) is written
              down and findable. {docs.counts.none} item(s) with nothing written,{" "}
              {docs.counts.unlocated} written but location not recorded.
            </p>
            {docs.gaps.length > 0 && (
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                {docs.gaps.slice(0, 5).map((g) => (
                  <li key={g.item.id}>
                    <span className="text-neutral-500">{DOCUMENTATION_LABEL[g.state]} · </span>
                    {g.action}
                    <CommitmentTag
                      c={committed.get(
                        continuityStepKey(g.item.id, g.state === "none" ? "document" : "locate"),
                      )}
                    />
                  </li>
                ))}
              </ol>
            )}
            {trackFreshness && (
              <p className="mt-3 text-sm text-neutral-700">
                <strong>{staleness.confirmedIndex}%</strong> of work (weighted by criticality) was
                confirmed in the last {CONFIRMATION_MAX_AGE_DAYS} days.
                {staleness.stale.length > 0 && (
                  <> {staleness.stale.length} item(s) to re-confirm.</>
                )}
              </p>
            )}
            {trackFreshness && staleness.stale.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-neutral-600">
                {checkIns.checkIns.slice(0, 6).map((c) => (
                  <li key={c.person.id}>
                    <strong>Check in with {c.person.name}</strong> — {c.items.length}{" "}
                    {c.items.length === 1 ? "entry" : "entries"}
                    {c.soleCount > 0 && ` (${c.soleCount} nobody else can run alone)`}:{" "}
                    {c.items.map((entry) => entry.item.name).join(", ")}
                  </li>
                ))}
                {checkIns.checkIns.length > 6 && (
                  <li>{checkIns.checkIns.length - 6} more people to check in with.</li>
                )}
                {checkIns.unheld.length > 0 && (
                  <li>
                    <strong>Nobody active holds</strong> —{" "}
                    {checkIns.unheld.map((entry) => entry.item.name).join(", ")}: confirm they still
                    matter or assign someone.
                  </li>
                )}
              </ul>
            )}
            {continuity.people.filter((l) => l.person.active && l.soleItems.length > 0).length >
              0 && (
              <ul className="mt-3 grid gap-1 text-xs text-neutral-600 sm:grid-cols-2">
                {continuity.people
                  .filter((l) => l.person.active && l.soleItems.length > 0)
                  .slice(0, 6)
                  .map((l) => (
                    <li key={l.person.id}>
                      <span className="font-medium text-neutral-800">{l.person.name}</span> —{" "}
                      {l.dependence}% of must-do work stops if out; only they can do:{" "}
                      {l.soleItems.map((k) => k.name).join(", ")}
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
      </Section>

      {leave.windows.length > 0 && (
        <ControlReportLeaveSection leave={leave} today={today} committed={committed} />
      )}

      {debriefs.length > 0 && <ControlReportDebriefSection debriefs={debriefs} />}

      {leaving.length > 0 && <ControlReportLeavingSection leaving={leaving} today={today} />}

      {cards.length > 0 && <ControlReportCardsSection cards={cards} />}

      {continuityDecisions.length > 0 && (
        <ControlReportFollowThroughSection
          continuity={continuity}
          profile={profile}
          today={today}
          openContinuity={openContinuity}
          doneContinuity={doneContinuity}
          droppedContinuity={droppedContinuity}
          slips={slips}
        />
      )}
    </>
  );
}

function ControlReportLeaveSection({
  leave,
  today,
  committed,
}: {
  leave: ControlReportModel["leave"];
  today: string;
  committed: Map<string, ContinuityCommitment>;
}) {
  return (
    <Section
      title={
        leave.windows.some((w) => w.absence.unplanned)
          ? "Out today and planned leave — what stops and who covers"
          : "Planned leave — what stops and who covers"
      }
    >
      <p className="text-xs text-neutral-500">
        Absences on the register, soonest first — leave booked ahead and anyone recorded out on the
        day (sick, emergency). Hand-offs already logged in the Journal are marked; everything else
        needs a named stand-in before the leave starts, or today for anyone already out.
      </p>
      <ul className="mt-2 space-y-3">
        {leave.windows.slice(0, 8).map((w) => {
          const others = w.overlaps.map((o) => firstName(o.person.name));
          const peakOthers = w.peak.people
            .filter((p) => p.id !== w.person.id)
            .map((p) => firstName(p.name));
          return (
            <li
              key={w.absence.id}
              className="break-inside-avoid rounded border border-neutral-300 p-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {w.person.name} — {formatDateRange(w.absence.from, w.absence.to)}
                  <span className="ml-2 text-xs font-normal text-neutral-600">
                    {w.absence.unplanned
                      ? w.status === "current"
                        ? `out unexpectedly${w.absence.to === today ? ", today" : `, through ${w.absence.to}`}`
                        : `unplanned · ${leadLabel(w.daysUntil)}`
                      : w.status === "current"
                        ? `out now, back after ${w.absence.to}`
                        : `${leadLabel(w.daysUntil)} · ${w.lengthDays} day${w.lengthDays === 1 ? "" : "s"}`}
                  </span>
                </span>
                <span className="text-xs text-neutral-600">
                  {(w.todayImpact ?? w.impact).dependence}% of must-do work stops
                </span>
              </div>
              {others.length > 0 && (
                <p className="mt-1 text-xs text-amber-800">
                  Overlapping leave: {others.join(", ")} also out for part of this window.{" "}
                  {w.peak.extraStops.length > 0
                    ? `Stops below are for ${formatDateRange(w.peak.from, w.peak.to)}, when ${peakOthers.join(" and ")} ${peakOthers.length === 1 ? "is" : "are"} also away.`
                    : "Nothing extra stops on the shared days."}
                </p>
              )}
              {w.impact.stops.length > 0 ? (
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="text-left text-neutral-500">
                      <th className="py-0.5 font-normal">Stops</th>
                      <th className="py-0.5 font-normal">Stand-in</th>
                      {w.status === "current" && <th className="py-0.5 font-normal">Procedure</th>}
                      <th className="py-0.5 font-normal">Hand-off</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.impact.stops.map((s) => {
                      const c = handoffCommitment(committed, s.item.id, w.absence.id);
                      return (
                        <tr key={s.item.id} className="border-t border-neutral-200 align-top">
                          <td className="py-1 pr-2">{s.item.name}</td>
                          <td className="py-1 pr-2">
                            {s.standIn?.name ?? "Nobody — outside provider or it waits"}
                          </td>
                          {w.status === "current" && (
                            <td className="py-1 pr-2 text-neutral-600">{procedurePointer(s)}</td>
                          )}
                          <td className="py-1 text-neutral-600">
                            {c
                              ? c.overdue
                                ? `Logged; review overdue${c.reviewBy ? ` (${c.reviewBy})` : ""}`
                                : `Logged${c.reviewBy ? `; review ${c.reviewBy}` : ""}`
                              : w.status === "current"
                                ? "Not logged — decide today"
                                : `Not logged — by ${handoffDeadline(w, today)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="mt-2 text-xs text-neutral-600">
                  Nothing on the register stops; someone else can run everything they hold.
                </p>
              )}
              {w.impact.orphanedProcesses.length > 0 && (
                <p className="mt-2 text-xs text-neutral-600">
                  No owner left for: {w.impact.orphanedProcesses.join(", ")}
                </p>
              )}
              <p className="mt-2 text-xs text-neutral-600">
                Left in the business:{" "}
                {w.impact.remaining.length > 0
                  ? w.impact.remaining.map((p) => p.name).join(", ")
                  : "nobody"}
              </p>
            </li>
          );
        })}
      </ul>
      {leave.windows.length > 8 && (
        <p className="mt-2 text-xs text-neutral-500">
          {leave.windows.length - 8} more absences further out; see the Who knows what tab.
        </p>
      )}
    </Section>
  );
}

function ControlReportDebriefSection({ debriefs }: { debriefs: ControlReportModel["debriefs"] }) {
  return (
    <Section title="Absence just ended — debrief the stand-ins">
      <p className="text-xs text-neutral-500">
        Leave, or a day out sick, is the one time a stand-in runs the work for real. For each entry
        covered, decide whether the register can now say they can do it alone (confirmed today,
        hand-off closed) or whether it becomes a tracked cross-training step. Answer on the Who
        knows what tab so it stops appearing here.
      </p>
      <ul className="mt-2 space-y-3">
        {debriefs.slice(0, 6).map((d) => (
          <li
            key={d.absence.id}
            className="break-inside-avoid rounded border border-neutral-300 p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                {d.person.name} — back from {formatDateRange(d.absence.from, d.absence.to)}
              </span>
              <span className="text-xs text-neutral-600">
                {d.lengthDays} day{d.lengthDays === 1 ? "" : "s"}{" "}
                {d.absence.unplanned ? "out unexpectedly" : "away"}
                {d.daysSince > 0
                  ? `, ended ${d.daysSince} day${d.daysSince === 1 ? "" : "s"} ago`
                  : ", ended today"}
              </span>
            </div>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="py-0.5 font-normal">Covered</th>
                  <th className="py-0.5 font-normal">Stand-in</th>
                  <th className="py-0.5 font-normal">Decide</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((e) => (
                  <tr key={e.item.id} className="border-t border-neutral-200 align-top">
                    <td className="py-1 pr-2">{e.item.name}</td>
                    <td className="py-1 pr-2">
                      {e.standIn
                        ? `${e.standIn.name}${e.standInLevel ? ` (${LEVEL_LABEL[e.standInLevel].toLowerCase()})` : ""}`
                        : "Nobody was lined up"}
                    </td>
                    <td className="py-1 text-neutral-600">
                      {!e.standIn
                        ? "Who stepped in? Record them on the register."
                        : standInAlreadyStrong(e)
                          ? e.handoff
                            ? "Already can do it alone; close the logged hand-off."
                            : "Already can do it alone; nothing to change."
                          : e.training
                            ? "Can do alone now? Then close the cross-training entry."
                            : "Can do alone now? Or log it as cross-training."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ul>
      {debriefs.length > 6 && (
        <p className="mt-2 text-xs text-neutral-500">
          {debriefs.length - 6} more to debrief; see the Who knows what tab.
        </p>
      )}
    </Section>
  );
}

function ControlReportLeavingSection({
  leaving,
  today,
}: {
  leaving: ControlReportModel["leaving"];
  today: string;
}) {
  return (
    <Section title="Leaving the team — hand-over before the last day">
      <p className="text-xs text-neutral-500">
        People working their notice still count as cover until their last day. Every register entry
        only they can run alone must be handed to a named successor, written down and placed where
        the successor can find it before that date; processes they alone own need a new owner. Once
        the date has passed, mark them as left on the Who knows what tab so the coverage figures
        stop counting them (the record stays in the history).
      </p>
      <ul className="mt-2 space-y-3">
        {leaving.slice(0, 6).map((l) => (
          <li
            key={l.person.id}
            className="break-inside-avoid rounded border border-neutral-300 p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                {l.person.name} — {leaverLead(l.daysLeft)} (last day {l.lastDay})
              </span>
              <span className="text-xs text-neutral-600">
                {l.status === "gone"
                  ? "Still counted as cover — mark as left"
                  : l.handover.length === 0
                    ? "Nothing on the register depends on them alone"
                    : `${l.handover.length} ${l.handover.length === 1 ? "entry" : "entries"} to hand over by ${handoverDeadline(l, today)}${l.unlogged > 0 ? `, ${l.unlogged} not yet in the Journal` : ""}`}
              </span>
            </div>
            {l.handover.length > 0 && (
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="py-0.5 font-normal">Only they can run</th>
                    <th className="py-0.5 font-normal">Successor to train</th>
                    <th className="py-0.5 font-normal">Written procedure</th>
                    <th className="py-0.5 font-normal">Journal</th>
                  </tr>
                </thead>
                <tbody>
                  {l.handover.map((h) => (
                    <tr key={h.item.id} className="border-t border-neutral-200 align-top">
                      <td className="py-1 pr-2">
                        {h.item.name}
                        {h.item.criticality === "critical" ? " (critical)" : ""}
                      </td>
                      <td className="py-1 pr-2">
                        {h.successor
                          ? `${h.successor.name}${h.successorLevel ? ` (${LEVEL_LABEL[h.successorLevel].toLowerCase()})` : " (starting cold)"}`
                          : "Nobody left to take it"}
                      </td>
                      <td className="py-1 pr-2">
                        {!h.item.documented
                          ? "Nothing written down"
                          : h.item.procedureLocation?.trim()
                            ? h.item.procedureLocation.trim()
                            : "Written; location not recorded"}
                      </td>
                      <td className="py-1 text-neutral-600">
                        {h.training
                          ? `Training logged${h.training.reviewBy ? `, review ${h.training.reviewBy}` : ""}`
                          : "Not logged"}
                        {h.documenting ? "; write-up logged" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {l.orphanedProcesses.length > 0 && (
              <p className="mt-2 text-xs text-neutral-600">
                Processes needing a new owner: {l.orphanedProcesses.join(", ")}.
              </p>
            )}
            <p className="mt-1 text-xs text-neutral-600">
              {l.remaining.length > 0
                ? `Left in the business after ${l.lastDay}: ${l.remaining.map((p) => p.name).join(", ")}.`
                : "Nobody else is left in the business."}
            </p>
          </li>
        ))}
      </ul>
      {leaving.length > 6 && (
        <p className="mt-2 text-xs text-neutral-500">
          {leaving.length - 6} more leaving; see the Who knows what tab.
        </p>
      )}
    </Section>
  );
}

function ControlReportCardsSection({ cards }: { cards: ControlReportModel["cards"] }) {
  return (
    <Section title="Contingency cards — if someone is out tomorrow">
      <p className="text-xs text-neutral-500">
        One card per person whose absence stops work. Hand the named stand-in the card and the
        written procedure; items without a location need one recorded.
      </p>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2">
        {cards.slice(0, 8).map((c) => (
          <li
            key={c.people[0].id}
            className="break-inside-avoid rounded border border-neutral-300 p-3 text-sm"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">If {c.people[0].name} is out</span>
              <span className="text-xs text-neutral-600">
                {c.dependence}% of must-do work stops
              </span>
            </div>
            {c.stops.length > 0 && (
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="py-0.5 font-normal">Stops</th>
                    <th className="py-0.5 font-normal">Stand-in</th>
                    <th className="py-0.5 font-normal">Written procedure</th>
                  </tr>
                </thead>
                <tbody>
                  {c.stops.map((s) => (
                    <tr key={s.item.id} className="border-t border-neutral-200 align-top">
                      <td className="py-1 pr-2">{s.item.name}</td>
                      <td className="py-1 pr-2">
                        {s.standIn?.name ?? "Nobody — outside provider or it waits"}
                      </td>
                      <td className="py-1 text-neutral-600">
                        {!s.item.documented
                          ? "None written"
                          : s.item.procedureLocation?.trim() || "Exists; location not recorded"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {c.orphanedProcesses.length > 0 && (
              <p className="mt-2 text-xs text-neutral-600">
                Only listed owner of: {c.orphanedProcesses.join(", ")}
              </p>
            )}
            <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-xs">
              {c.actions.slice(0, 3).map((a) => (
                <li key={a.text}>{a.text}</li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
      {cards.length > 8 && (
        <p className="mt-2 text-xs text-neutral-500">
          {cards.length - 8} more people have smaller exposures; see the Who knows what tab.
        </p>
      )}
    </Section>
  );
}

function ControlReportFollowThroughSection({
  continuity,
  profile,
  today,
  openContinuity,
  doneContinuity,
  droppedContinuity,
  slips,
}: {
  continuity: ControlReportModel["continuity"];
  profile: PracticeProfile;
  today: string;
  openContinuity: DecisionEntry[];
  doneContinuity: number;
  droppedContinuity: number;
  slips: ControlReportModel["slips"];
}) {
  return (
    <Section title="Continuity follow-through">
      <p className="text-xs text-neutral-500">
        Cross-training, hand-off and write-it-down steps logged from the register:{" "}
        {openContinuity.length} open, {doneContinuity} closed as done
        {slips.length > 0 ? `, ${slips.length} closed as done but slipped since` : ""}
        {droppedContinuity > 0 ? `, ${droppedContinuity} closed as no longer relevant` : ""}.
        Coverage and documentation are the register today, not when the step was logged.
      </p>
      {slips.length > 0 && (
        <ul className="mt-2 space-y-1.5 text-sm">
          {slips.map((slip) => {
            const { decision: d } = slip;
            const labels = slipLabels(slip);
            return (
              <li key={d.id} className="border-b border-neutral-200 pb-1.5">
                <p>
                  <span className="font-medium text-red-700">Slipped</span> · {d.subject}
                  <span className="text-neutral-500">
                    {" "}
                    · {labels.from} when closed → {labels.to} now
                  </span>
                </p>
                {d.note && <p className="text-neutral-600">{d.note}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {openContinuity.length > 0 && (
        <ul className="mt-2 space-y-1.5 text-sm">
          {openContinuity.map((d) => {
            const item = continuity.items.find(
              (i) => i.item.id === linkedKnowledgeId(d, profile.industry),
            );
            const step = linkedContinuityStep(d);
            const state = !item
              ? "no longer on the register"
              : step === "document" || step === "locate"
                ? DOCUMENTATION_LABEL[documentationState(item.item)].toLowerCase()
                : STATUS_LABEL[item.status].toLowerCase();
            const overdue = Boolean(d.reviewBy && d.reviewBy < today);
            return (
              <li key={d.id} className="border-b border-neutral-200 pb-1.5">
                <p>
                  <span className="font-medium">{d.subject}</span>
                  <span className="text-neutral-500">
                    {" "}
                    · {state}
                    {d.reviewBy ? ` · review ${fmtDate(d.reviewBy)}` : ""}
                    {d.reviews?.length ? ` · reviewed ${d.reviews.length}×` : ""}
                  </span>
                  {overdue && <span className="ml-1 font-medium text-red-700">overdue</span>}
                </p>
                {d.note && <p className="text-neutral-600">{d.note}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {openContinuity.length === 0 && slips.length === 0 && (
        <p className="mt-2 text-sm text-neutral-600">
          {doneContinuity > 0
            ? droppedContinuity > 0
              ? "Nothing open and nothing slipped — every step closed as done still holds; the rest were dropped as no longer relevant."
              : "Nothing open and nothing slipped — every logged step has been completed and still holds."
            : "Nothing open — every logged step was closed as no longer relevant, so none has been completed."}
        </p>
      )}
    </Section>
  );
}
