import { controls, staffComposition } from "@/lib/precog/demo-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const FRAMEWORK = [
  {
    duty: "Authorization",
    meaning: "Approve before money or adjustments move",
    dental: "Owner approves write-offs, large AP, payroll",
  },
  {
    duty: "Custody",
    meaning: "Handle assets (cash, checks, bank release)",
    dental: "Drawer, deposits, ACH initiation",
  },
  {
    duty: "Recording",
    meaning: "Post transactions in PMS / books",
    dental: "Payment posting, invoices, claim adjustments",
  },
  {
    duty: "Reconciliation",
    meaning: "Independent verification",
    dental: "Bank rec, deposit vs PMS, adjustment review",
  },
];

export function SodPanel() {
  const gaps = controls.filter((c) => !c.segregated);
  const ok = controls.filter((c) => c.segregated);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {FRAMEWORK.map((f) => (
          <Card key={f.duty}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{f.duty}</CardTitle>
              <CardDescription>{f.meaning}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted">{f.dental}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Practice SoD status</CardTitle>
          <CardDescription>
            Segregation score {staffComposition.segregationScore}/100 · team of{" "}
            {staffComposition.teamSize}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-danger uppercase">
              Conflicts / gaps ({gaps.length})
            </p>
            <ul className="space-y-2">
              {gaps.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {c.residualRiskAccepted ? (
                      <Badge variant="warn">Residual accepted</Badge>
                    ) : (
                      <Badge variant="danger">Needs action</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-muted">{c.description}</p>
                  <p className="mt-1 text-xs text-subtle">
                    Duties: {c.duties.join(" · ")}
                  </p>
                  {c.compensatingControls.length > 0 && (
                    <p className="mt-2 text-xs text-ok">
                      Compensating: {c.compensatingControls.join("; ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-ok uppercase">
              Operating controls ({ok.length})
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {ok.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">{c.description}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="rounded-lg border border-border bg-panel p-3 text-sm text-muted">
            COSO expects SoD as a control activity, but small practices usually cannot fully
            segregate. Document conflicts, install compensating controls (independent review,
            dual release, access limits), and re-score when staff composition changes. Precog
            uses these gaps as inputs to timeline and financial projections.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
