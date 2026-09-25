import { Button } from "@/components/ui/button";
import { Stat } from "@/components/precog/continuity/leave-cards";
import { NOT_ASSESSED_HINT } from "@/lib/precog/continuity/planner-copy";
import type { CoverageReport } from "@/lib/precog/continuity/coverage";
import type { DocumentationReport } from "@/lib/precog/continuity/documentation";
import { industryMeta, type IndustryId } from "@/lib/precog/industry";
import type { IndustryTemplate } from "@/lib/precog/templates/types";

export function PlannerStats({
  registerReady,
  report,
  docs,
  singlePoints,
  importantSinglePoints,
  mostDepended,
}: {
  registerReady: boolean;
  report: CoverageReport;
  docs: DocumentationReport;
  singlePoints: { count: number; nobody: number; onePerson: number };
  importantSinglePoints: number;
  mostDepended: CoverageReport["people"][number] | undefined;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Stat
        label="Backed up"
        value={registerReady ? `${report.coverageIndex}%` : "—"}
        hint={
          registerReady
            ? "Share of work two or more people can run alone (weighted by criticality)."
            : NOT_ASSESSED_HINT
        }
        tone={
          !registerReady
            ? "default"
            : report.coverageIndex >= 70
              ? "ok"
              : report.coverageIndex >= 40
                ? "warn"
                : "danger"
        }
      />
      <Stat
        label="Single points"
        value={registerReady ? String(singlePoints.count) : "—"}
        hint={
          registerReady
            ? `Items the business stops without: ${singlePoints.nobody} with nobody and ${singlePoints.onePerson} with one person who can run them alone.${
                importantSinglePoints > 0
                  ? ` ${importantSinglePoints} more ${importantSinglePoints === 1 ? "hurts" : "hurt"} within a week.`
                  : ""
              }`
            : NOT_ASSESSED_HINT
        }
        tone={!registerReady ? "default" : singlePoints.count === 0 ? "ok" : "danger"}
      />
      <Stat
        label="Learners in place"
        value={registerReady ? String(report.counts.thin) : "—"}
        hint={
          registerReady
            ? "One person can run it and someone else has started learning."
            : NOT_ASSESSED_HINT
        }
        tone={registerReady ? "warn" : "default"}
      />
      <Stat
        label="Written down"
        value={registerReady ? `${docs.documentedIndex}%` : "—"}
        hint={
          registerReady
            ? `${docs.counts.none} with nothing written, ${docs.counts.unlocated} written but location not recorded.`
            : NOT_ASSESSED_HINT
        }
        tone={
          !registerReady
            ? "default"
            : docs.documentedIndex >= 70
              ? "ok"
              : docs.documentedIndex >= 40
                ? "warn"
                : "danger"
        }
      />
      <Stat
        label="Most depended on"
        value={registerReady && mostDepended ? mostDepended.person.name : "—"}
        hint={
          registerReady && mostDepended
            ? `${mostDepended.dependence}% of must-do work stops if they are out (app's own index).`
            : registerReady
              ? "Add people to see who the business leans on."
              : NOT_ASSESSED_HINT
        }
        tone={registerReady && mostDepended && mostDepended.dependence >= 50 ? "danger" : "default"}
      />
    </div>
  );
}

export function PlannerRegisterBanners({
  registerFrom,
  industry,
  tpl,
  onClearStarter,
}: {
  registerFrom: "starter" | "own" | "sample";
  industry: IndustryId;
  tpl: IndustryTemplate;
  onClearStarter: () => void;
}) {
  return (
    <>
      {registerFrom === "starter" && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium">
            Starter list from the {industryMeta(industry).label.toLowerCase()} example
          </p>
          <p className="mt-1 leading-relaxed text-muted">
            These {tpl.knowledge.length} duties, tasks and pieces of know-how are what a business
            like yours usually runs on. Mark who can do each, edit or delete what does not apply, or
            start from a blank list. The figures above stay blank until someone is marked.
          </p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={onClearStarter}>
            Start from a blank list
          </Button>
        </div>
      )}
      {registerFrom === "own" && tpl.knowledge.length === 0 && (
        <div className="rounded-lg border border-border bg-panel/60 p-4 text-sm text-muted">
          Your register is empty. Add the duties, tasks and know-how the business runs on below, or
          import a spreadsheet, then mark who can do each.
        </div>
      )}
    </>
  );
}
