import { ENTITLEMENTS, isOperatingDuty } from "@/lib/precog/sod/conflict-rules";
import { JOB_CATALOG, JOB_FAMILY_LABEL, type JobFamily } from "@/lib/precog/onboarding/job-catalog";
import { buttonClass } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

const LABEL = new Map(ENTITLEMENTS.map((e) => [e.id, e.label] as const));

/**
 * The whole job catalog as a readable sheet: every title, what the job does,
 * and the money duties it starts with. Owners and their advisors can check the
 * base the fast setup draws on and disagree with it in the grid.
 *
 * `defaultOpen` starts the sheet expanded, for a caller whose own button
 * already asked to see the catalog (the Team area's "Add a common job").
 */
export function JobCatalogSheet({
  defaultOpen = false,
  prominent = false,
}: { defaultOpen?: boolean; prominent?: boolean } = {}) {
  return (
    <details
      className={cn("rounded-lg border border-border bg-bg text-xs", prominent ? "p-3" : "p-2")}
      open={defaultOpen}
    >
      <summary
        className={
          prominent
            ? buttonClass({ variant: "secondary", size: "sm", className: "cursor-pointer" })
            : "cursor-pointer font-medium"
        }
      >
        Review suggested duties for {JOB_CATALOG.length} job titles
      </summary>
      <p className="mt-2 text-subtle">
        These duties are starting points to review, not proof of anyone&rsquo;s actual access. They
        are Precog&rsquo;s reading of what a title usually holds in a business of two to fifty
        people. Where a title matches one occupation in the U.S. Bureau of Labor Statistics
        classification (SOC 2018), Precog shows its code.
      </p>
      <div className="mt-2 max-h-80 overflow-y-auto">
        {(Object.keys(JOB_FAMILY_LABEL) as JobFamily[]).map((family) => {
          const entries = JOB_CATALOG.filter((j) => j.family === family);
          if (!entries.length) return null;
          return (
            <section key={family} className="mb-3">
              <h3 className="mb-1 font-medium text-muted">{JOB_FAMILY_LABEL[family]}</h3>
              <ul className="space-y-1">
                {entries.map((j) => (
                  <li key={j.id} className="rounded-md border border-border/60 px-2 py-1">
                    <p>
                      <span className="font-medium text-fg">{j.title}</span>
                      {j.soc ? <span className="text-subtle"> · SOC {j.soc}</span> : null}
                    </p>
                    <p className="text-muted">{j.description}</p>
                    <p className="text-subtle">
                      Starts with:{" "}
                      {j.entitlements
                        .filter(isOperatingDuty)
                        .map((d) => LABEL.get(d) ?? d)
                        .join("; ") || "no money duty"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </details>
  );
}
