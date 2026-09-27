import { Button } from "@/components/ui/button";
import type {
  PlannerFigures,
  RegisterEditor,
} from "@/components/precog/continuity/use-continuity-planner";
import { NOT_ASSESSED_HINT } from "@/lib/precog/continuity/planner-copy";
import type { CoverageReport } from "@/lib/precog/continuity/coverage";
import type { DocumentationReport } from "@/lib/precog/continuity/documentation";
import { industryMeta, type IndustryId } from "@/lib/precog/industry";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import { cn } from "@/lib/utils";

/** The five tiles at the top of the planner; blank until someone is marked on the register. */
export function PlannerStats({
  registerAssessed,
  report,
  docs,
  figures: { singlePoints, importantSinglePoints, mostDepended },
}: {
  registerAssessed: boolean;
  report: CoverageReport;
  docs: DocumentationReport;
  figures: PlannerFigures;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Stat
        label="Backed up"
        value={registerAssessed ? `${report.coverageIndex}%` : "—"}
        hint={
          registerAssessed
            ? "Share of work two or more people can run alone (weighted by criticality)."
            : NOT_ASSESSED_HINT
        }
        tone={
          !registerAssessed
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
        value={registerAssessed ? String(singlePoints.count) : "—"}
        hint={
          registerAssessed
            ? `Items the business stops without: ${singlePoints.nobody} with nobody and ${singlePoints.onePerson} with one person who can run them alone.${
                importantSinglePoints > 0
                  ? ` ${importantSinglePoints} more ${importantSinglePoints === 1 ? "hurts" : "hurt"} within a week.`
                  : ""
              }`
            : NOT_ASSESSED_HINT
        }
        tone={!registerAssessed ? "default" : singlePoints.count === 0 ? "ok" : "danger"}
      />
      <Stat
        label="Learners in place"
        value={registerAssessed ? String(report.counts.thin) : "—"}
        hint={
          registerAssessed
            ? "One person can run it and someone else has started learning."
            : NOT_ASSESSED_HINT
        }
        tone={registerAssessed ? "warn" : "default"}
      />
      <Stat
        label="Written down"
        value={registerAssessed ? `${docs.documentedIndex}%` : "—"}
        hint={
          registerAssessed
            ? `${docs.counts.none} with nothing written, ${docs.counts.unlocated} written but location not recorded.`
            : NOT_ASSESSED_HINT
        }
        tone={
          !registerAssessed
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
        value={registerAssessed && mostDepended ? mostDepended.person.name : "—"}
        hint={
          registerAssessed && mostDepended
            ? `${mostDepended.dependence}% of must-do work stops if they are out (app's own index).`
            : registerAssessed
              ? "Add people to see who the business leans on."
              : NOT_ASSESSED_HINT
        }
        tone={
          registerAssessed && mostDepended && mostDepended.dependence >= 50 ? "danger" : "default"
        }
      />
    </div>
  );
}

/** What the register is (a starter list or an empty own list) and how to begin. */
export function PlannerRegisterBanners({
  register,
  industry,
  tpl,
}: {
  register: Pick<RegisterEditor, "source" | "clearStarter">;
  industry: IndustryId;
  tpl: IndustryTemplate;
}) {
  const registerFrom = register.source;
  return (
    <>
      {registerFrom === "starter" && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium">
            Sample list from the {industryMeta(industry).label.toLowerCase()} sample
          </p>
          <p className="mt-1 leading-relaxed text-muted">
            These {tpl.knowledge.length} duties and pieces of know-how are what a business like
            yours usually runs on. Mark who can do each, edit or delete what does not apply, or
            start from a blank list. The figures above stay blank until someone is marked.
          </p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={register.clearStarter}>
            Start from a blank list
          </Button>
        </div>
      )}
      {registerFrom === "own" && tpl.knowledge.length === 0 && (
        <div className="rounded-lg border border-border bg-panel/60 p-4 text-sm text-muted">
          Your register is empty. Add the duties and know-how the business runs on below, or import
          a spreadsheet, then mark who can do each.
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "ok" | "warn" | "danger" | "default";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-2xl font-semibold",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}
