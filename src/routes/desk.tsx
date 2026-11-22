import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonClass } from "@/components/ui/button-variants";
import { complianceIndexFn, searchComplianceCardsFn } from "@/lib/compliance/cards-server";
import type { ComplianceCardResult, ComplianceIndex } from "@/lib/compliance/cards";
import { synonymLabels } from "@/lib/compliance/synonyms";

export const Route = createFileRoute("/desk")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" ? { q: search.q.slice(0, 200) } : {},
  loader: () => complianceIndexFn(),
  component: ComplianceDesk,
  head: () => ({
    meta: [
      { title: "Compliance desk | BlakeGPT" },
      {
        name: "description",
        content: "Search 255 cited Tennessee and federal rule cards for the dental office.",
      },
    ],
  }),
});

const sections = [
  { id: "all", label: "All sections" },
  { id: "controlled-substances-radiation", label: "Controlled substances & radiation" },
  { id: "federal-employment", label: "Federal employment" },
  { id: "healthcare-contracts", label: "Healthcare contracts" },
  { id: "infection-control", label: "Infection control" },
  { id: "osha", label: "OSHA" },
  { id: "privacy", label: "HIPAA & privacy" },
  { id: "tn-dentistry", label: "Tennessee dentistry" },
  { id: "tn-employment", label: "Tennessee employment" },
] as const;

type SectionId = (typeof sections)[number]["id"];
type SearchState = "idle" | "loading" | "results" | "empty" | "error";

function ComplianceDesk() {
  const index = Route.useLoaderData() as ComplianceIndex;
  const { q } = Route.useSearch();
  const [query, setQuery] = useState(q ?? "");
  const [section, setSection] = useState<SectionId>("all");
  const [activeSubtopic, setActiveSubtopic] = useState<string | null>(null);
  const [state, setState] = useState<SearchState>("idle");
  const [results, setResults] = useState<ComplianceCardResult[]>([]);
  const [showingStale, setShowingStale] = useState(false);
  const requestId = useRef(0);
  const resultsRef = useRef<ComplianceCardResult[]>([]);

  const search = useCallback(async (text: string, selectedSection: SectionId) => {
    const normalized = text.trim();
    if (!normalized && selectedSection === "all") {
      requestId.current += 1;
      resultsRef.current = [];
      setResults([]);
      setShowingStale(false);
      setState("idle");
      return;
    }

    const currentRequest = ++requestId.current;
    setState("loading");
    setShowingStale(resultsRef.current.length > 0);
    try {
      const found = await searchComplianceCardsFn({
        data: {
          query: normalized,
          ...(selectedSection !== "all" ? { section: selectedSection } : {}),
        },
      });
      if (currentRequest !== requestId.current) return;
      resultsRef.current = found;
      setResults(found);
      setShowingStale(false);
      setState(found.length ? "results" : "empty");
    } catch {
      if (currentRequest !== requestId.current) return;
      setShowingStale(resultsRef.current.length > 0);
      setState("error");
    }
  }, []);

  useEffect(() => {
    const initialQuery = q ?? "";
    setQuery(initialQuery);
    setSection("all");
    setActiveSubtopic(null);
    void search(initialQuery, "all");
  }, [q, search]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search(query, section);
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 pt-8 pb-32 sm:px-8 sm:pt-12">
      <header className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <img
          src={
            section === "healthcare-contracts"
              ? "/reverie/reverie-lawyer.webp"
              : "/reverie/reverie-dental.webp"
          }
          alt={
            section === "healthcare-contracts"
              ? "Reverie, the lawyer cat"
              : "Reverie, the dental compliance cat"
          }
          width={512}
          height={512}
          loading="lazy"
          className="size-16 shrink-0 object-contain sm:size-20"
        />
        <div>
          <p className="border-l-2 border-coral pl-2 text-xs font-semibold tracking-[0.16em] text-muted uppercase">
            BlakeGPT
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Compliance desk</h1>
          <p className="mt-1 text-sm text-muted">
            Search 255 cited Tennessee and federal rule cards for the dental office.
          </p>
          <nav aria-label="Compliance references" className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Link
              to="/licenses"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Each license
            </Link>
            <Link
              to="/map"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Office map
            </Link>
          </nav>
        </div>
      </header>

      <section className="mt-8 rounded-2xl border border-border bg-surface p-5 sm:p-7">
        <form onSubmit={submit}>
          <label htmlFor="compliance-query" className="text-sm font-semibold">
            Ask about a rule, for example: sharps disposal
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="compliance-query"
              type="search"
              maxLength={200}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveSubtopic(null);
              }}
              placeholder="Search Tennessee and federal cards"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm"
            />
            <button type="submit" disabled={state === "loading"} className={buttonClass()}>
              {state === "loading" ? "Searching…" : "Search"}
            </button>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter by section">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={section === item.id}
              onClick={() => {
                setSection(item.id);
                setActiveSubtopic(null);
                void search(query, item.id);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                section === item.id
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border-strong bg-bg text-muted hover:bg-elevated"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {section !== "all" && (
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="group"
            aria-label={`${sections.find((item) => item.id === section)?.label ?? section} topics`}
          >
            {(index.sections.find((item) => item.id === section)?.subtopics ?? [])
              .slice(0, 12)
              .map((topic) => (
                <button
                  key={topic.term}
                  type="button"
                  aria-pressed={activeSubtopic === topic.term}
                  onClick={() => {
                    setQuery(topic.term);
                    setActiveSubtopic(topic.term);
                    void search(topic.term, section);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeSubtopic === topic.term
                      ? "border-primary bg-primary text-primary-fg"
                      : "border-border-strong bg-bg text-muted hover:bg-elevated"
                  }`}
                >
                  {topic.label} ({topic.count})
                </button>
              ))}
          </div>
        )}
      </section>

      <section className="mt-7 space-y-4" aria-label="Compliance search results">
        {state === "idle" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <h2 className="text-lg font-semibold tracking-tight">Contents</h2>
              <div className="mt-4 space-y-2">
                {index.sections.map((item) => (
                  <details
                    key={item.id}
                    className="rounded-lg border border-border bg-elevated px-3 py-2"
                  >
                    <summary className="cursor-pointer text-sm font-medium">
                      {sections.find((sectionItem) => sectionItem.id === item.id)?.label ?? item.id}{" "}
                      ({item.count})
                    </summary>
                    <ul className="mt-2 space-y-1 border-l border-border-strong pl-3">
                      {item.titles.map((title) => (
                        <li key={title.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setQuery(title.title);
                              setActiveSubtopic(null);
                              void search(title.title, "all");
                            }}
                            className="text-left text-sm text-primary underline-offset-4 hover:underline"
                          >
                            {title.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <h2 className="text-lg font-semibold tracking-tight">Keyword index</h2>
              <ul className="mt-4 space-y-1.5">
                {index.keywords.map((keyword) => (
                  <li key={keyword.term}>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(keyword.term);
                        setActiveSubtopic(null);
                        void search(keyword.term, "all");
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left hover:bg-elevated"
                    >
                      <span className="block text-sm font-medium text-primary">
                        {synonymLabels[keyword.term] ?? keyword.term} ({keyword.count})
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        also: {keyword.synonyms.join(", ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
        {state === "loading" && results.length === 0 && (
          <p role="status" className="rounded-xl border border-border bg-elevated p-5 text-sm">
            Searching cited cards…
          </p>
        )}
        {state === "loading" && showingStale && (
          <p
            role="status"
            className="rounded-xl border border-border bg-elevated p-4 text-sm text-muted"
          >
            Showing earlier results while the new search loads. Check each source before relying on
            a card.
          </p>
        )}
        {state === "error" && (
          <div role="alert" className="rounded-xl border border-danger/40 bg-surface p-5">
            <p className="text-sm font-medium">The search did not load.</p>
            <p className="mt-1 text-sm text-muted">
              {showingStale
                ? "Earlier results may be stale. Check the source or retry."
                : "Retry the search to load cited cards."}
            </p>
            <button
              type="button"
              onClick={() => void search(query, section)}
              className={`${buttonClass({ variant: "secondary" })} mt-4`}
            >
              Retry search
            </button>
          </div>
        )}
        {state === "empty" && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-8 text-center">
            <img
              src="/reverie/reverie-reading-book.webp"
              alt="Reverie reads a book while checking the rule library."
              width={512}
              height={468}
              loading="lazy"
              className="size-28 object-contain"
            />
            <p className="text-sm font-medium">
              No card covers this yet. Check the official source.
            </p>
          </div>
        )}
        {state === "results" && !query.trim() && section !== "all" && (
          <h2 className="text-lg font-semibold tracking-tight">
            {sections.find((item) => item.id === section)?.label ?? section}: {results.length} cards
          </h2>
        )}
        {results.map((card) => (
          <article
            key={`${card.section}:${card.id}`}
            className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">{card.title}</h2>
              <span className="rounded-full bg-elevated px-3 py-1 text-xs font-medium text-muted">
                {card.status === "verified" && card.last_verified
                  ? `Verified ${card.last_verified}`
                  : "Not yet verified: check the source"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">{card.excerpt}</p>
            <details className="mt-4 rounded-xl border border-border bg-elevated px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">Full card</summary>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{card.body}</p>
            </details>
            {card.citation && (
              <p className="mt-3 text-xs leading-5 text-subtle">
                <span className="font-semibold">Citation: </span>
                {card.citation}
              </p>
            )}
            {card.stale && (
              <p className="mt-3 text-sm font-medium text-warn">
                Stale: recheck the source before relying on this card.
              </p>
            )}
            {card.source_url && (
              <a
                href={card.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Open source
              </a>
            )}
          </article>
        ))}
      </section>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 text-center text-xs leading-5 text-muted backdrop-blur">
        Research aid, not legal advice. Never enter patient names or other personal information.
      </footer>
    </main>
  );
}
