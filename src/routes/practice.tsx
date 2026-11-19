import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { buttonClass } from "@/components/ui/button-variants";
import {
  listPracticeReferenceFn,
  searchPracticeReferenceFn,
} from "@/lib/practice/reference-server";
import type { PracticeFunction, PracticeSearchResult } from "@/lib/practice/reference.types";

export const Route = createFileRoute("/practice")({
  loader: () => listPracticeReferenceFn(),
  component: PracticeDesk,
  head: () => ({
    meta: [
      { title: "Practice desk | BlakeGPT" },
      {
        name: "description",
        content: "Operating functions, SOPs, controls, and metrics for a dental practice.",
      },
    ],
  }),
});

function PracticeDesk() {
  const { functions } = Route.useLoaderData();
  const [selectedId, setSelectedId] = useState(10);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PracticeSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const selected = functions.find((item) => item.id === selectedId) ?? functions[0];

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchPracticeReferenceFn({ data: { query } }));
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 pt-8 pb-28 sm:px-8 sm:pt-12">
      <header className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <img
          src="/reverie/reverie-dental.webp"
          alt="Reverie, the dental practice operations cat"
          width={512}
          height={512}
          loading="lazy"
          className="size-16 shrink-0 object-contain sm:size-20"
        />
        <div>
          <p className="border-l-2 border-coral pl-2 text-xs font-semibold tracking-[0.16em] text-muted uppercase">
            BlakeGPT
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Practice desk</h1>
          <p className="mt-1 text-sm text-muted">
            Generic operating reference for dental practice teams.
          </p>
        </div>
      </header>

      <section className="mt-7 rounded-2xl border border-border bg-surface p-5 sm:p-7">
        <h2 className="text-sm font-semibold">Choose a function</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Practice functions">
          {functions.map((item: PracticeFunction) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selectedId === item.id}
              onClick={() => setSelectedId(item.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedId === item.id
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border-strong bg-bg text-muted hover:bg-elevated"
              }`}
            >
              {item.id} · {item.title}
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <section
          className="mt-7 rounded-2xl border border-border bg-surface p-5 sm:p-7"
          aria-label={`Function ${selected.id}: ${selected.title}`}
        >
          <h2 className="text-xl font-semibold tracking-tight">
            {selected.id} · {selected.title}
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {(
              [
                ["Risks", selected.risks],
                ["SOPs", selected.sops],
                ["Controls", selected.controls],
                ["Metrics", selected.metrics],
              ] as const
            ).map(([label, items]) => (
              <article key={label} className="rounded-xl border border-border bg-elevated p-4">
                <h3 className="text-sm font-semibold">{label}</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
                  {items.map((item, index) => (
                    <li key={`${label}-${index}`}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mt-7 rounded-2xl border border-border bg-surface p-5 sm:p-7">
        <form onSubmit={search}>
          <label htmlFor="practice-query" className="text-sm font-semibold">
            Search the reference
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="practice-query"
              type="search"
              maxLength={200}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search functions, SOPs, controls, or metrics"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm"
            />
            <button type="submit" disabled={searching} className={buttonClass()}>
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
        </form>
        {searched && (
          <div className="mt-5 space-y-3" aria-live="polite">
            {results.length ? (
              results.map((result) => (
                <article
                  key={result.id}
                  className="rounded-xl border border-border bg-elevated p-4"
                >
                  <h3 className="text-sm font-semibold">
                    §{result.id} · {result.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{result.excerpt}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted">No matching section found.</p>
            )}
          </div>
        )}
      </section>

      <aside className="mt-7 rounded-2xl border border-border bg-elevated p-5 text-sm leading-6 text-muted">
        <h2 className="font-semibold text-fg">Two-deep coverage</h2>
        <p className="mt-1">
          Every critical task needs two capable people at different locations. Count a stand-in only
          after they have performed the task within the last six months.
        </p>
      </aside>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 text-center text-xs leading-5 text-muted backdrop-blur">
        Operations reference, not legal advice.
      </footer>
    </main>
  );
}
