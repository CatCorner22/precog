import { useMemo, useState } from "react";
import { knowledge, people, relations } from "@/lib/precog/demo-data";
import { findKnowledgeRisks } from "@/lib/precog/engine";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STRONG = new Set(["expert", "proficient"]);

export function KnowledgeMap() {
  const risks = useMemo(() => findKnowledgeRisks(), []);
  const [selectedId, setSelectedId] = useState<string | null>(risks[0]?.knowledgeId ?? null);

  const selected = risks.find((r) => r.knowledgeId === selectedId);
  const item = knowledge.find((k) => k.id === selectedId);

  const personNodes = people.map((p, i) => ({
    ...p,
    x: 80,
    y: 48 + i * 72,
  }));

  const knowledgeNodes = knowledge.map((k, i) => {
    const risk = risks.find((r) => r.knowledgeId === k.id);
    return {
      ...k,
      x: 420,
      y: 40 + i * 68,
      risk,
    };
  });

  const edges = relations
    .filter((r) => STRONG.has(r.level))
    .map((r) => {
      const from = personNodes.find((p) => p.id === r.personId);
      const to = knowledgeNodes.find((k) => k.id === r.knowledgeId);
      if (!from || !to) return null;
      return { ...r, from, to };
    })
    .filter(Boolean) as Array<{
    personId: string;
    knowledgeId: string;
    level: string;
    from: (typeof personNodes)[0];
    to: (typeof knowledgeNodes)[0];
  }>;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="overflow-x-auto rounded-xl border border-border bg-panel matrix-grid">
        <svg
          viewBox="0 0 640 520"
          className="min-h-[320px] w-full min-w-[560px]"
          role="img"
          aria-label="Knowledge continuity map"
        >
          {edges.map((e) => {
            const isHot =
              e.to.risk?.soleOwner && e.to.criticality === "critical";
            return (
              <line
                key={`${e.personId}-${e.knowledgeId}`}
                x1={e.from.x + 100}
                y1={e.from.y + 18}
                x2={e.to.x}
                y2={e.to.y + 18}
                stroke={isHot ? "var(--color-danger)" : "var(--color-border-strong)"}
                strokeWidth={isHot ? 2 : 1}
                strokeOpacity={0.7}
              />
            );
          })}

          {personNodes.map((p) => {
            const sole = risks.some(
              (r) => r.soleOwner && r.owners.some((o) => o.id === p.id),
            );
            return (
              <g key={p.id}>
                <rect
                  x={p.x}
                  y={p.y}
                  width={100}
                  height={44}
                  rx={8}
                  fill="var(--color-elevated)"
                  stroke={sole ? "var(--color-danger)" : "var(--color-border)"}
                  strokeWidth={sole ? 2 : 1}
                />
                <text
                  x={p.x + 10}
                  y={p.y + 18}
                  fill="var(--color-fg)"
                  fontSize="11"
                  fontWeight="600"
                >
                  {p.name.split(" ")[0]}
                </text>
                <text x={p.x + 10} y={p.y + 32} fill="var(--color-muted)" fontSize="9">
                  {p.role.length > 16 ? p.role.slice(0, 15) + "…" : p.role}
                </text>
              </g>
            );
          })}

          {knowledgeNodes.map((k) => {
            const sole = k.risk?.soleOwner && k.criticality === "critical";
            const unowned = k.risk?.ownerCount === 0;
            const selected = selectedId === k.id;
            return (
              <g
                key={k.id}
                className="cursor-pointer"
                onClick={() => setSelectedId(k.id)}
              >
                <rect
                  x={k.x}
                  y={k.y}
                  width={190}
                  height={48}
                  rx={8}
                  fill={
                    sole
                      ? "color-mix(in oklab, var(--color-danger) 12%, var(--color-elevated))"
                      : "var(--color-elevated)"
                  }
                  stroke={
                    selected
                      ? "var(--color-primary)"
                      : sole
                        ? "var(--color-danger)"
                        : unowned
                          ? "var(--color-warn)"
                          : "var(--color-border)"
                  }
                  strokeWidth={selected || sole ? 2 : 1}
                />
                <text
                  x={k.x + 10}
                  y={k.y + 18}
                  fill="var(--color-fg)"
                  fontSize="11"
                  fontWeight="600"
                >
                  {k.name.length > 24 ? k.name.slice(0, 23) + "…" : k.name}
                </text>
                <text x={k.x + 10} y={k.y + 34} fill="var(--color-muted)" fontSize="9">
                  {k.criticality}
                  {sole ? " · SOLE OWNER" : ` · ${k.risk?.ownerCount ?? 0} owners`}
                </text>
              </g>
            );
          })}

          <text x={80} y={24} fill="var(--color-subtle)" fontSize="10" letterSpacing="0.08em">
            PEOPLE
          </text>
          <text x={420} y={24} fill="var(--color-subtle)" fontSize="10" letterSpacing="0.08em">
            CRITICAL KNOWLEDGE
          </text>
        </svg>
      </div>

      <aside className="rounded-xl border border-border bg-surface p-4">
        <p className="text-[11px] font-medium tracking-wide text-subtle uppercase">
          Drill-down
        </p>
        {item && selected ? (
          <div className="mt-3 space-y-3">
            <div>
              <h4 className="font-semibold">{item.name}</h4>
              <p className="mt-1 text-sm text-muted">{item.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={selected.soleOwner ? "danger" : "ok"}>
                {selected.ownerCount} strong owner{selected.ownerCount === 1 ? "" : "s"}
              </Badge>
              <Badge variant="default">{item.category}</Badge>
              <Badge variant={item.criticality === "critical" ? "warn" : "default"}>
                {item.criticality}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-subtle">Holders</p>
              <ul className="mt-1 space-y-1">
                {selected.owners.length === 0 && (
                  <li className="text-sm text-warn">No proficient/expert owner</li>
                )}
                {selected.owners.map((o) => (
                  <li key={o.id} className="text-sm">
                    {o.name}{" "}
                    <span className="text-muted">· {o.role}</span>
                  </li>
                ))}
              </ul>
            </div>
            {selected.soleOwner && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                Single point of failure. Cross-train or document before this person is unavailable.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Select a knowledge node.</p>
        )}

        <div className="mt-6 border-t border-border pt-4">
          <p className="text-[11px] font-medium tracking-wide text-subtle uppercase">
            Highest risk
          </p>
          <ul className="mt-2 space-y-2">
            {risks
              .filter((r) => r.riskScore >= 65)
              .map((r) => (
                <li key={r.knowledgeId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.knowledgeId)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      selectedId === r.knowledgeId
                        ? "border-primary/40 bg-primary/10"
                        : "border-border bg-elevated hover:border-border-strong",
                    )}
                  >
                    <span className="font-medium">{r.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Risk {r.riskScore}
                      {r.soleOwner ? " · SPOF" : ""}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
