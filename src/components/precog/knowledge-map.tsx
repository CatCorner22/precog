import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { RISK_SCALE } from "@/lib/precog/scoring/bands";
import { useTemplate } from "@/lib/precog/practice-context";
import { findKnowledgeRisks } from "@/lib/precog/engine";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { coverageReport, STRONG_LEVELS } from "@/lib/precog/continuity/coverage";
import { itemRecorded, registerAssessed } from "@/lib/precog/continuity/register-state";
import { CRITICALITY_LABEL, KIND_LABEL } from "@/lib/precog/continuity/planner-copy";
import { count, firstName } from "@/lib/precog/text";
import {
  ITEM_NODE,
  knowledgeMapLayout,
  MAP_WIDTH,
  PERSON_NODE,
} from "@/components/precog/knowledge-map-layout";

export function KnowledgeMap({ initialKnowledgeId }: { initialKnowledgeId?: string | null }) {
  const tpl = useTemplate();
  const assessed = registerAssessed(tpl);
  const recordedIds = useMemo(
    () =>
      new Set(tpl.knowledge.filter((item) => itemRecorded(tpl, item.id)).map((item) => item.id)),
    [tpl],
  );
  const risks = useMemo(() => findKnowledgeRisks(tpl), [tpl]);
  const coverage = useMemo(
    () => new Map(coverageReport(tpl).items.map((i) => [i.item.id, i])),
    [tpl],
  );
  // People who are the only one able to run some item, looked up per node.
  const soleOwnerIds = useMemo(
    () => new Set(risks.filter((r) => r.soleOwner).flatMap((r) => r.owners.map((o) => o.id))),
    [risks],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialKnowledgeId ?? risks[0]?.knowledgeId ?? null,
  );

  useEffect(() => {
    if (initialKnowledgeId) setSelectedId(initialKnowledgeId);
  }, [initialKnowledgeId]);

  const layout = useMemo(() => {
    const riskById = new Map(risks.map((r) => [r.knowledgeId, r]));
    return knowledgeMapLayout(
      tpl.people,
      tpl.knowledge.map((k) => ({ ...k, risk: riskById.get(k.id) })),
      tpl.relations.filter((r) => STRONG_LEVELS.has(r.level)),
    );
  }, [tpl, risks]);

  const selected = selectedId ? coverage.get(selectedId) : undefined;
  const selectKey = (id: string) => (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSelectedId(id);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="overflow-x-auto rounded-xl border border-border bg-panel matrix-grid">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${layout.height}`}
          className="w-full min-w-[560px]"
          role="group"
          aria-label="The Who knows what register as a drawing: people on the left, register items on the right"
        >
          {layout.edges.map((e) => {
            const isHot = e.to.risk?.soleOwner && e.to.criticality === "critical";
            return (
              <line
                key={`${e.personId}-${e.knowledgeId}`}
                x1={e.from.x + PERSON_NODE.width}
                y1={e.from.y + 18}
                x2={e.to.x}
                y2={e.to.y + 18}
                stroke={isHot ? "var(--color-danger)" : "var(--color-border-strong)"}
                strokeWidth={isHot ? 2 : 1}
                strokeOpacity={0.7}
              />
            );
          })}

          {layout.people.map((p) => {
            const sole = soleOwnerIds.has(p.id);
            return (
              <g key={p.id}>
                <rect
                  x={p.x}
                  y={p.y}
                  width={PERSON_NODE.width}
                  height={PERSON_NODE.height}
                  rx={8}
                  fill="var(--color-elevated)"
                  stroke={sole ? "var(--color-danger)" : "var(--color-border)"}
                  strokeWidth={sole ? 2 : 1}
                />
                <text
                  x={p.x + 10}
                  y={p.y + 18}
                  fill="var(--color-fg)"
                  fontSize="12"
                  fontWeight="600"
                >
                  {firstName(p.name)}
                </text>
                <text x={p.x + 10} y={p.y + 34} fill="var(--color-muted)" fontSize="12">
                  {p.role.length > 13 ? p.role.slice(0, 12) + "…" : p.role}
                </text>
              </g>
            );
          })}

          {layout.items.map((k) => {
            const sole = k.risk?.soleOwner && k.criticality === "critical";
            const holders = coverage.get(k.id)?.primaries.length ?? 0;
            const isSelected = selectedId === k.id;
            const holdersText = !assessed
              ? "not assessed yet"
              : !recordedIds.has(k.id)
                ? "Not marked yet"
                : holders === 0
                  ? "nobody can run it"
                  : holders === 1
                    ? "one person only"
                    : `${holders} can run it`;
            return (
              <g
                key={k.id}
                className="cursor-pointer focus:outline-none focus-visible:outline-2 focus-visible:outline-primary"
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`${k.name}, ${holdersText}`}
                opacity={assessed ? 1 : 0.6}
                onClick={() => setSelectedId(k.id)}
                onKeyDown={selectKey(k.id)}
              >
                <rect
                  x={k.x}
                  y={k.y}
                  width={ITEM_NODE.width}
                  height={ITEM_NODE.height}
                  rx={8}
                  fill={
                    sole
                      ? "color-mix(in oklab, var(--color-danger) 12%, var(--color-elevated))"
                      : "var(--color-elevated)"
                  }
                  stroke={
                    isSelected
                      ? "var(--color-primary)"
                      : sole
                        ? "var(--color-danger)"
                        : assessed && recordedIds.has(k.id) && holders === 0
                          ? "var(--color-warn)"
                          : "var(--color-border)"
                  }
                  strokeWidth={isSelected || sole ? 2 : 1}
                />
                <text
                  x={k.x + 10}
                  y={k.y + 18}
                  fill="var(--color-fg)"
                  fontSize="12"
                  fontWeight="600"
                >
                  {k.name.length > 24 ? k.name.slice(0, 23) + "…" : k.name}
                </text>
                <text x={k.x + 10} y={k.y + 36} fill="var(--color-muted)" fontSize="12">
                  {k.criticality} · {holdersText}
                </text>
              </g>
            );
          })}

          <text
            x={PERSON_NODE.x}
            y={24}
            fill="var(--color-subtle)"
            fontSize="12"
            letterSpacing="0.08em"
          >
            PEOPLE
          </text>
          <text
            x={ITEM_NODE.x}
            y={24}
            fill="var(--color-subtle)"
            fontSize="12"
            letterSpacing="0.08em"
          >
            REGISTER ITEMS
          </text>
        </svg>
      </div>

      <aside className="rounded-xl border border-border bg-surface p-4">
        <p className="text-xs font-medium tracking-wide text-subtle uppercase">Selected item</p>
        {!assessed ? (
          <p className="mt-3 text-sm text-muted">
            The register above does not mark anyone yet, so the map cannot say who holds what. Mark
            who can do each item there and the map fills in.
          </p>
        ) : selected ? (
          <div className="mt-3 space-y-3">
            <div>
              <h3 className="font-semibold">{selected.item.name}</h3>
              {selected.item.description && (
                <p className="mt-1 text-sm text-muted">{selected.item.description}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  !recordedIds.has(selected.item.id)
                    ? "default"
                    : selected.primaries.length >= 2
                      ? "ok"
                      : "danger"
                }
              >
                {recordedIds.has(selected.item.id)
                  ? `${count(selected.primaries.length, "person", "people")} can run it alone`
                  : "Not marked yet"}
              </Badge>
              <Badge variant="default">{KIND_LABEL[selected.item.kind ?? "knowledge"]}</Badge>
              <Badge variant={selected.item.criticality === "critical" ? "warn" : "default"}>
                {CRITICALITY_LABEL[selected.item.criticality]}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-subtle">Can run it alone</p>
              <ul className="mt-1 space-y-1">
                {selected.primaries.length === 0 && (
                  <li className="text-sm text-warn">
                    {recordedIds.has(selected.item.id)
                      ? "Nobody can run this alone yet"
                      : "Not marked yet"}
                  </li>
                )}
                {selected.primaries.map((o) => (
                  <li key={o.id} className="text-sm">
                    {o.name} <span className="text-muted">· {o.role}</span>
                  </li>
                ))}
              </ul>
            </div>
            {selected.primaries.length === 1 && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                Only one person can run this alone. Train a second person or write it down before{" "}
                {firstName(selected.primaries[0].name)} is away.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Select an item on the map.</p>
        )}

        {assessed && (
          <div className="mt-6 border-t border-border pt-4">
            <p className="text-xs font-medium tracking-wide text-subtle uppercase">
              Needs attention first
            </p>
            <ul className="mt-2 space-y-2">
              {risks
                .filter((r) => r.riskScore >= RISK_SCALE.actNow)
                .map((r) => (
                  <li key={r.knowledgeId}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.knowledgeId)}
                      aria-pressed={selectedId === r.knowledgeId}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        selectedId === r.knowledgeId
                          ? "border-primary/40 bg-primary/10"
                          : "border-border bg-elevated hover:border-border-strong",
                      )}
                    >
                      <span className="font-medium">{r.name}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {!recordedIds.has(r.knowledgeId)
                          ? "Not marked yet"
                          : r.ownerCount === 0
                            ? "Nobody can run it alone"
                            : "One person only"}{" "}
                        · attention index {r.riskScore} of 100 (Precog&apos;s own scale)
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
