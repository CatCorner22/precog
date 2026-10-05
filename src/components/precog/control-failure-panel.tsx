import { useMemo, useState } from "react";
import { ShieldOff } from "lucide-react";
import {
  caseIsVerified,
  DETECTION_LABEL,
  lossPhrase,
  UNVERIFIED_CASE,
} from "@/lib/precog/evidence";
import { usePractice } from "@/lib/precog/practice-context";
import {
  evaluateControlFailure,
  SAFEGUARDS,
  type FailureTarget,
} from "@/lib/precog/scoring/control-failure";
import { confirmedScenarioIds, withOwnScenarioWording } from "@/lib/precog/scoring/scope";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";

export function ControlFailurePanel() {
  const { profile, template: baseTemplate } = usePractice();
  const template = useMemo(() => withOwnScenarioWording(baseTemplate), [baseTemplate]);
  const targets = useMemo<FailureTarget[]>(
    () => [
      ...SAFEGUARDS.map(({ id }) => ({ kind: "safeguard" as const, id })),
      ...template.controls.map(({ id }) => ({ kind: "control" as const, id })),
    ],
    [template.controls],
  );
  const [selectedKey, setSelectedKey] = useState("safeguard:dual_release");
  const target = targets.find((item) => targetKey(item) === selectedKey) ?? targets[0];
  const confirmed = useMemo(
    () => confirmedScenarioIds(profile.decisions, profile.industry),
    [profile.decisions, profile.industry],
  );
  const report = useMemo(
    () =>
      evaluateControlFailure(template, target, {
        staff: profile.staff,
        riskVariables: profile.riskVariables,
        dualRelease: profile.dualRelease,
        confirmedScenarioIds: confirmed,
      }),
    [template, target, profile.staff, profile.riskVariables, profile.dualRelease, confirmed],
  );

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <Badge variant={report.mode === "failure" ? "accent" : "warn"}>
          {report.mode === "failure"
            ? "In place today — what happens if it stops"
            : "Missing today — what the gap costs"}
        </Badge>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <ShieldOff className="size-5 text-primary" />
          If a control fails
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">{report.headline}</p>
        <p className="mt-2 max-w-2xl text-xs text-subtle">
          This is a what-if using Precog&apos;s model. It does not change or save your business
          profile.
        </p>
      </section>

      <Card>
        <CardContent className="p-5">
          <label
            htmlFor="control-failure-target"
            className="mb-1.5 block text-xs font-medium text-subtle"
          >
            Control or safeguard
          </label>
          <select
            id="control-failure-target"
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.target.value)}
            className="min-h-10 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-fg"
          >
            <optgroup label="Safeguards">
              {SAFEGUARDS.map((item) => (
                <option key={item.id} value={`safeguard:${item.id}`}>
                  {item.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Your controls">
              {template.controls.map((control) => (
                <option key={control.id} value={`control:${control.id}`}>
                  {control.name}
                  {control.starter ? " · sample, not confirmed" : ""}
                </option>
              ))}
            </optgroup>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-5">
          <PanelSection title="Scenario figures">
            <p className="mb-2 text-xs text-subtle">
              Retained loss, days until found, and annual cost of risk.
            </p>
            {report.scenarios.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="text-xs text-subtle">
                    <tr>
                      <th scope="col" className="pb-2 pr-4 font-medium">
                        Scenario
                      </th>
                      <th scope="col" className="pb-2 pr-4 font-medium">
                        With it
                      </th>
                      <th scope="col" className="pb-2 font-medium">
                        Without it
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.scenarios.map((scenario) => (
                      <tr key={scenario.id}>
                        <th scope="row" className="py-3 pr-4 align-top font-medium">
                          {scenario.title}
                        </th>
                        <td className="py-3 pr-4 align-top">
                          <ScenarioFigures figures={scenario.withIt} />
                        </td>
                        <td className="py-3 align-top">
                          <ScenarioFigures figures={scenario.withoutIt} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">No in-scope scenario figures move.</p>
            )}
          </PanelSection>

          {report.linkedScenarios.length > 0 && (
            <PanelSection title="Related scenarios">
              <ul className="space-y-2 text-sm">
                {report.linkedScenarios.map((scenario) => (
                  <li key={scenario.id} className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{scenario.title}</span>
                    <span className="text-xs text-muted">
                      Retained loss {formatUsd(scenario.retainedExpected)} · {scenario.p50Days} days
                      until found
                    </span>
                  </li>
                ))}
              </ul>
            </PanelSection>
          )}

          <PanelSection title="Average residual risk">
            {report.scored ? (
              <>
                <p className="tabular text-lg font-semibold">
                  {report.residual.withIt} → {report.residual.withoutIt}
                  <span className="ml-1 text-xs font-normal text-subtle">out of 100</span>
                </p>
                {report.residual.rows.length > 0 && (
                  <ul className="mt-2 space-y-1.5 text-sm text-muted">
                    {report.residual.rows.map((row) => (
                      <li key={row.id} className="flex justify-between gap-4">
                        <span>{row.name}</span>
                        <span className="tabular">
                          {row.withIt} → {row.withoutIt}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">
                This sample control is not counted until you confirm it runs here.
              </p>
            )}
          </PanelSection>

          <PanelSection
            title={
              report.mode === "failure"
                ? "Duty conflicts that lose a control in place"
                : "Duty conflicts it would cover"
            }
          >
            {report.findings.length ? (
              <ul className="space-y-3">
                {report.findings.map((finding) => (
                  <li key={finding.id}>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium">{finding.title}</span>
                      <Badge variant="warn">{finding.severity}</Badge>
                      <span className="text-xs text-muted">{finding.personName}</span>
                    </div>
                    <p className="mt-1 text-xs text-subtle">{finding.lostInPlace.join(" · ")}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                {report.mode === "failure"
                  ? "No duty conflict loses a control in place."
                  : "No duty conflict would gain a control in place."}
              </p>
            )}
          </PanelSection>

          <PanelSection title="Processes exposed">
            {report.processes.length ? (
              <ul className="space-y-2 text-sm">
                {report.processes.map((process) => (
                  <li key={process.id} className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{process.name}</span>
                    <Badge variant={process.via === "control" ? "accent" : "default"}>
                      {process.via === "control"
                        ? "Uses this control"
                        : "Depends on an exposed process"}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No linked process is exposed.</p>
            )}
          </PanelSection>

          <PanelSection title="Real cases where this was missing">
            {report.cases.count > 0 && (
              <p className="mb-2 text-xs text-subtle">
                {report.cases.count} {report.cases.count === 1 ? "case" : "cases"} in Precog&apos;s
                library
              </p>
            )}
            {report.cases.examples.length ? (
              <ul className="space-y-3">
                {report.cases.examples.map((study) => (
                  <li key={study.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{study.title}</span>
                      <Badge
                        variant={caseIsVerified(study) ? "ok" : "warn"}
                        title={caseIsVerified(study) ? undefined : UNVERIFIED_CASE.title}
                      >
                        {caseIsVerified(study)
                          ? "Verified against its source"
                          : UNVERIFIED_CASE.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {study.lossUsd > 0 ? lossPhrase(study) : "Loss not stated"} ·{" "}
                      {DETECTION_LABEL[study.detection]}
                    </p>
                    <a
                      href={study.source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-flex text-xs text-primary hover:underline"
                    >
                      {study.source.publisher}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No related case is listed in the library.</p>
            )}
          </PanelSection>

          <PanelSection title="Other safeguards still in place">
            {report.stillInPlace.length ? (
              <ul className="flex flex-wrap gap-2">
                {report.stillInPlace.map((item) => (
                  <li key={item}>
                    <Badge variant="ok">{item}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No other safeguard is marked in place.</p>
            )}
          </PanelSection>

          {report.notes.length > 0 && (
            <PanelSection title="Notes">
              <ul className="space-y-2 text-sm text-muted">
                {report.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </PanelSection>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t border-border pt-4 first:border-0 first:pt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function targetKey(target: FailureTarget): string {
  return `${target.kind}:${target.id}`;
}

function ScenarioFigures({
  figures,
}: {
  figures: { retainedExpected: number; p50Days: number; expectedAnnualCostOfRisk: number };
}) {
  return (
    <div className="space-y-1 text-xs text-muted">
      <p>Retained loss: {formatUsd(figures.retainedExpected)}</p>
      <p>Days until found: {figures.p50Days}</p>
      <p>Annual cost of risk: {formatUsd(figures.expectedAnnualCostOfRisk)}</p>
    </div>
  );
}
