import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { listLicenseReferencesFn } from "@/lib/licenses/reference-server";
import type { LicenseBlock, LicenseReference } from "@/lib/licenses/types";

export const Route = createFileRoute("/licenses")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  loader: () => listLicenseReferencesFn(),
  component: LicensesRoute,
  head: () => ({
    meta: [
      { title: "Each license | BlakeGPT" },
      {
        name: "description",
        content: "What each Tennessee dental license allows, with cited rules and cautions.",
      },
    ],
  }),
});

function LicensesRoute() {
  const { tab } = Route.useSearch();
  return <LicenseReferencePage entries={Route.useLoaderData()} initialTab={tab} />;
}

export function LicenseReferencePage({
  entries,
  initialTab,
}: {
  entries: LicenseReference[];
  initialTab?: string;
}) {
  const [selectedId, setSelectedId] = useState(
    initialTab && entries.some((entry) => entry.id === initialTab)
      ? initialTab
      : (entries[0]?.id ?? ""),
  );
  const [treatmentFilter, setTreatmentFilter] = useState("");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!initialTab) return;
    setSelectedId(
      entries.some((entry) => entry.id === initialTab) ? initialTab : (entries[0]?.id ?? ""),
    );
  }, [entries, initialTab]);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % entries.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + entries.length) % entries.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = entries.length - 1;
    if (nextIndex === undefined || !entries[nextIndex]) return;
    event.preventDefault();
    setSelectedId(entries[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 pt-8 pb-8 sm:px-8 sm:pt-12">
      <header className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <img
          src="/reverie/reverie-dental.webp"
          alt="Reverie, the dental compliance cat"
          width={512}
          height={512}
          loading="lazy"
          className="size-16 shrink-0 object-contain sm:size-20"
        />
        <div>
          <p className="border-l-2 border-coral pl-2 text-xs font-semibold tracking-[0.16em] text-muted uppercase">
            BlakeGPT
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Each license</h1>
          <p className="mt-1 text-sm text-muted">
            Tennessee dental license scope, source rules, and treatment cautions.
          </p>
        </div>
      </header>

      <div
        className="-mx-1 mt-6 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-2 sm:flex-wrap sm:overflow-visible"
        role="tablist"
        aria-label="Tennessee dental licenses"
        aria-orientation="horizontal"
      >
        {entries.map((entry, index) => {
          const selected = selectedId === entry.id;
          return (
            <button
              key={entry.id}
              ref={(button) => {
                tabRefs.current[index] = button;
              }}
              id={`license-tab-${entry.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`license-panel-${entry.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setSelectedId(entry.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`shrink-0 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                selected
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border-strong bg-bg text-muted hover:bg-elevated"
              }`}
            >
              {entry.tabLabel}
            </button>
          );
        })}
      </div>

      {entries.map((entry) => (
        <section
          key={entry.id}
          id={`license-panel-${entry.id}`}
          role="tabpanel"
          aria-labelledby={`license-tab-${entry.id}`}
          tabIndex={0}
          hidden={selectedId !== entry.id}
          className="mt-4 rounded-2xl border border-border bg-surface p-5 sm:p-7"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight">{entry.title}</h2>
            <span className="rounded-full border border-border bg-elevated px-3 py-1 text-xs font-medium text-muted">
              Last verified {entry.last_verified}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            Status: {entry.status}. Review every {entry.review_days} days.
          </p>

          <div className="mt-5">
            <h3 className="text-sm font-semibold">Sources</h3>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {entry.sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-primary underline-offset-4 hover:underline"
                  >
                    {source.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {entry.id === "treatments" && (
            <div className="mt-6">
              <label htmlFor="license-treatment-filter" className="text-sm font-semibold">
                Filter treatments
              </label>
              <input
                id="license-treatment-filter"
                type="search"
                value={treatmentFilter}
                onChange={(event) => setTreatmentFilter(event.target.value)}
                placeholder="Search treatments, for example: nitrous"
                className="mt-2 min-h-11 w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm"
              />
            </div>
          )}

          <div className="mt-5 space-y-5">
            {entry.blocks.map((block, index) => (
              <LicenseBlockView
                key={`${entry.id}-${index}`}
                block={block}
                title={entry.title}
                filter={entry.id === "treatments" ? treatmentFilter : ""}
              />
            ))}
          </div>
        </section>
      ))}

      <footer className="mt-8 border-t border-border bg-surface px-4 py-3 text-center text-xs leading-5 text-muted">
        Research aid, not legal advice. Check the cited rule before relying on it.
      </footer>
    </main>
  );
}

function LicenseBlockView({
  block,
  title,
  filter,
}: {
  block: LicenseBlock;
  title: string;
  filter: string;
}) {
  if (block.type === "heading") {
    const Heading = block.level === 1 ? "h3" : "h4";
    return (
      <Heading className="text-base font-semibold tracking-tight">
        {renderInline(block.text)}
      </Heading>
    );
  }
  if (block.type === "paragraph") {
    return <p className="text-sm leading-6 text-muted">{renderInline(block.text)}</p>;
  }
  if (block.type === "blockquote") {
    return (
      <blockquote className="border-l-2 border-coral pl-4 text-sm leading-6 text-muted">
        {renderInline(block.text)}
      </blockquote>
    );
  }
  if (block.type === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List
        className={`space-y-2 pl-5 text-sm leading-6 text-muted ${
          block.ordered ? "list-decimal" : "list-disc"
        }`}
      >
        {block.items.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </List>
    );
  }

  const normalizedFilter = filter.trim().toLocaleLowerCase("en-US");
  const rows = normalizedFilter
    ? block.rows.filter((row) =>
        row.join(" ").toLocaleLowerCase("en-US").includes(normalizedFilter),
      )
    : block.rows;
  return (
    <div
      className="overflow-x-auto rounded-xl border border-border"
      role="region"
      aria-label={`${title} table`}
      tabIndex={0}
    >
      <table className="w-full min-w-[56rem] border-collapse text-left text-sm md:min-w-full md:table-fixed">
        <caption className="sr-only">{title}</caption>
        <thead className="bg-elevated text-xs text-fg">
          <tr>
            {block.headers.map((header, index) => (
              <th
                key={index}
                scope="col"
                className="border-b border-border px-3 py-2 font-semibold"
              >
                {renderInline(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="align-top even:bg-elevated/50">
                {block.headers.map((_, columnIndex) => (
                  <td
                    key={columnIndex}
                    className="border-b border-border px-3 py-2 leading-6 text-muted"
                  >
                    {renderInline(row[columnIndex] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={block.headers.length} className="px-3 py-4 text-sm text-muted">
                No matching treatments.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function renderInline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}
