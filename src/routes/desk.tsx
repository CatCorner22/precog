import { useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonClass } from "@/components/ui/button-variants";
import { searchComplianceCardsFn } from "@/lib/compliance/cards-server";
import type { ComplianceCardResult } from "@/lib/compliance/cards";

export const Route = createFileRoute("/desk")({
  component: ComplianceDesk,
  head: () => ({
    meta: [
      { title: "Compliance desk | BlakeGPT" },
      {
        name: "description",
        content: "Search cited Tennessee and federal rules for the dental office.",
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
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<SectionId>("all");
  const [state, setState] = useState<SearchState>("idle");
  const [results, setResults] = useState<ComplianceCardResult[]>([]);
  const [showingStale, setShowingStale] = useState(false);
  const requestId = useRef(0);

  async function search(text = query, selectedSection = section) {
    const normalized = text.trim();
    if (!normalized) {
      requestId.current += 1;
      setResults([]);
      setShowingStale(false);
      setState("idle");
      return;
    }

    const currentRequest = ++requestId.current;
    setState("loading");
    setShowingStale(results.length > 0);
    try {
      const found = await searchComplianceCardsFn({
        data: {
          query: normalized,
          ...(selectedSection !== "all" ? { section: selectedSection } : {}),
        },
      });
      if (currentRequest !== requestId.current) return;
      setResults(found);
      setShowingStale(false);
      setState(found.length ? "results" : "empty");
    } catch {
      if (currentRequest !== requestId.current) return;
      setShowingStale(results.length > 0);
      setState("error");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search();
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
            Cited Tennessee and federal rules for the dental office.
          </p>
          <Link
            to="/licenses"
            className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Each license
          </Link>
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
              onChange={(event) => setQuery(event.target.value)}
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
      </section>

      <section className="mt-7 space-y-4" aria-label="Compliance search results">
        {state === "idle" && (
          <p className="rounded-xl border border-border bg-elevated p-5 text-sm text-muted">
            Search the card library for a rule, deadline, or source.
          </p>
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
              onClick={() => void search()}
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
