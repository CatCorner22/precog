import { METHOD_CAVEATS } from "@/lib/precog/evidence";
import type { ControlReportModel } from "@/lib/precog/report/build-control-report";
import { formatUsd } from "@/lib/utils";
import { REPORT_DETECTION } from "@/components/precog/control-report-helpers";
import { Section } from "@/components/precog/control-report-parts";

type EvidenceSectionProps = Pick<
  ControlReportModel,
  "evidence" | "citing" | "steps" | "lossRange" | "found"
>;

export function ControlReportEvidenceSection({
  evidence,
  citing,
  steps,
  lossRange,
  found,
}: EvidenceSectionProps) {
  if (evidence.length === 0) return null;

  const caseById = new Map(evidence.map((c) => [c.id, c]));

  return (
    <Section title="What these gaps have cost other businesses">
      <p className="text-sm text-neutral-700">
        {citing.count > 0
          ? `${citing.count} prosecuted ${citing.count === 1 ? "case shows" : "cases show"} the open duty conflicts above${
              evidence.length > citing.count
                ? `; ${evidence.length - citing.count} more share their schemes`
                : ""
            }.`
          : `No prosecuted case in the library shows these exact conflicts; the ${evidence.length} below share their schemes.`}
        {lossRange
          ? ` Median loss ${formatUsd(lossRange.median)}, from ${formatUsd(lossRange.low)} to ${formatUsd(lossRange.high)} across ${lossRange.n} cases with a stated figure.`
          : ""}
        {found.known > 0
          ? ` How they came to light, where the source says: ${found.byRoute
              .map((r) => `${(REPORT_DETECTION[r.route] ?? r.route).toLowerCase()} (${r.count})`)
              .join(", ")}.`
          : ""}
        {found.n > 0 ? ` Not stated in the source: ${found.unknown} of ${found.n}.` : ""}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">
        These describe other organizations, not this business, and they are prosecuted cases, so
        small thefts are absent. They are a reference class, not a forecast.
      </p>

      <h3 className="mt-4 text-sm font-semibold text-neutral-800">Do these first</h3>
      <p className="text-xs text-neutral-500">
        Ordered by how many of the matching cases each control would plausibly have caught, in our
        reading of the record. That reading is ours, not a finding from any case.
      </p>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
        {steps.map((st) => (
          <li key={st.control.id}>
            <span className="font-medium">{st.control.label}</span>
            <span className="text-neutral-600"> — {st.control.why}</span>
            <ul className="mt-1 list-disc pl-5 text-xs text-neutral-600">
              {st.supportingCaseIds.map((id) => {
                const c = caseById.get(id);
                return c ? (
                  <li key={id}>
                    {c.title}
                    {c.lossUsd > 0
                      ? ` (${c.lossIsFloor ? "at least " : ""}${formatUsd(c.lossUsd)})`
                      : ""}
                  </li>
                ) : null;
              })}
            </ul>
          </li>
        ))}
      </ol>

      <h3 className="mt-4 text-sm font-semibold text-neutral-800">
        Cases cited, matched to these gaps in our reading of the record
      </h3>
      <ul className="mt-1 space-y-1 text-xs text-neutral-600">
        {evidence.map((c) => (
          <li key={c.id}>
            {c.title}
            {c.resolvedYear ? ` (${c.resolvedYear})` : ""} — {c.source.publisher},{" "}
            <span className="break-all">{c.source.url}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-3 space-y-1 text-xs text-neutral-500">
        {METHOD_CAVEATS.slice(0, 3).map((c) => (
          <li key={c}>· {c}</li>
        ))}
      </ul>
    </Section>
  );
}
