import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { officeMapFn } from "@/lib/compliance/cards-server";
import type {
  OfficeMap as OfficeMapData,
  OfficeMapTopic,
  ResolvedMapNode,
} from "@/lib/compliance/office-map";

export const Route = createFileRoute("/map")({
  loader: () => officeMapFn(),
  component: OfficeMapRoute,
  head: () => ({
    meta: [
      { title: "Office map | BlakeGPT" },
      {
        name: "description",
        content:
          "See which cited compliance topics connect to each dental license and office area.",
      },
    ],
  }),
});

type MapSelection =
  { type: "license"; id: string } | { type: "area"; id: string } | { type: "topic"; id: string };

type MapNodeType = "license" | "area";

function OfficeMapRoute() {
  return <OfficeMapPage map={Route.useLoaderData()} />;
}

export function OfficeMapPage({ map }: { map: OfficeMapData }) {
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [focused, setFocused] = useState<MapSelection | null>(null);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const highlight = focused ?? selection;
  const selectedLicense =
    selection?.type === "license"
      ? map.licenses.find((node) => node.id === selection.id)
      : undefined;
  const selectedArea =
    selection?.type === "area" ? map.areas.find((node) => node.id === selection.id) : undefined;
  const selectedTopic =
    selection?.type === "topic"
      ? map.topics.find((topic) => topic.term === selection.id)
      : undefined;
  const selectedNode = selectedLicense ?? selectedArea;
  const selectedTerms = new Set(
    selectedTopic ? [selectedTopic.term] : (selectedNode?.topics ?? []),
  );
  const highlightedLicense =
    highlight?.type === "license"
      ? map.licenses.find((node) => node.id === highlight.id)
      : undefined;
  const highlightedArea =
    highlight?.type === "area" ? map.areas.find((node) => node.id === highlight.id) : undefined;
  const highlightedTopic =
    highlight?.type === "topic"
      ? map.topics.find((topic) => topic.term === highlight.id)
      : undefined;
  const highlightedNode = highlightedLicense ?? highlightedArea;
  const highlightedTerms = new Set(
    highlightedTopic ? [highlightedTopic.term] : (highlightedNode?.topics ?? []),
  );
  const connectedLicenses = new Set(
    highlight?.type === "license"
      ? [highlight.id]
      : highlight?.type === "topic"
        ? map.licenses.filter((node) => node.topics.includes(highlight.id)).map((node) => node.id)
        : [],
  );
  const connectedAreas = new Set(
    highlight?.type === "area"
      ? [highlight.id]
      : highlight?.type === "topic"
        ? map.areas.filter((node) => node.topics.includes(highlight.id)).map((node) => node.id)
        : [],
  );
  const selectedTopics = map.topics.filter((topic) => selectedTerms.has(topic.term));
  const selectedCards = selectedTopic
    ? selectedTopic.cards
    : [
        ...new Map(
          selectedTopics.flatMap((topic) => topic.cards).map((card) => [card.id, card]),
        ).values(),
      ].sort((a, b) => a.title.localeCompare(b.title));
  const panelTitle = selectedLicense?.label ?? selectedArea?.label ?? selectedTopic?.label;
  const rowHeight = 44;
  const nodeHeight = 32;
  const padding = 16;
  const rowCount = Math.max(map.topics.length, map.licenses.length, map.areas.length, 1);
  const diagramHeight = rowCount * rowHeight + padding * 2;
  const topicY = new Map(
    map.topics.map((topic, index) => [topic.term, padding + index * rowHeight + nodeHeight / 2]),
  );
  const licenseY = new Map(
    map.licenses.map((node, index) => [node.id, padding + index * rowHeight + nodeHeight / 2]),
  );
  const areaY = new Map(
    map.areas.map((node, index) => [node.id, padding + index * rowHeight + nodeHeight / 2]),
  );
  const leftX = 12;
  const leftWidth = 236;
  const topicX = 414;
  const topicWidth = 292;
  const areaX = 872;
  const areaWidth = 236;

  function nodeClass(isSelected: boolean, isConnected: boolean) {
    const stateClass = isSelected
      ? "border-primary bg-primary text-primary-fg"
      : isConnected
        ? "border-primary bg-elevated text-fg"
        : highlight
          ? "border-border bg-surface text-muted opacity-40"
          : "border-border-strong bg-surface text-fg";
    return `${stateClass} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`;
  }

  function renderGroupedNodes(nodes: ResolvedMapNode[], type: MapNodeType) {
    return nodes.map((node) => {
      const key = `${type}:${node.id}`;
      const expanded = expandedNode === key;
      const selected = selection?.type === type && selection.id === node.id;
      const highlightedNode = highlight?.type === type && highlight.id === node.id;
      const connected =
        type === "license" ? connectedLicenses.has(node.id) : connectedAreas.has(node.id);
      return (
        <li key={key} className="rounded-xl border border-border bg-surface p-3">
          <button
            type="button"
            aria-pressed={selected}
            aria-expanded={expanded}
            onFocus={() => setFocused({ type, id: node.id })}
            onBlur={() => setFocused(null)}
            onClick={() => {
              setSelection({ type, id: node.id });
              setExpandedNode(expanded ? null : key);
            }}
            className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-semibold ${nodeClass(
              highlightedNode,
              connected,
            )}`}
          >
            {node.label}
          </button>
          {expanded && (
            <ul className="mt-3 space-y-3 border-l border-border-strong pl-3">
              {node.topics.map((term) => {
                const topic = map.topics.find((item) => item.term === term);
                if (!topic) return null;
                return (
                  <li key={topic.term}>
                    <button
                      type="button"
                      aria-pressed={selection?.type === "topic" && selection.id === topic.term}
                      onFocus={() => setFocused({ type: "topic", id: topic.term })}
                      onBlur={() => setFocused(null)}
                      onClick={() => setSelection({ type: "topic", id: topic.term })}
                      className={`rounded-md px-2 py-1 text-left text-sm font-medium ${nodeClass(
                        highlight?.type === "topic" && highlight.id === topic.term,
                        selectedTerms.has(topic.term),
                      )}`}
                    >
                      {topic.label} ({topic.count})
                    </button>
                    <ul className="mt-1 space-y-1 pl-3">
                      {topic.cards.map((card) => (
                        <li key={card.id}>
                          <Link
                            to="/desk"
                            search={{ q: card.title }}
                            className="text-sm text-primary underline-offset-4 hover:underline"
                          >
                            {card.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      );
    });
  }

  function renderTopics(topics: OfficeMapTopic[]) {
    return (
      <ul className="mt-3 space-y-1">
        {topics.map((topic) => (
          <li key={topic.term}>
            <button
              type="button"
              aria-pressed={selection?.type === "topic" && selection.id === topic.term}
              onFocus={() => setFocused({ type: "topic", id: topic.term })}
              onBlur={() => setFocused(null)}
              onClick={() => setSelection({ type: "topic", id: topic.term })}
              className={`rounded-md px-2 py-1 text-left text-sm ${nodeClass(
                highlight?.type === "topic" && highlight.id === topic.term,
                selectedTerms.has(topic.term),
              )}`}
            >
              {topic.label} ({topic.count})
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 pt-8 pb-28 sm:px-8 sm:pt-12">
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
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Office map</h1>
          <p className="mt-1 text-sm text-muted">
            See how licenses and office areas connect to cited compliance topics.
          </p>
        </div>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          aria-label="License, compliance topic, and office area connections"
          className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5"
        >
          <div className="hidden grid-cols-[22%_1fr_22%] gap-3 text-xs font-semibold text-muted md:grid">
            <span>Licenses</span>
            <span>Rule topics</span>
            <span>Office areas</span>
          </div>
          <div
            className="relative mt-3 hidden overflow-hidden rounded-xl bg-elevated md:block"
            style={{ height: `${diagramHeight}px` }}
          >
            <svg
              aria-hidden="true"
              focusable="false"
              className="absolute inset-0 h-full w-full"
              viewBox={`0 0 1120 ${diagramHeight}`}
              preserveAspectRatio="none"
            >
              {map.licenses.flatMap((license) =>
                license.topics.map((term) => {
                  const y1 = licenseY.get(license.id) ?? padding;
                  const y2 = topicY.get(term) ?? padding;
                  const active =
                    highlight?.type === "license"
                      ? highlight.id === license.id && highlightedTerms.has(term)
                      : highlight?.type === "topic" && highlight.id === term;
                  return (
                    <path
                      key={`license-${license.id}-${term}`}
                      d={`M ${leftX + leftWidth} ${y1} C 320 ${y1}, 340 ${y2}, ${topicX} ${y2}`}
                      fill="none"
                      stroke={active ? "var(--color-primary)" : "var(--color-border-strong)"}
                      strokeOpacity={highlight && !active ? 0.2 : 0.58}
                      strokeWidth={active ? 2.4 : 1.2}
                    />
                  );
                }),
              )}
              {map.areas.flatMap((area) =>
                area.topics.map((term) => {
                  const y1 = topicY.get(term) ?? padding;
                  const y2 = areaY.get(area.id) ?? padding;
                  const active =
                    highlight?.type === "area"
                      ? highlight.id === area.id && highlightedTerms.has(term)
                      : highlight?.type === "topic" && highlight.id === term;
                  return (
                    <path
                      key={`area-${area.id}-${term}`}
                      d={`M ${topicX + topicWidth} ${y1} C 772 ${y1}, 824 ${y2}, ${areaX} ${y2}`}
                      fill="none"
                      stroke={active ? "var(--color-primary)" : "var(--color-border-strong)"}
                      strokeOpacity={highlight && !active ? 0.2 : 0.58}
                      strokeWidth={active ? 2.4 : 1.2}
                    />
                  );
                }),
              )}
            </svg>
            {map.licenses.map((license) => {
              const selected = selection?.type === "license" && selection.id === license.id;
              const highlightedNode = highlight?.type === "license" && highlight.id === license.id;
              return (
                <button
                  key={license.id}
                  type="button"
                  aria-label={`License: ${license.label}`}
                  aria-pressed={selected}
                  onFocus={() => setFocused({ type: "license", id: license.id })}
                  onBlur={() => setFocused(null)}
                  onClick={() => setSelection({ type: "license", id: license.id })}
                  className={`absolute z-10 h-8 truncate rounded-lg border px-2 text-left text-xs font-medium ${nodeClass(
                    highlightedNode,
                    connectedLicenses.has(license.id),
                  )}`}
                  style={{
                    left: `${(leftX / 1120) * 100}%`,
                    top: `${(licenseY.get(license.id) ?? padding) - nodeHeight / 2}px`,
                    width: `${(leftWidth / 1120) * 100}%`,
                  }}
                >
                  {license.label}
                </button>
              );
            })}
            {map.topics.map((topic) => {
              const selected = selection?.type === "topic" && selection.id === topic.term;
              const highlightedTopic = highlight?.type === "topic" && highlight.id === topic.term;
              return (
                <button
                  key={topic.term}
                  type="button"
                  aria-label={`Topic: ${topic.label}, ${topic.count} cards`}
                  aria-pressed={selected}
                  onFocus={() => setFocused({ type: "topic", id: topic.term })}
                  onBlur={() => setFocused(null)}
                  onClick={() => setSelection({ type: "topic", id: topic.term })}
                  className={`absolute z-10 h-8 truncate rounded-lg border px-2 text-left text-xs font-medium ${nodeClass(
                    highlightedTopic,
                    highlightedTerms.has(topic.term),
                  )}`}
                  style={{
                    left: `${(topicX / 1120) * 100}%`,
                    top: `${(topicY.get(topic.term) ?? padding) - nodeHeight / 2}px`,
                    width: `${(topicWidth / 1120) * 100}%`,
                  }}
                >
                  {topic.label} ({topic.count})
                </button>
              );
            })}
            {map.areas.map((area) => {
              const selected = selection?.type === "area" && selection.id === area.id;
              const highlightedNode = highlight?.type === "area" && highlight.id === area.id;
              return (
                <button
                  key={area.id}
                  type="button"
                  aria-label={`Office area: ${area.label}`}
                  aria-pressed={selected}
                  onFocus={() => setFocused({ type: "area", id: area.id })}
                  onBlur={() => setFocused(null)}
                  onClick={() => setSelection({ type: "area", id: area.id })}
                  className={`absolute z-10 h-8 truncate rounded-lg border px-2 text-left text-xs font-medium ${nodeClass(
                    highlightedNode,
                    connectedAreas.has(area.id),
                  )}`}
                  style={{
                    left: `${(areaX / 1120) * 100}%`,
                    top: `${(areaY.get(area.id) ?? padding) - nodeHeight / 2}px`,
                    width: `${(areaWidth / 1120) * 100}%`,
                  }}
                >
                  {area.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-5 md:hidden">
            <section>
              <h2 className="text-sm font-semibold">By license</h2>
              <ul className="mt-3 space-y-3">{renderGroupedNodes(map.licenses, "license")}</ul>
            </section>
            <section>
              <h2 className="text-sm font-semibold">By office area</h2>
              <ul className="mt-3 space-y-3">{renderGroupedNodes(map.areas, "area")}</ul>
            </section>
          </div>
        </section>

        <aside
          aria-live="polite"
          className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
        >
          {panelTitle ? (
            <>
              <h2 className="text-lg font-semibold tracking-tight">{panelTitle}</h2>
              {(selectedLicense || selectedArea) && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold">Topics</h3>
                  {renderTopics(selectedTopics)}
                </div>
              )}
              {selectedLicense?.licenseTab && (
                <Link
                  to="/licenses"
                  search={{ tab: selectedLicense.licenseTab }}
                  className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Rules, laws and ethics on the Each license page
                </Link>
              )}
              <div className="mt-5">
                <h3 className="text-sm font-semibold">Cards ({selectedCards.length})</h3>
                {selectedCards.length ? (
                  <ul className="mt-2 space-y-2">
                    {selectedCards.map((card) => (
                      <li key={card.id}>
                        <Link
                          to="/desk"
                          search={{ q: card.title }}
                          className="text-sm text-primary underline-offset-4 hover:underline"
                        >
                          {card.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">No matching cards.</p>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold tracking-tight">Selection</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Select a license, topic, or office area to see its connected cards.
              </p>
            </>
          )}
        </aside>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 text-center text-xs leading-5 text-muted backdrop-blur">
        Research aid, not legal advice. Check the cited rule before relying on it.
      </footer>
    </main>
  );
}
