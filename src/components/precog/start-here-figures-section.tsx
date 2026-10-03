import { Link } from "@tanstack/react-router";
import { MetricCard } from "@/components/precog/home-shell-parts";
import { buttonClass } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DriftAction } from "@/lib/precog/integrations/drift-signals";
import type { NavFn } from "@/lib/precog/navigation";
import type { StartHereModel } from "@/lib/precog/start-here/model";

/**
 * Home's headline figures, at most two: the open duty conflicts and the share
 * of work with a stand-in. Each opens the screen that explains it.
 */
export function StartHereFiguresSection({
  model,
  onOpenDetail,
}: {
  model: StartHereModel["figures"];
  onOpenDetail: NavFn;
}) {
  const { openCritical, openHigh, registerReady, coverageIndex } = model;
  return (
    <section aria-label="Headline figures" className="grid gap-3 sm:grid-cols-2">
      <MetricCard
        label="Open duty conflicts"
        value={String(openCritical + openHigh)}
        hint={`${openCritical} critical · ${openHigh} high`}
        tone={openCritical > 0 ? "danger" : openHigh > 0 ? "warn" : "primary"}
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

/**
 * Where QuickBooks or an access export disagrees with the duty assignments.
 * Home lists these items last on "Do these first"; the Dashboard shows them
 * in this card until it is retired.
 */
export function BooksVsDutiesCard({ driftActions }: { driftActions: readonly DriftAction[] }) {
  if (driftActions.length === 0) return null;
  return (
    <Card className="border-warn/40 bg-warn/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Books vs your duty assignments</CardTitle>
        <CardDescription>
          QuickBooks or an access export disagrees with your duty assignments — resolve it before
          you rely on segregation checks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {driftActions.slice(0, 3).map((d) => (
          <p key={d.id}>
            <span className="font-medium text-fg">{d.title}.</span> {d.why}
          </p>
        ))}
        <Link to="/firm" className={buttonClass({ variant: "secondary", size: "sm" })}>
          Open firm workspace
        </Link>
      </CardContent>
    </Card>
  );
}
