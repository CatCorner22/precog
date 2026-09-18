import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadReviewerView, submitCheckin, type ReviewerView } from "@/lib/precog/builder/review-link-server";
import { FREQUENCY_DAYS, FREQUENCY_LABEL } from "@/lib/precog/builder/evidence";
import { CheckCircle2, ClipboardCheck, Loader2, Lock } from "lucide-react";

export const Route = createFileRoute("/checkin/$token")({
  component: CheckinPage,
  head: () => ({
    meta: [
      { title: "Control check-in · Precog Pioneer" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type State =
  | { kind: "loading" }
  | { kind: "error"; reason: string }
  | { kind: "ok"; view: ReviewerView };

const NAME_KEY = "precog.checkin.name";

function CheckinPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      // ignore
    }
    let cancelled = false;
    void loadReviewerView({ data: { token } })
      .then((res) => {
        if (cancelled) return;
        if (!res.found) setState({ kind: "error", reason: res.reason });
        else setState({ kind: "ok", view: res.view });
      })
      .catch(() => !cancelled && setState({ kind: "error", reason: "network" }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const grouped = useMemo(() => {
    if (state.kind !== "ok") return [];
    const now = Date.now();
    const rows = state.view.items.map((i) => {
      const period = FREQUENCY_DAYS[i.frequency];
      const daysLeft = i.lastDoneAt
        ? Math.round(period - (now - new Date(i.lastDoneAt).getTime()) / 86_400_000)
        : null;
      const status: "never" | "overdue" | "due_soon" | "current" =
        daysLeft === null ? "never" : daysLeft < 0 ? "overdue" : daysLeft <= Math.max(1, Math.round(period * 0.2)) ? "due_soon" : "current";
      return { ...i, daysLeft, status };
    });
    const rank = { overdue: 0, never: 1, due_soon: 2, current: 3 };
    rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
    return rows;
  }, [state]);

  async function done(processId: string, evidenceId: string) {
    const key = `${processId}::${evidenceId}`;
    setBusy(key);
    try {
      try {
        localStorage.setItem(NAME_KEY, name);
      } catch {
        // ignore
      }
      const res = await submitCheckin({ data: { token, processId, evidenceId, byName: name, note: notes[key] } });
      if (!res.ok) {
        setState({ kind: "error", reason: "unavailable" });
        return;
      }
      setState((s) =>
        s.kind === "ok"
          ? {
              kind: "ok",
              view: {
                ...s.view,
                items: s.view.items.map((i) =>
                  i.processId === processId && i.evidenceId === evidenceId
                    ? { ...i, lastDoneAt: res.doneAt, lastBy: res.byName }
                    : i,
                ),
              },
            }
          : s,
      );
      setNotes((n) => ({ ...n, [key]: "" }));
    } finally {
      setBusy(null);
    }
  }

  if (state.kind === "loading") {
    return <div className="min-h-dvh bg-white p-8 text-sm text-neutral-500">Loading checklist…</div>;
  }
  if (state.kind === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white p-8">
        <div className="max-w-sm text-center">
          <Lock className="mx-auto size-8 text-neutral-400" />
          <h1 className="mt-3 text-lg font-semibold text-neutral-900">Check-in link unavailable</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {state.reason === "network" ? "Couldn't reach the server. Try again." : "This link has expired, was revoked, or isn't valid. Ask the business owner for a new one."}
          </p>
          <Link to="/" className="mt-4 inline-block text-sm text-neutral-700 underline">
            Precog Pioneer
          </Link>
        </div>
      </div>
    );
  }

  const { view } = state;
  const open = grouped.filter((g) => g.status !== "current");

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-2xl px-5 py-4">
          <p className="text-xs font-semibold tracking-[0.2em] text-neutral-500 uppercase">Control check-in</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{view.businessName}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            You're signed in as <span className="font-medium">{view.label}</span>. Tick each review you've completed — the
            owner sees it immediately. You can't change the process map from here.
          </p>
          <label className="mt-3 block text-xs text-neutral-600">
            Your name (shown to the owner)
            <input
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none sm:w-72"
              placeholder={view.label}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
      </div>

      <main className="mx-auto max-w-2xl space-y-3 px-5 py-6">
        {view.items.length === 0 ? (
          <p className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
            No evidence items have been set up yet. Ask the owner to add reviews to their processes.
          </p>
        ) : (
          <>
            <p className="text-sm text-neutral-600">
              <span className="font-semibold text-neutral-900">{open.length}</span> of {grouped.length} reviews need attention.
            </p>
            <ul className="space-y-2">
              {grouped.map((g) => {
                const key = `${g.processId}::${g.evidenceId}`;
                const tone =
                  g.status === "overdue"
                    ? "border-red-300 bg-red-50"
                    : g.status === "never"
                      ? "border-amber-300 bg-amber-50"
                      : g.status === "due_soon"
                        ? "border-amber-200 bg-white"
                        : "border-neutral-200 bg-white";
                return (
                  <li key={key} className={`rounded-xl border p-4 ${tone}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{g.label}</p>
                        <p className="text-xs text-neutral-600">
                          {g.processName} · {FREQUENCY_LABEL[g.frequency]}
                          {g.reviewer ? ` · assigned to ${g.reviewer}` : ""}
                        </p>
                        <p className="mt-1 text-xs">
                          {g.status === "never" && <span className="text-amber-800">Never recorded</span>}
                          {g.status === "overdue" && <span className="font-medium text-red-700">Overdue by {Math.abs(g.daysLeft ?? 0)} days</span>}
                          {g.status === "due_soon" && <span className="text-amber-800">Due in {g.daysLeft} days</span>}
                          {g.status === "current" && (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 className="size-3.5" /> Current · next in {g.daysLeft} days
                            </span>
                          )}
                          {g.lastDoneAt && (
                            <span className="text-neutral-500">
                              {" "}
                              · last by {g.lastBy ?? "—"} on{" "}
                              {new Date(g.lastDoneAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void done(g.processId, g.evidenceId)}
                        disabled={busy === key}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                      >
                        {busy === key ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
                        {g.status === "current" ? "Record again" : "Mark done"}
                      </button>
                    </div>
                    <input
                      className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs focus:border-neutral-900 focus:outline-none"
                      placeholder="Optional note (e.g. 'Reconciled Aug statement, 2 items open')"
                      value={notes[key] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <p className="pt-2 text-[11px] text-neutral-500">
          Powered by Precog Pioneer. This link records reviews only; it cannot view or edit risk scores, people, or the process map.
          {view.expiresAt ? ` Expires ${new Date(view.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.` : ""}
        </p>
      </main>
    </div>
  );
}
