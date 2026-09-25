import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { caseForRule, durationPhrase, type CaseStudy } from "@/lib/precog/evidence";
import { Badge } from "@/components/ui/badge";
import { cn, formatUsd } from "@/lib/utils";

const SECTOR_LABEL: Record<string, string> = {
  dental: "Dental practice",
  medical: "Medical practice",
  restaurant: "Restaurant",
  construction: "Construction",
  "professional-services": "Professional services",
  retail: "Retail",
  nonprofit: "Nonprofit",
  trades: "Trades / home services",
  any: "Any business",
};

const DETECTION_LABEL: Record<string, string> = {
  tip: "Someone spoke up",
  "owner-review": "The owner looked",
  "external-audit": "Outside audit",
  "bank-or-insurer": "Bank or insurer flagged it",
  "law-enforcement": "Law enforcement",
  "by-accident": "By accident",
  cover: "Someone else covered the desk",
  reconciliation: "A reconciliation caught it",
  unknown: "Not stated in the source",
};

/**
 * Renders one real case.
 *
 * The card leads with the amount and the time it ran, because those two
 * numbers are what make an abstract control recommendation land. Everything
 * else is collapsed until asked for.
 */
export function CaseCard({ study }: { study: CaseStudy }) {
  const [open, setOpen] = useState(false);
  const hasLoss = study.lossUsd > 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-panel/60 transition-colors",
        open && "border-border-strong",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="default">{SECTOR_LABEL[study.sector] ?? study.sector}</Badge>
            {hasLoss && (
              <span className="font-mono text-sm font-semibold text-danger">
                {study.lossIsFloor ? "at least " : ""}
                {formatUsd(study.lossUsd)}
              </span>
            )}
            {study.durationMonths ? (
              <span className="text-xs text-muted">
                over {durationPhrase(study.durationMonths)}
              </span>
            ) : null}
          </div>
          <p className="text-sm font-medium leading-snug text-fg">{study.title}</p>
        </div>
        <ChevronDown
          className={cn(
            "mt-0.5 size-4 shrink-0 text-subtle transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-4 pb-4 pt-3 text-sm">
          <Section title="What happened">
            <p className="leading-relaxed text-muted">{study.howItWorked}</p>
          </Section>

          <Section title="The gap that allowed it">
            <p className="leading-relaxed text-muted">{study.controlGap}</p>
          </Section>

          <Section title="What we think would have caught it">
            <p className="mb-1.5 text-xs text-subtle">
              Our reading of the public record, not a finding from the case. Where the source says
              how the theft was found, that route is shown below.
            </p>
            <ul className="space-y-1.5">
              {study.wouldHaveCaughtIt.map((step, i) => (
                // A case may phrase one control more than one way, so the
                // control id alone is not a unique key.
                <li key={`${step.control}-${i}`} className="flex gap-2 leading-relaxed text-muted">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{step.asApplied}</span>
                </li>
              ))}
            </ul>
          </Section>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-subtle">
            <span>How it was found: {DETECTION_LABEL[study.detection] ?? study.detection}</span>
            {typeof study.tenureYearsStated === "number" ? (
              <span>
                Time with the employer:{" "}
                {study.tenureYearsStated === 0
                  ? "under a year"
                  : `${study.tenureYearsStated} years`}
              </span>
            ) : null}
            {study.resolvedYear ? <span>Case resolved {study.resolvedYear}</span> : null}
          </div>

          {study.caveat && (
            <p className="rounded border border-border bg-elevated/50 p-3 text-xs leading-relaxed text-subtle">
              <span className="font-medium text-muted">Note on the figures. </span>
              {study.caveat}
            </p>
          )}

          <a
            href={study.source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            {study.source.publisher}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</p>
      {children}
    </div>
  );
}

/**
 * The case beside one duty conflict, under a heading that says what it is.
 *
 * A case that cites the rule shows the very pair of duties the finding names,
 * so it sits under "This arrangement". When no case cites the rule the most
 * relevant case that shares a scheme is shown instead, and the heading says it
 * is a related scheme, so the page never claims more than the record shows.
 * Renders nothing when the library holds no match at all.
 */
export function RuleCaseCard({ ruleId, className }: { ruleId: string; className?: string }) {
  const pick = caseForRule(ruleId);
  if (!pick) return null;
  return (
    <div className={className}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
        {pick.citesRule ? "This arrangement, somewhere real" : "A related scheme, somewhere real"}
      </p>
      <CaseCard study={pick.study} />
    </div>
  );
}
