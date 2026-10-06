import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import {
  allCasesUnverified,
  caseForRule,
  caseIsVerified,
  DETECTION_LABEL,
  durationPhrase,
  lossPhrase,
  NO_CASE_FOR_RULE,
  SECTOR_LABEL,
  UNVERIFIED_CASE,
  VERIFIED_CASE,
  type CaseStudy,
} from "@/lib/precog/evidence";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
            <Badge variant="default">{SECTOR_LABEL[study.sector]}</Badge>
            <CaseMarker study={study} />
            {hasLoss && (
              <span className="font-mono text-sm font-semibold text-danger">
                {lossPhrase(study)}
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
              how the theft came to light, the card names that route below.
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
            <span>How it came to light: {DETECTION_LABEL[study.detection]}</span>
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
 * A marker's words: the chip shows the label, and a screen reader hears the
 * label and its explanation as one sentence, in sentence case, with no stray
 * punctuation ahead of the explanation.
 */
function MarkerText({ label, title }: { label: string; title: string }) {
  return (
    <>
      <span aria-hidden>{label}</span>
      <span className="sr-only normal-case">{`${label}. ${title}`}</span>
    </>
  );
}

/** The small, quiet "Unverified" chip on a case nobody has checked against its source. */
export function UnverifiedMarker() {
  return (
    <span
      title={UNVERIFIED_CASE.title}
      className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-subtle"
    >
      <MarkerText label={UNVERIFIED_CASE.label} title={UNVERIFIED_CASE.title} />
    </span>
  );
}

/**
 * The one note above a list of several cases when none of them has been
 * checked against its source, so the list says it once. A single case, or a
 * list with any verified case, shows no note; each card's own marker carries
 * it.
 */
export function UnverifiedListNote({
  studies,
  className,
}: {
  studies: readonly Pick<CaseStudy, "verifiedOn" | "verifiedBy">[];
  className?: string;
}) {
  if (studies.length < 2 || !allCasesUnverified(studies)) return null;
  return <p className={cn("text-xs text-subtle", className)}>{UNVERIFIED_CASE.listNote}</p>;
}

/** The small "Verified against its source" marker on a case a named person has checked. */
export function VerifiedMarker({ study }: { study: Pick<CaseStudy, "verifiedOn" | "verifiedBy"> }) {
  const title = VERIFIED_CASE.title(study.verifiedOn ?? "", study.verifiedBy ?? "");
  return (
    <span
      title={title}
      className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-subtle"
    >
      <MarkerText label={VERIFIED_CASE.label} title={title} />
    </span>
  );
}

/** Exactly one of the two markers: verified once a named person has checked the record. */
export function CaseMarker({ study }: { study: Pick<CaseStudy, "verifiedOn" | "verifiedBy"> }) {
  return caseIsVerified(study) ? <VerifiedMarker study={study} /> : <UnverifiedMarker />;
}

/**
 * The case beside one duty conflict, under a heading that says what it is.
 *
 * Only a case that cites the rule is shown: it shows the very pair of duties
 * the finding names, so it sits under "This arrangement". Given the owner's
 * line of business, a citing case from that line leads (a dentist reads a
 * dental case differently from a construction one) and the heading says so.
 * When no case cites the rule, the card says so in one line instead of
 * showing a case that only shares a scheme, so the page never claims more
 * than the record shows.
 */
export function RuleCaseCard({
  ruleId,
  industryId,
  className,
}: {
  ruleId: string;
  industryId?: string;
  className?: string;
}) {
  const pick = caseForRule(ruleId, industryId);
  if (!pick?.citesRule) {
    return <p className={cn("text-xs text-subtle", className)}>{NO_CASE_FOR_RULE}</p>;
  }
  return (
    <div className={className}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
        {pick.ownSector
          ? "This arrangement, in your line of business"
          : "This arrangement, somewhere real"}
      </p>
      <CaseCard study={pick.study} />
    </div>
  );
}
