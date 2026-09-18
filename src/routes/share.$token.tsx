import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadMapShare, type SharedMapPayload } from "@/lib/precog/builder/share-server";
import { FREQUENCY_LABEL } from "@/lib/precog/builder/evidence";
import type { EvidenceFrequency } from "@/lib/precog/types";
import { Eye, Lock, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/share/$token")({
  component: SharePage,
  head: () => ({
    meta: [
      { title: "Shared process map · Precog Pioneer" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Read-only view of a small business process map, control coverage, and map health.",
      },
    ],
  }),
});

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; reason: string }
  | { kind: "ok"; payload: SharedMapPayload; createdAt: string; expiresAt: string | null };

function SharePage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void loadMapShare({ data: { token } })
      .then((res) => {
        if (cancelled) return;
        if (!res.found) setState({ kind: "error", reason: res.reason });
        else setState({ kind: "ok", payload: res.payload, createdAt: res.createdAt, expiresAt: res.expiresAt });
      })
      .catch(() => !cancelled && setState({ kind: "error", reason: "network" }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.kind === "loading") {
    return (
      <div className="min-h-dvh bg-white p-8 text-sm text-neutral-500" aria-busy="true">
        Loading shared map…
      </div>
    );
  }

  if (state.kind === "error") {
    const msg =
      state.reason === "revoked"
        ? "This link was revoked by the owner."
        : state.reason === "expired"
          ? "This link has expired."
          : state.reason === "network"
            ? "Couldn't reach the server. Try again."
            : "This link isn't valid.";
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white p-8">
        <div className="max-w-sm text-center">
          <Lock className="mx-auto size-8 text-neutral-400" />
          <h1 className="mt-3 text-lg font-semibold text-neutral-900">Shared map unavailable</h1>
          <p className="mt-1 text-sm text-neutral-600">{msg}</p>
          <Link to="/" className="mt-4 inline-block text-sm text-neutral-700 underline">
            Go to Precog Pioneer
          </Link>
        </div>
      </div>
    );
  }

  const { payload, expiresAt } = state;
  const stages = [...new Set(payload.processes.map((p) => p.stage))].sort((a, b) => a - b);
  const generated = new Date(payload.generatedAt);

  return (
    <div className="report min-h-dvh bg-white text-neutral-900">
      <div className="border-b border-neutral-200 bg-neutral-50">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-3 text-xs text-neutral-600">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="size-3.5" /> Read-only share · generated{" "}
            {generated.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {expiresAt
              ? ` · expires ${new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : ""}
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-white print:hidden"
          >
            Print
          </button>
        </div>
      </div>

      <article className="mx-auto max-w-5xl px-6 py-8">
        <header className="border-b-2 border-neutral-900 pb-4">
          <p className="text-xs font-semibold tracking-[0.2em] text-neutral-500 uppercase">
            Process map &amp; control coverage
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{payload.businessName}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {payload.industryLabel} · {payload.people.length}-person {payload.teamLabel} ·{" "}
            {payload.health.processCount} processes
          </p>
          {payload.note && (
            <p className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
              {payload.note}
            </p>
          )}
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center justify-center rounded-lg border border-neutral-300 px-6 py-4">
            <p className="text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">Map health</p>
            <p className="text-5xl font-bold tabular">{payload.health.score}</p>
            <p className="text-sm font-medium text-neutral-700">{payload.health.bandLabel}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-700">{payload.health.summary}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {payload.health.dimensions.map((d) => (
                <div key={d.id} className="rounded border border-neutral-300 p-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium">{d.label}</span>
                    <span className="text-sm font-bold tabular">{d.score}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-neutral-200">
                    <div className="h-full rounded-full bg-neutral-800" style={{ width: `${d.score}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-neutral-600">{d.hint}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Section title="Value stream">
          <ValueStreamSvg processes={payload.processes} stages={stages} />
        </Section>

        {payload.actions.length > 0 && (
          <Section title="Priorities this month">
            <ol className="space-y-1.5 text-sm">
              {payload.actions.map((a, i) => (
                <li key={a.title} className="flex gap-3">
                  <span className="w-5 shrink-0 font-semibold tabular text-neutral-500">{i + 1}.</span>
                  <div>
                    <p className="font-medium">
                      {a.title}{" "}
                      <span className="ml-1 rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600">
                        {a.effort} effort
                      </span>
                    </p>
                    <p className="text-neutral-600">{a.why}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        <Section title="Processes">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
                <th className="py-1.5 pr-2">Process</th>
                <th className="py-1.5 pr-2">Owner(s)</th>
                <th className="py-1.5 pr-2">Controls</th>
                <th className="py-1.5 pr-2">Top risk</th>
                <th className="py-1.5 pr-2">Evidence</th>
                <th className="py-1.5 text-right">Heat</th>
              </tr>
            </thead>
            <tbody>
              {payload.processes.map((p) => {
                const top = [...p.risks].sort((a, b) => b.severity * b.likelihood - a.severity * a.likelihood)[0];
                const overdue = p.evidence.filter((e) => e.status === "overdue" || e.status === "never").length;
                return (
                  <tr key={p.id} className="border-b border-neutral-200 align-top">
                    <td className="py-1.5 pr-2">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-neutral-600">{p.description}</p>
                    </td>
                    <td className="py-1.5 pr-2 text-neutral-700">{p.owners.join(", ") || <span className="text-red-700">unowned</span>}</td>
                    <td className="py-1.5 pr-2 text-neutral-700">
                      {p.controls.length ? (
                        <ul className="space-y-0.5">
                          {p.controls.map((c) => (
                            <li key={c.name} className="flex items-center gap-1">
                              <ShieldCheck className={`size-3 ${c.segregated ? "text-emerald-700" : "text-amber-600"}`} />
                              {c.name}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-neutral-400">none</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-neutral-700">
                      {top ? `${top.title} (S${top.severity}×L${top.likelihood})` : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-neutral-700">
                      {p.evidence.length ? (
                        <span className={overdue ? "text-amber-700" : ""}>
                          {p.evidence.length - overdue}/{p.evidence.length} current
                          {p.evidence[0] ? ` · ${FREQUENCY_LABEL[p.evidence[0].frequency as EvidenceFrequency] ?? p.evidence[0].frequency}` : ""}
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular">
                      <span className={p.heat >= 70 ? "font-semibold text-red-700" : p.heat >= 45 ? "text-amber-700" : "text-neutral-600"}>
                        {p.heat}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        {payload.issues.length > 0 && (
          <Section title="Open map issues">
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-neutral-700">
              {payload.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Team">
          <ul className="grid gap-1 text-sm sm:grid-cols-3">
            {payload.people.map((p) => (
              <li key={`${p.name}-${p.role}`} className="border-b border-neutral-200 py-1">
                <span className="font-medium">{p.name}</span>
                <span className="text-neutral-500"> · {p.role}</span>
              </li>
            ))}
          </ul>
        </Section>

        <footer className="mt-8 border-t border-neutral-300 pt-3 text-[11px] leading-relaxed text-neutral-500">
          Shared from Precog Pioneer. Educational internal-control decision support — not actuarial,
          legal, or forensic advice, and never an accusation against any person. This is a frozen
          snapshot; the owner's live map may have changed since.
        </footer>
      </article>
    </div>
  );
}

function ValueStreamSvg({
  processes,
  stages,
}: {
  processes: SharedMapPayload["processes"];
  stages: number[];
}) {
  const colW = 190;
  const rowH = 64;
  const boxW = 160;
  const boxH = 44;
  const byStage = new Map<number, typeof processes>();
  for (const p of processes) {
    const list = byStage.get(p.stage) ?? [];
    list.push(p);
    byStage.set(p.stage, list);
  }
  const pos = new Map<string, { x: number; y: number }>();
  stages.forEach((st, si) => {
    (byStage.get(st) ?? []).forEach((p, ri) => pos.set(p.id, { x: 10 + si * colW, y: 10 + ri * rowH }));
  });
  const maxRows = Math.max(1, ...stages.map((s) => byStage.get(s)?.length ?? 0));
  const width = 20 + stages.length * colW;
  const height = 20 + maxRows * rowH;
  const heatColor = (h: number) => (h >= 70 ? "#b91c1c" : h >= 45 ? "#b45309" : "#1f2937");

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-2">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="max-w-none" role="img" aria-label="Value stream diagram">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
          </marker>
        </defs>
        {processes.flatMap((p) =>
          p.dependencies.map((dep) => {
            const a = pos.get(dep);
            const b = pos.get(p.id);
            if (!a || !b) return null;
            const x1 = a.x + boxW;
            const y1 = a.y + boxH / 2;
            const x2 = b.x;
            const y2 = b.y + boxH / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={`${dep}-${p.id}`}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="#9ca3af"
                strokeWidth="1.5"
                markerEnd="url(#arrow)"
              />
            );
          }),
        )}
        {processes.map((p) => {
          const at = pos.get(p.id);
          if (!at) return null;
          return (
            <g key={p.id} transform={`translate(${at.x}, ${at.y})`}>
              <rect width={boxW} height={boxH} rx="8" fill="#fff" stroke={heatColor(p.heat)} strokeWidth="2" />
              <text x="10" y="18" fontSize="11" fontWeight="600" fill="#111827">
                {p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name}
              </text>
              <text x="10" y="33" fontSize="9.5" fill="#6b7280">
                {p.owners[0] ? p.owners[0].split(" ")[0] : "unowned"} · heat {p.heat}
                {p.controls.length ? ` · ${p.controls.length} ctrl` : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="mb-2 border-b border-neutral-300 pb-1 text-sm font-semibold tracking-wide text-neutral-800 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
