import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { entitlementLabel } from "@/lib/precog/sod/conflict-rules";
import { joinWithAnd } from "@/lib/precog/text";
import type { SodPanelModel } from "./use-sod-panel";

export function SodRolesSection({ model }: { model: SodPanelModel }) {
  const { report, placesOf } = model;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who holds which duties</CardTitle>
        <CardDescription>
          The duties each person holds, as the checker reads them. Dual release does not take a duty
          away; it puts a second person on the payment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {report.assignments.map((a) => {
          const mine = report.conflicts.filter((c) => c.personId === a.personId);
          const narrowed = mine.filter((c) => c.dualReleaseMitigated).length;
          return (
            <div key={a.personId} className="rounded-xl border border-border bg-elevated px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{a.personName}</p>
                  <p className="text-xs text-muted">
                    {a.role}
                    {placesOf.has(a.personId) &&
                      ` · ${joinWithAnd(placesOf.get(a.personId) ?? [])}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Badge variant={mine.length > 0 ? "danger" : "ok"}>
                    {mine.length} conflict{mine.length === 1 ? "" : "s"}
                  </Badge>
                  {narrowed > 0 && <Badge variant="ok">{narrowed} narrowed by dual release</Badge>}
                </div>
              </div>
              <ul className="mt-2 flex flex-wrap gap-1">
                {a.entitlements.map((e) => (
                  <li key={e}>
                    <Badge variant="default">{entitlementLabel(e)}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
