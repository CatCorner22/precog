import { METHOD_CAVEATS, lossPhrase, DETECTION_LABEL } from "@/lib/precog/evidence";
import type { ControlReportModel } from "@/lib/precog/report/build-control-report";
import { formatUsd } from "@/lib/utils";
import { count } from "@/lib/precog/text";
import { Section } from "@/components/precog/control-report-parts";

type EvidenceSectionProps = Pick<
  ControlReportModel,
  "evidence" | "citing" | "steps" | "lossRange" | "found" | "statsScope"
>;

/**
 * What the open gaps have cost other organizations, and the steps to take
 * first. The cases themselves are listed with their sources in the appendix
 * (ControlReportCaseAppendix), after the footer, so the body stays short.
 */
export function ControlReportEvidenceSection({
  evidence,
  citing,
  steps,
  lossRange,
  found,
  statsScope,
}: EvidenceSectionProps) {
  if (evidence.length === 0) return null;

  const caseById = new Map(evidence.map((c) => [c.id, c]));

  return (
    <Section title="What these gaps have cost other organizations">
      <p className="text-sm text-neutral-700">
        {citing.count > 0
          ? `${citing.count} prosecuted ${citing.count === 1 ? "case shows" : "cases show"} the open duty conflicts above${
              evidence.length > citing.count
                ? `; ${evidence.length - citing.count} more share their schemes`
                : ""
            }.`
          : `No case in the library shows these exact pairs, so no loss figure is given for them; the ${evidence.length} listed share their schemes.`}
        {lossRange
          ? ` Of the ${statsScope.count} cases that show these gaps, ${lossRange.n} state a loss: median ${formatUsd(lossRange.median)}, from ${formatUsd(lossRange.low)} to ${formatUsd(lossRange.high)}${
              statsScope.floors > 0
                ? `; ${count(statsScope.floors, "of those figures is", "of those figures are")} only a floor ("at least"), so the median understates the loss`
                : ""
            }.`
          : ""}
        {found.known > 0
          ? ` How they came to light, where the source says: ${found.byRoute
              .map((r) => `${DETECTION_LABEL[r.route].toLowerCase()} (${r.count})`)
              .join(", ")}.`
          : ""}
        {found.n > 0 ? ` Not stated in the source: ${found.unknown} of ${found.n}.` : ""}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">
        These describe other organizations, not this business, and these are prosecuted cases, so
        they leave out small thefts. They are a reference class, not a forecast. The{" "}
        {count(evidence.length, "case")} and{" "}
        {evidence.length === 1 ? "its source" : "their sources"} are listed in the appendix.
      </p>

      <h3 className="mt-4 text-sm font-semibold text-neutral-800">Do these first</h3>
      <p className="text-xs text-neutral-500">
        Ordered first by how many of the open findings each one answers, then by how many of the
        matching cases it would plausibly have caught, in our reading of the record. That reading is
        ours, not a finding from any case.
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
                    {c.lossUsd > 0 ? ` (${lossPhrase(c)})` : ""}
                  </li>
                ) : null;
              })}
            </ul>
          </li>
        ))}
      </ol>
      <ul className="mt-3 space-y-1 text-xs text-neutral-500">
        {METHOD_CAVEATS.slice(0, 3).map((c) => (
          <li key={c}>· {c}</li>
        ))}
      </ul>
    </Section>
  );
}

/** Every case the report draws on, with its source, on its own printed page after the footer. */
export function ControlReportCaseAppendix({ evidence }: Pick<ControlReportModel, "evidence">) {
  if (evidence.length === 0) return null;
  return (
    <section className="mt-10 break-before-page">
      <h2 className="mb-2 border-b border-neutral-300 pb-1 text-sm font-semibold tracking-wide text-neutral-800 uppercase">
        Appendix: cases cited
      </h2>
      <p className="text-xs text-neutral-500">
        Matched to the open gaps in our reading of the record; the business&apos;s own line of
        business first.
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-neutral-600">
        {evidence.map((c) => (
          <li key={c.id}>
            {c.title}
            {c.resolvedYear ? ` (${c.resolvedYear})` : ""} — {c.source.publisher},{" "}
            <span className="break-all">{c.source.url}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
