import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { buttonClass } from "@/components/ui/button-variants";
import { analyzeBinary, analyzeContinuous, analyzePrePost } from "@/lib/evidence/statistics";
import {
  getEvidenceModule,
  listBenchmarkStudies,
  listEvidenceModules,
} from "@/lib/evidence/reference-server";

export const Route = createFileRoute("/evidence")({
  component: StudyEvaluator,
  head: () => ({
    meta: [
      { title: "Study evaluator | BlakeGPT" },
      {
        name: "description",
        content: "Check study numbers, design flaws, and evidence grades.",
      },
    ],
  }),
});

type AnalysisTab = "binary" | "continuous" | "before-after";
type ModuleSummary = Awaited<ReturnType<typeof listEvidenceModules>>[number];
type Benchmark = Awaited<ReturnType<typeof listBenchmarkStudies>>[number];
type AnalysisResult =
  | ReturnType<typeof analyzeBinary>
  | ReturnType<typeof analyzeContinuous>
  | ReturnType<typeof analyzePrePost>;

const inputClass = "min-h-11 w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm";
const cardClass = "rounded-2xl border border-border bg-surface p-5 sm:p-6";
const ERROR_FALLBACK = "The analysis could not be loaded.";

function numberValue(value: string) {
  return value.trim() ? Number(value) : Number.NaN;
}

function format(value: number, digits = 2) {
  return Number.isFinite(value)
    ? value.toLocaleString("en-US", { maximumFractionDigits: digits })
    : "not finite";
}

function interval(value: { lower: number; upper: number } | null | undefined, scale = 1) {
  return value
    ? `${format(value.lower * scale)} to ${format(value.upper * scale)}`
    : "not available from these inputs";
}

function formatNnt(value: number | null, infinite: boolean) {
  return infinite ? "infinite" : value === null ? "not available" : format(value);
}

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let offset = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > offset) nodes.push(text.slice(offset, match.index));
    if (match[2]) {
      nodes.push(
        <a
          key={match.index}
          href={match[2]}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-2"
        >
          {match[1]}
        </a>,
      );
    } else if (match[3]) {
      nodes.push(<strong key={match.index}>{match[3]}</strong>);
    } else if (match[4]) {
      nodes.push(<em key={match.index}>{match[4]}</em>);
    } else if (match[5]) {
      nodes.push(<code key={match.index}>{match[5]}</code>);
    }
    offset = pattern.lastIndex;
  }
  if (offset < text.length) nodes.push(text.slice(offset));
  return nodes;
}

function isBlockStart(lines: string[], index: number) {
  const line = lines[index] ?? "";
  return (
    /^#{1,6}\s/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\|/.test(line) ||
    /^---+$/.test(line)
  );
}

function cells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function SafeMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 6);
      const text = inline(heading[2]);
      const className = "mt-5 font-semibold first:mt-0";
      blocks.push(
        level === 2 ? (
          <h2 key={index} className={className}>
            {text}
          </h2>
        ) : level === 3 ? (
          <h3 key={index} className={className}>
            {text}
          </h3>
        ) : level === 4 ? (
          <h4 key={index} className={className}>
            {text}
          </h4>
        ) : (
          <p key={index} className={className}>
            {text}
          </p>
        ),
      );
      index += 1;
      continue;
    }

    if (/^---+$/.test(line)) {
      index += 1;
      continue;
    }

    if (/^\|/.test(line) && /^\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")) {
      const header = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && /^\|/.test(lines[index].trim())) {
        rows.push(cells(lines[index]));
        index += 1;
      }
      blocks.push(
        <div key={index} className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={cellIndex} className="border-b border-border p-2 font-semibold">
                    {inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border-b border-border p-2 align-top">
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const unordered = /^\s*[-*+]\s+/.test(line);
    const ordered = /^\s*\d+[.)]\s+/.test(line);
    if (unordered || ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(unordered ? /^[-*+]\s+(.+)$/ : /^\d+[.)]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={index} className="my-3 list-inside list-disc space-y-1">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item)}</li>
          ))}
        </List>,
      );
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(
      <p key={index} className="my-3 text-sm leading-6 text-muted">
        {inline(paragraph.join(" "))}
      </p>,
    );
  }

  return <div className="space-y-1">{blocks}</div>;
}

function numberedSections(markdown: string, numbers: number[]) {
  const selected = new Set(numbers);
  const output: string[] = [];
  let include = false;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^(#{1,6})\s+(\d+)\.\s/);
    if (heading && heading[1].length <= 2) {
      include = selected.has(Number(heading[2]));
      if (include) output.push(line);
      continue;
    }
    if (include) output.push(line);
  }
  return output.join("\n").trim();
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "number",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "number" | "text";
}) {
  return (
    <label className="block text-sm font-medium" htmlFor={id}>
      {label}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} mt-1`}
      />
    </label>
  );
}

function StudyEvaluator() {
  const [tab, setTab] = useState<AnalysisTab>("binary");
  const [outcome, setOutcome] = useState("Specified outcome");
  const [timeHorizon, setTimeHorizon] = useState("12 weeks");
  const [eventType, setEventType] = useState<"harmful" | "beneficial">("harmful");
  const [randomized, setRandomized] = useState(true);
  const [treatmentEvents, setTreatmentEvents] = useState("10");
  const [treatmentN, setTreatmentN] = useState("100");
  const [controlEvents, setControlEvents] = useState("20");
  const [controlN, setControlN] = useState("100");
  const [treatmentMean, setTreatmentMean] = useState("10");
  const [treatmentSd, setTreatmentSd] = useState("2");
  const [controlMean, setControlMean] = useState("12");
  const [controlSd, setControlSd] = useState("2");
  const [unit, setUnit] = useState("points");
  const [baselineMean, setBaselineMean] = useState("20");
  const [followupMean, setFollowupMean] = useState("12");
  const [controlBaseline, setControlBaseline] = useState("21");
  const [controlFollowup, setControlFollowup] = useState("16");
  const [changeSd, setChangeSd] = useState("6");
  const [controlChangeSd, setControlChangeSd] = useState("5");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [referenceMarkdown, setReferenceMarkdown] = useState<Record<string, string>>({});
  const [loadingReference, setLoadingReference] = useState(false);
  const [referenceError, setReferenceError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      listEvidenceModules(),
      listBenchmarkStudies(),
      getEvidenceModule({ data: { id: "trial_standards" } }),
      getEvidenceModule({ data: { id: "misleading_reporting" } }),
      getEvidenceModule({ data: { id: "grading_rubric" } }),
    ])
      .then(([moduleList, studies, standards, reporting, rubric]) => {
        if (!active) return;
        setModules(moduleList);
        setBenchmarks(studies);
        setReferenceMarkdown({
          trial_standards: standards?.markdown ?? "",
          misleading_reporting: reporting?.markdown ?? "",
          grading_rubric: rubric?.markdown ?? "",
        });
      })
      .catch(() => {
        if (active) setReferenceError(ERROR_FALLBACK);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadModule(id: string) {
    if (referenceMarkdown[id]) return;
    setLoadingReference(true);
    setReferenceError("");
    try {
      const module = await getEvidenceModule({ data: { id } });
      if (module) setReferenceMarkdown((current) => ({ ...current, [id]: module.markdown }));
    } catch {
      setReferenceError(ERROR_FALLBACK);
    } finally {
      setLoadingReference(false);
    }
  }

  function calculate() {
    setError("");
    setResult(null);
    try {
      const meta = { outcome, timeHorizon, randomized };
      if (tab === "binary") {
        setResult(
          analyzeBinary({
            ...meta,
            eventType,
            treatment: { events: numberValue(treatmentEvents), n: numberValue(treatmentN) },
            control: { events: numberValue(controlEvents), n: numberValue(controlN) },
          }),
        );
      } else if (tab === "continuous") {
        setResult(
          analyzeContinuous({
            ...meta,
            unit,
            treatment: {
              mean: numberValue(treatmentMean),
              sd: numberValue(treatmentSd),
              n: numberValue(treatmentN),
            },
            control: {
              mean: numberValue(controlMean),
              sd: numberValue(controlSd),
              n: numberValue(controlN),
            },
          }),
        );
      } else {
        setResult(
          analyzePrePost({
            ...meta,
            unit,
            treatment: {
              baselineMean: numberValue(baselineMean),
              followupMean: numberValue(followupMean),
              n: numberValue(treatmentN),
              changeSd: changeSd.trim() ? numberValue(changeSd) : undefined,
            },
            control: {
              baselineMean: numberValue(controlBaseline),
              followupMean: numberValue(controlFollowup),
              n: numberValue(controlN),
              changeSd: controlChangeSd.trim() ? numberValue(controlChangeSd) : undefined,
            },
          }),
        );
      }
    } catch (calculationError) {
      setError(
        calculationError instanceof Error
          ? calculationError.message
          : "Enter valid numbers and try again.",
      );
    }
  }

  const binaryResult = result && "riskDifference" in result ? result : null;
  const continuousResult = result && "meanDifference" in result ? result : null;
  const prePostResult = result && "differenceInChanges" in result ? result : null;
  const prePostDifference = prePostResult?.differenceInChanges?.value;
  const studySections = referenceMarkdown.trial_standards
    ? numberedSections(referenceMarkdown.trial_standards, [3, 6])
    : "";

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 pt-8 pb-28 sm:px-8 sm:pt-12">
      <header className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <img
          src="/reverie/reverie-reading-book.webp"
          alt="Reverie reads a book while checking study evidence."
          width={512}
          height={468}
          loading="lazy"
          className="size-16 shrink-0 object-contain sm:size-20"
        />
        <div>
          <p className="border-l-2 border-coral pl-2 text-xs font-semibold tracking-[0.16em] text-muted uppercase">
            BlakeGPT
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Study evaluator</h1>
          <p className="mt-1 text-sm text-muted">
            Inspect reported numbers and the reasoning behind a study grade.
          </p>
        </div>
      </header>

      <section className={`${cardClass} mt-7`} aria-labelledby="numbers-heading">
        <h2 id="numbers-heading" className="text-xl font-semibold tracking-tight">
          Check the numbers
        </h2>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Analysis type">
          {(
            [
              ["binary", "Binary"],
              ["continuous", "Continuous"],
              ["before-after", "Before-and-after"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => {
                setTab(value);
                setResult(null);
                setError("");
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                tab === value
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border-strong bg-bg text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            id="study-outcome"
            label="Outcome"
            type="text"
            value={outcome}
            onChange={setOutcome}
          />
          <Field
            id="study-time"
            label="Time horizon"
            type="text"
            value={timeHorizon}
            onChange={setTimeHorizon}
          />
          {tab === "binary" ? (
            <>
              <Field
                id="treatment-events"
                label="Treatment events"
                value={treatmentEvents}
                onChange={setTreatmentEvents}
              />
              <Field
                id="treatment-n"
                label="Treatment n"
                value={treatmentN}
                onChange={setTreatmentN}
              />
              <Field
                id="control-events"
                label="Control events"
                value={controlEvents}
                onChange={setControlEvents}
              />
              <Field id="control-n" label="Control n" value={controlN} onChange={setControlN} />
              <label className="block text-sm font-medium" htmlFor="outcome-kind">
                Event type
                <select
                  id="outcome-kind"
                  className={`${inputClass} mt-1`}
                  value={eventType}
                  onChange={(event) =>
                    setEventType(event.target.value === "beneficial" ? "beneficial" : "harmful")
                  }
                >
                  <option value="harmful">Harmful</option>
                  <option value="beneficial">Beneficial</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={randomized}
                  onChange={(event) => setRandomized(event.target.checked)}
                />
                The study reports randomization
              </label>
            </>
          ) : tab === "continuous" ? (
            <>
              <Field
                id="treatment-mean"
                label="Treatment mean"
                value={treatmentMean}
                onChange={setTreatmentMean}
              />
              <Field
                id="treatment-sd"
                label="Treatment SD"
                value={treatmentSd}
                onChange={setTreatmentSd}
              />
              <Field
                id="control-mean"
                label="Control mean"
                value={controlMean}
                onChange={setControlMean}
              />
              <Field id="control-sd" label="Control SD" value={controlSd} onChange={setControlSd} />
              <Field id="study-unit" label="Unit" type="text" value={unit} onChange={setUnit} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={randomized}
                  onChange={(event) => setRandomized(event.target.checked)}
                />
                The study reports randomization
              </label>
            </>
          ) : (
            <>
              <Field
                id="baseline-mean"
                label="Treatment baseline mean"
                value={baselineMean}
                onChange={setBaselineMean}
              />
              <Field
                id="followup-mean"
                label="Treatment follow-up mean"
                value={followupMean}
                onChange={setFollowupMean}
              />
              <Field
                id="control-baseline"
                label="Control baseline mean"
                value={controlBaseline}
                onChange={setControlBaseline}
              />
              <Field
                id="control-followup"
                label="Control follow-up mean"
                value={controlFollowup}
                onChange={setControlFollowup}
              />
              <Field
                id="change-sd"
                label="Treatment change SD (optional)"
                value={changeSd}
                onChange={setChangeSd}
              />
              <Field
                id="control-change-sd"
                label="Control change SD (optional)"
                value={controlChangeSd}
                onChange={setControlChangeSd}
              />
              <Field id="study-unit" label="Unit" type="text" value={unit} onChange={setUnit} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={randomized}
                  onChange={(event) => setRandomized(event.target.checked)}
                />
                The study reports randomization
              </label>
            </>
          )}
        </div>
        <button type="button" onClick={calculate} className={`${buttonClass()} mt-5`}>
          Check these numbers
        </button>
        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-danger/40 p-3 text-sm">
            {error}
          </p>
        )}

        {binaryResult && (
          <div className="mt-5 space-y-4" aria-label="Binary analysis results">
            <div className="grid gap-4 sm:grid-cols-2">
              <article className={cardClass}>
                <h3 className="font-semibold">Absolute</h3>
                <p className="mt-2 text-sm">
                  {binaryResult.riskDifference.value === 0
                    ? "No observed difference per 1,000 people."
                    : `${format(Math.abs(binaryResult.riskDifference.eventsPer1000), 1)} ${
                        binaryResult.riskDifference.eventsPer1000 < 0 ? "fewer" : "more"
                      } per 1,000 people`}
                </p>
                <p className="mt-2 text-sm text-muted">
                  {format(binaryResult.riskDifference.percentagePoints, 2)} percentage points
                </p>
                <p className="mt-1 text-xs text-muted">
                  95% CI: {interval(binaryResult.riskDifference.ci95, 100)} percentage points
                </p>
              </article>
              <article className={cardClass}>
                <h3 className="font-semibold">Relative</h3>
                <p className="mt-2 text-sm">
                  {binaryResult.relativeRiskReductionPercent !== null
                    ? `${format(Math.abs(binaryResult.relativeRiskReductionPercent), 2)}% ${
                        binaryResult.relativeRiskReductionPercent >= 0
                          ? "lower risk"
                          : "higher risk"
                      }`
                    : binaryResult.relativeChangePercent === null
                      ? "Relative change is not available from these inputs."
                      : `${format(Math.abs(binaryResult.relativeChangePercent), 2)}% ${
                          binaryResult.relativeChangePercent > 0 ? "more" : "fewer"
                        } events relative to control`}
                </p>
                <p className="mt-2 text-sm text-muted">
                  Risk ratio:{" "}
                  {binaryResult.riskRatio.value === null
                    ? "not finite"
                    : format(binaryResult.riskRatio.value)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  95% CI: {interval(binaryResult.riskRatio.ci95)}
                </p>
              </article>
            </div>
            <p className="text-sm">
              Relative change can look large when the starting risk is small: here the risk went
              from {format(binaryResult.control.riskPercent)}% to{" "}
              {format(binaryResult.treatment.riskPercent)}%.
            </p>
            <p className="text-sm">
              {binaryResult.numberNeeded.label}:{" "}
              {binaryResult.numberNeeded.direction === "no observed difference"
                ? "point estimate is infinite"
                : `${binaryResult.numberNeeded.direction}; point estimate ${formatNnt(
                    binaryResult.numberNeeded.value,
                    binaryResult.numberNeeded.pointIsInfinite,
                  )}`}
              . Confidence set:{" "}
              {binaryResult.numberNeeded.confidenceSet.length
                ? binaryResult.numberNeeded.confidenceSet
                    .map(
                      (item) =>
                        `${item.direction} ${format(item.lower)} to ${
                          item.upperUnbounded || item.upper === null
                            ? "infinity"
                            : format(item.upper)
                        }`,
                    )
                    .join("; ")
                : "not available"}
              .
            </p>
            <p className="text-sm text-muted">{binaryResult.numberNeeded.interpretation}</p>
            <p className="text-sm">
              Odds ratio:{" "}
              {binaryResult.oddsRatio.value === null
                ? "not finite"
                : format(binaryResult.oddsRatio.value)}
              ; 95% CI: {interval(binaryResult.oddsRatio.ci95)}.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {binaryResult.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
        {continuousResult && (
          <div className="mt-5 space-y-3" aria-label="Continuous analysis results">
            <p className="text-sm">
              Mean difference (treatment minus control):{" "}
              {format(continuousResult.meanDifference.value)} {continuousResult.unit}; 95% CI:{" "}
              {interval(continuousResult.meanDifference.ci95)}.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {continuousResult.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
        {prePostResult && (
          <div className="mt-5 space-y-3" aria-label="Before-and-after analysis results">
            <p className="text-sm">
              Difference in changes:{" "}
              {prePostDifference === null || prePostDifference === undefined
                ? "not available"
                : `${format(prePostDifference)} ${prePostResult.unit}`}
              ; 95% CI: {interval(prePostResult.differenceInChanges?.ci95)}.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {prePostResult.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className={`${cardClass} mt-7`} aria-labelledby="flaws-heading">
        <h2 id="flaws-heading" className="text-xl font-semibold tracking-tight">
          Spot design flaws
        </h2>
        {studySections ? (
          <SafeMarkdown markdown={studySections} />
        ) : (
          <p className="mt-3 text-sm text-muted">
            {referenceError || "Loading the comparator audit and flaw-to-repair reference…"}
          </p>
        )}
        <h3 className="mt-6 font-semibold">Misleading reporting</h3>
        {referenceMarkdown.misleading_reporting ? (
          <SafeMarkdown markdown={referenceMarkdown.misleading_reporting} />
        ) : (
          <p className="mt-3 text-sm text-muted">
            {referenceError || "Loading the reporting audit…"}
          </p>
        )}
      </section>

      <section className={`${cardClass} mt-7`} aria-labelledby="grade-heading">
        <h2 id="grade-heading" className="text-xl font-semibold tracking-tight">
          Grade a study
        </h2>
        {referenceMarkdown.grading_rubric ? (
          <SafeMarkdown markdown={referenceMarkdown.grading_rubric} />
        ) : (
          <p className="mt-3 text-sm text-muted">
            {referenceError || "Loading the three-grade rubric…"}
          </p>
        )}
      </section>

      <section className={`${cardClass} mt-7`} aria-labelledby="examples-heading">
        <h2 id="examples-heading" className="text-xl font-semibold tracking-tight">
          Worked examples
        </h2>
        {benchmarks.length ? (
          <ol className="mt-4 space-y-4">
            {benchmarks.map((study, index) => (
              <li
                key={`${study.doi ?? study.pmid ?? study.title}-${index}`}
                className="border-t border-border pt-4"
              >
                <h3 className="font-semibold">{study.title}</h3>
                <p className="mt-1 text-xs text-muted">
                  {study.authors.join(", ")}
                  {study.date ? ` · ${study.date}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {study.doi && (
                    <a
                      href={`https://doi.org/${encodeURIComponent(study.doi)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      DOI {study.doi}
                    </a>
                  )}
                  {study.pmid && (
                    <a
                      href={`https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(study.pmid)}/`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      PMID {study.pmid}
                    </a>
                  )}
                </div>
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  {(["design", "results", "conclusions"] as const).map((dimension) => (
                    <div key={dimension} className="rounded-lg bg-elevated p-3">
                      <dt className="text-xs font-semibold capitalize">
                        {dimension}: {study.grades[dimension].grade}
                      </dt>
                      <dd className="mt-1 text-xs leading-5 text-muted">
                        {study.grades[dimension].rationale}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-muted">
            {referenceError || "Loading benchmark studies…"}
          </p>
        )}
      </section>

      <section className={`${cardClass} mt-7`} aria-labelledby="reference-heading">
        <h2 id="reference-heading" className="text-xl font-semibold tracking-tight">
          Reference
        </h2>
        {modules.length ? (
          <div className="mt-4 space-y-3">
            {modules.map((module) => (
              <details
                key={module.id}
                className="rounded-xl border border-border p-4"
                onToggle={(event) => {
                  if (event.currentTarget.open) void loadModule(module.id);
                }}
              >
                <summary className="cursor-pointer font-medium">{module.title}</summary>
                <p className="mt-2 text-xs leading-5 text-muted">{module.headings.join(" · ")}</p>
                {referenceMarkdown[module.id] ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <SafeMarkdown markdown={referenceMarkdown[module.id]} />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    {referenceError ||
                      (loadingReference ? "Loading reference…" : "Open to load this module.")}
                  </p>
                )}
              </details>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            {referenceError || "Loading reference modules…"}
          </p>
        )}
      </section>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 text-center text-xs text-muted backdrop-blur">
        Research aid, not medical advice.
      </footer>
    </main>
  );
}
