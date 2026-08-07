import { useMemo, useState } from "react";
import { controls } from "@/lib/precog/demo-data";
import { ENTITLEMENTS } from "@/lib/precog/sod/conflict-rules";
import { detectSodConflicts } from "@/lib/precog/sod/detect";
import { usePractice } from "@/lib/precog/practice-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AlertTriangle, Grid3x3, Shield, Users } from "lucide-react";

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

type NavFn = (tab: string, id?: string) => void;

export function SodPanel({ onNavigate }: { onNavigate?: NavFn }) {
  const { profile } = usePractice();
  const [view, setView] = useState<"conflicts" | "matrix" | "roles">("conflicts");
  const [filterSeverity, setFilterSeverity] = useState<
    "all" | "critical" | "high" | "medium" | "family"
  >("all");

  const residualAccepted = useMemo(
    () =>
      new Set(
        controls.filter((c) => c.residualRiskAccepted).map((c) => c.id),
      ),
    [],
  );
  const compensatingByControl = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of controls) {
      if (c.compensatingControls.length) m[c.id] = c.compensatingControls;
    }
    return m;
  }, []);

  const report = useMemo(
    () =>
      detectSodConflicts(profile.staff, {
        residualAcceptedControlIds: residualAccepted,
        compensatingByControlId: compensatingByControl,
      }),
    [profile.staff, residualAccepted, compensatingByControl],
  );

  const filtered = report.conflicts.filter((c) =>
    filterSeverity === "all" ? true : c.severity === filterSeverity,
  );

  // Compact matrix: only entitlements that appear in rules
  const matrixIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of ENTITLEMENTS) {
      if (e.id === "view_reports_only") continue;
      ids.add(e.id);
    }
    return Array.from(ids);
  }, []);

  const cellMap = useMemo(() => {
    const m = new Map<string, (typeof report.matrix)[0]>();
    for (const cell of report.matrix) {
      m.set(`${cell.row}|${cell.col}`, cell);
    }
    return m;
  }, [report.matrix]);

  const shortLabel = (id: string) => {
    const e = ENTITLEMENTS.find((x) => x.id === id);
    if (!e) return id;
    return e.label.length > 22 ? e.label.slice(0, 20) + "…" : e.label;
  };

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">SoD conflict detection</Badge>
          <Badge variant="primary">Rule matrix engine</Badge>
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">
          Who holds incompatible powers?
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Automated scan of role entitlements against a dental SoD rulebook (custody × recording
          × authorization × reconciliation × master data). Small teams will have conflicts —
          detection makes them explicit so you can compensate or accept residual risk.
        </p>
        <p className="mt-2 text-xs text-subtle">{report.method}</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Segregation health"
          value={String(report.summary.segregationHealth)}
          hint="Higher is better"
          tone={
            report.summary.segregationHealth < 40
              ? "danger"
              : report.summary.segregationHealth < 65
                ? "warn"
                : "ok"
          }
        />
        <Stat
          label="Critical"
          value={String(report.summary.critical)}
          hint="Act first"
          tone="danger"
        />
        <Stat
          label="High"
          value={String(report.summary.high)}
          hint="Plan this month"
          tone="warn"
        />
        <Stat
          label="People with conflicts"
          value={String(report.summary.peopleWithConflicts)}
          hint={`of ${report.assignments.length} staff`}
          tone="primary"
        />
        <Stat
          label="Open (no accept)"
          value={String(report.summary.openWithoutAcceptance)}
          hint="Need decision"
          tone="warn"
        />
      </div>

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

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={view === "conflicts" ? "default" : "secondary"}
          onClick={() => setView("conflicts")}
        >
          <AlertTriangle className="size-3.5" />
          Conflicts ({report.conflicts.length})
        </Button>
        <Button
          size="sm"
          variant={view === "matrix" ? "default" : "secondary"}
          onClick={() => setView("matrix")}
        >
          <Grid3x3 className="size-3.5" />
          Conflict matrix
        </Button>
        <Button
          size="sm"
          variant={view === "roles" ? "default" : "secondary"}
          onClick={() => setView("roles")}
        >
          <Users className="size-3.5" />
          Role entitlements
        </Button>
      </div>

      {view === "conflicts" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-4" />
              Detected conflicts
            </CardTitle>
            <CardDescription>
              Pairwise entitlement scan · scored with residual acceptance & staff profile
            </CardDescription>
            <div className="flex flex-wrap gap-1.5 pt-2">
              {(["all", "critical", "high", "medium", "family"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilterSeverity(s)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] capitalize",
                    filterSeverity === s
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-elevated text-muted",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {filtered.length === 0 && (
              <p className="text-sm text-muted">No conflicts in this filter.</p>
            )}
            {filtered.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "rounded-xl border px-3 py-3 text-sm",
                  c.severity === "critical"
                    ? "border-danger/30 bg-danger/5"
                    : c.severity === "high"
                      ? "border-warn/30 bg-warn/5"
                      : "border-border bg-elevated",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      c.severity === "critical"
                        ? "danger"
                        : c.severity === "high"
                          ? "warn"
                          : "default"
                    }
                  >
                    {c.severity} · {c.score}
                  </Badge>
                  {c.residualRiskAccepted && (
                    <Badge variant="warn">Residual accepted</Badge>
                  )}
                  <span className="text-xs text-muted">
                    {c.personName} · {c.role}
                  </span>
                </div>
                <p className="mt-1.5 font-medium">{c.title}</p>
                <p className="mt-1 text-xs text-muted">
                  <span className="text-fg">{c.labelA}</span>
                  {" × "}
                  <span className="text-fg">{c.labelB}</span>
                </p>
                <p className="mt-1 text-xs text-muted">{c.why}</p>
                <p className="mt-1 text-[11px] text-subtle">
                  Fraud path: {c.fraudPath}
                </p>
                {c.compensatingControls.length > 0 && (
                  <p className="mt-2 text-xs text-ok">
                    Compensate: {c.compensatingControls.join("; ")}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.linkedScenarioId && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-[11px]"
                      onClick={() => onNavigate?.("precog", c.linkedScenarioId)}
                    >
                      Precog scenario
                    </Button>
                  )}
                  {c.processIds[0] && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px]"
                      onClick={() => onNavigate?.("map", c.processIds[0])}
                    >
                      Process map
                    </Button>
                  )}
                </div>
              </div>
            ))}

            <div className="rounded-lg border border-border bg-panel p-3">
              <p className="text-xs font-medium tracking-wide text-subtle uppercase">
                Recommendations
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {report.recommendations.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {view === "matrix" && (
        <Card>
          <CardHeader>
            <CardTitle>Entitlement conflict matrix</CardTitle>
            <CardDescription>
              Red cells = incompatible pair in the rulebook (or duty-family matrix)
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="border-collapse text-[10px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface p-1 text-left text-muted">
                    Entitlement
                  </th>
                  {matrixIds.map((id) => (
                    <th
                      key={id}
                      className="max-w-[56px] p-1 text-left font-normal text-muted"
                      title={entLabel(id)}
                    >
                      <span className="inline-block max-w-[52px] origin-bottom-left -rotate-45 truncate">
                        {shortLabel(id).split(" ")[0]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixIds.map((row) => (
                  <tr key={row}>
                    <th
                      className="sticky left-0 z-10 max-w-[120px] truncate bg-surface p-1 text-left font-medium text-fg"
                      title={entLabel(row)}
                    >
                      {shortLabel(row)}
                    </th>
                    {matrixIds.map((col) => {
                      const cell = cellMap.get(`${row}|${col}`);
                      const status = cell?.status ?? "safe";
                      return (
                        <td key={col} className="p-0.5">
                          <span
                            className={cn(
                              "flex size-6 items-center justify-center rounded",
                              status === "self" && "bg-elevated text-subtle",
                              status === "safe" && "bg-ok/15 text-ok",
                              status === "conflict" &&
                                cell?.severity === "critical" &&
                                "bg-danger/40 text-danger",
                              status === "conflict" &&
                                cell?.severity === "high" &&
                                "bg-warn/40 text-warn",
                              status === "conflict" &&
                                (cell?.severity === "medium" ||
                                  cell?.severity === "family") &&
                                "bg-warn/20 text-warn",
                            )}
                            title={
                              status === "conflict"
                                ? `${entLabel(row)} × ${entLabel(col)} (${cell?.severity})`
                                : status === "self"
                                  ? "Same entitlement"
                                  : "Compatible"
                            }
                          >
                            {status === "conflict" ? "×" : status === "self" ? "·" : "✓"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="size-3 rounded bg-danger/40" /> Critical pair
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-3 rounded bg-warn/40" /> High / medium
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-3 rounded bg-ok/15" /> Compatible
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {view === "roles" && (
        <Card>
          <CardHeader>
            <CardTitle>Role → entitlement map</CardTitle>
            <CardDescription>
              Templates used for detection (demo practice). Conflicts fire when one person holds
              both sides of a rule.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.assignments.map((a) => {
              const n = report.conflicts.filter((c) => c.personId === a.personId).length;
              return (
                <div
                  key={a.personId}
                  className="rounded-xl border border-border bg-elevated px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{a.personName}</p>
                      <p className="text-xs text-muted">{a.role}</p>
                    </div>
                    <Badge variant={n > 0 ? "danger" : "ok"}>
                      {n} conflict{n === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {a.entitlements.map((e) => (
                      <li key={e}>
                        <Badge variant="default">{entLabel(e)}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function entLabel(id: string) {
  return ENTITLEMENTS.find((e) => e.id === id)?.label ?? id;
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
  tone: "danger" | "warn" | "ok" | "primary";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <Badge
          variant={
            tone === "danger"
              ? "danger"
              : tone === "warn"
                ? "warn"
                : tone === "ok"
                  ? "ok"
                  : "primary"
          }
        >
          {label}
        </Badge>
        <p className="mt-2 text-2xl font-semibold tabular">{value}</p>
        <p className="text-xs text-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}
