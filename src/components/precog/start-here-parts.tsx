import { useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import {
  detectionBreakdown,
  isOwnSector,
  type CaseStudy,
  type SchemeKind,
} from "@/lib/precog/evidence";
import { CaseCard } from "./case-card";
import { SCHEME_ORDER, SCHEME_PHRASE } from "./start-here-copy";

export function EvidenceFooter({ cases, industryId }: { cases: CaseStudy[]; industryId: string }) {
  /**
   * Filter by the shape of the scheme. A case can carry more than one shape
   * (a forged check hidden by a doctored statement), so the counts on the
   * chips can add to more than the number of cases; each chip counts the
   * cases that carry that shape.
   */
  const [scheme, setScheme] = useState<SchemeKind | "all">("all");
  if (cases.length === 0) return null;
  const shapes = SCHEME_ORDER.map((k) => ({
    kind: k,
    count: cases.filter((c) => c.schemes.includes(k)).length,
  })).filter((s) => s.count > 0);
  const shown = scheme === "all" ? cases : cases.filter((c) => c.schemes.includes(scheme));
  // Cases from the reader's own trade lead, because they land harder. The rest
  // stay, because the mechanism of a scheme does not change between industries
  // and the mechanism is the part worth learning.
  const ordered = [
    ...shown.filter((c) => isOwnSector(c, industryId)),
    ...shown.filter((c) => !isOwnSector(c, industryId)),
  ];
  const chipClass = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs transition-colors ${
      active
        ? "border-primary bg-primary/10 text-primary"
        : "border-border text-muted hover:border-border-strong"
    }`;
  return (
    <section className="space-y-3">
      <SectionHeading
        title="Every case behind this page"
        subtitle="Open any one to read what happened and confirm it at the source. Filter by how the money was taken."
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter cases by scheme">
        <button
          type="button"
          aria-pressed={scheme === "all"}
          className={chipClass(scheme === "all")}
          onClick={() => setScheme("all")}
        >
          All ({cases.length})
        </button>
        {shapes.map((s) => (
          <button
            key={s.kind}
            type="button"
            aria-pressed={scheme === s.kind}
            className={chipClass(scheme === s.kind)}
            onClick={() => setScheme(s.kind)}
          >
            {SCHEME_PHRASE[s.kind]} ({s.count})
          </button>
        ))}
      </div>
      <p className="text-xs text-subtle">
        {(() => {
          // Counted over the cases listed here, so the footer matches the list.
          const found = detectionBreakdown(ordered);
          return `Each card's "what would have caught it" is our reading of the record. The source states how the theft was found in ${found.known} of ${found.n} ${found.n === 1 ? "case" : "cases"}; in the other ${found.unknown} it does not say.`;
        })()}
      </p>
      <div className="space-y-2">
        {ordered.map((c) => (
          <CaseCard key={c.id} study={c} />
        ))}
      </div>
    </section>
  );
}

export function SectionHeading({
  icon,
  title,
  subtitle,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-0.5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {icon}
        {title}
      </h2>
      {subtitle && <p className="text-xs text-subtle">{subtitle}</p>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string;
  detail?: string;
  href?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel/60 p-4">
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold tracking-tight">{value}</p>
      {detail &&
        (href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {detail}
            <ExternalLink className="size-2.5" aria-hidden />
          </a>
        ) : (
          <p className="mt-1 text-xs text-subtle">{detail}</p>
        ))}
    </div>
  );
}
