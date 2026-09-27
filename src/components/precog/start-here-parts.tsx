import { useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { detectionBreakdown, isOwnSector, type SchemeKind } from "@/lib/precog/evidence";
import type { StartHereModel } from "@/lib/precog/start-here/model";
import { Badge } from "@/components/ui/badge";
import { CaseCard } from "./case-card";
import { SCHEME_ORDER, SCHEME_PHRASE } from "./start-here-copy";

/** The filter chips: every case, the cases that show a gap on this page, or one scheme shape. */
type CaseFilter = SchemeKind | "all" | "citing";

/**
 * Every case behind the page. Cases whose records show one of the open gaps
 * lead and carry a mark; the rest share a scheme with a gap and follow.
 */
export function EvidenceFooter({ model }: { model: StartHereModel["footer"] }) {
  const { cases, citingIds, industryId } = model;
  /**
   * Filter by the shape of the scheme. A case can carry more than one shape
   * (a forged check hidden by a doctored statement), so the counts on the
   * chips can add to more than the number of cases; each chip counts the
   * cases that carry that shape.
   */
  const [filter, setFilter] = useState<CaseFilter>("all");
  if (cases.length === 0) return null;
  const shapes = SCHEME_ORDER.map((k) => ({
    kind: k,
    count: cases.filter((c) => c.schemes.includes(k)).length,
  })).filter((s) => s.count > 0);
  const citingCount = cases.filter((c) => citingIds.has(c.id)).length;
  const shown =
    filter === "all"
      ? cases
      : filter === "citing"
        ? cases.filter((c) => citingIds.has(c.id))
        : cases.filter((c) => c.schemes.includes(filter));
  // Cases that show a gap on this page lead. Within each group, cases from the
  // reader's own trade come first, because they land harder; the rest stay,
  // because the mechanism of a scheme does not change between industries.
  const rank = (c: (typeof cases)[number]) =>
    (citingIds.has(c.id) ? 0 : 2) + (isOwnSector(c, industryId) ? 0 : 1);
  const ordered = [...shown].sort((a, b) => rank(a) - rank(b));
  // Counted over the cases listed here, so the note matches the list.
  const found = detectionBreakdown(ordered);
  return (
    <section className="space-y-3">
      <SectionHeading
        title="Every case behind this page"
        subtitle="Open any one to read what happened and confirm it at the source. Filter by how the money was taken."
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter cases">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All ({cases.length})
        </FilterChip>
        {citingCount > 0 && citingCount < cases.length && (
          <FilterChip active={filter === "citing"} onClick={() => setFilter("citing")}>
            Show a gap on this page ({citingCount})
          </FilterChip>
        )}
        {shapes.map((s) => (
          <FilterChip key={s.kind} active={filter === s.kind} onClick={() => setFilter(s.kind)}>
            {SCHEME_PHRASE[s.kind]} ({s.count})
          </FilterChip>
        ))}
      </div>
      <p className="text-xs text-subtle">
        {`Each card's "what would have caught it" is our reading of the record. The source states how the theft was found in ${found.known} of ${found.n} ${found.n === 1 ? "case" : "cases"}; in the other ${found.unknown} it does not say.`}
      </p>
      <div className="space-y-2">
        {ordered.map((c) => (
          <div key={c.id} className="space-y-1">
            {citingIds.has(c.id) && <Badge variant="primary">Shows a gap on this page</Badge>}
            <CaseCard study={c} />
          </div>
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

/**
 * One figure with its label. `detail` names the source and links to it when
 * `href` is given; `caveat` is the source's own warning about reading it.
 */
export function StatTile({
  label,
  value,
  detail,
  href,
  caveat,
}: {
  label: string;
  value: string;
  detail?: string;
  href?: string;
  caveat?: string;
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
      {caveat && <p className="mt-2 text-xs leading-relaxed text-subtle">{caveat}</p>}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted hover:border-border-strong"
      }`}
    >
      {children}
    </button>
  );
}
