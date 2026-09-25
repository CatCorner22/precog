import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ControlReport } from "@/components/precog/control-report";
import { useHydrated } from "@/lib/use-hydrated";
import { getReport } from "@/lib/precog/firm/server";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import type { PracticeProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { localDateKey } from "@/lib/precog/decisions/follow-through";

export const Route = createFileRoute("/report")({
  component: ReportPage,
  validateSearch: (search: Record<string, unknown>): { version?: string } =>
    typeof search.version === "string" && /^[\w-]{4,64}$/.test(search.version)
      ? { version: search.version }
      : {},
  head: () => ({
    meta: [
      { title: "Control Priorities Report · Precog Pioneer" },
      {
        name: "description",
        content:
          "Print-ready internal control priorities report: weekly actions, priority stack, SoD, knowledge SPOFs, and decision log.",
      },
    ],
  }),
});

function ReportPage() {
  const hydrated = useHydrated();
  const { version } = Route.useSearch();
  if (!hydrated) {
    return (
      <div className="min-h-dvh bg-white p-8 text-sm text-neutral-500" aria-busy="true">
        Preparing report…
      </div>
    );
  }
  if (version) return <LockedReport id={version} />;
  return <ControlReport />;
}

/** A locked version: the frozen profile under a read-only provider. */
function LockedReport({ id }: { id: string }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; version: ReportVersionRow; profile: PracticeProfile }
  >({ kind: "loading" });

  useEffect(() => {
    let cancel = false;
    setState({ kind: "loading" });
    void getReport({ data: { id, today: localDateKey(new Date()) } })
      .then((res) => {
        if (!cancel) setState({ kind: "ready", version: res.version, profile: res.profile });
      })
      .catch((err: unknown) => {
        if (!cancel) {
          setState({
            kind: "error",
            message:
              err instanceof Error && err.message !== "Unauthorized"
                ? err.message
                : "Sign in with a firm account that can see this client to open the version.",
          });
        }
      });
    return () => {
      cancel = true;
    };
  }, [id]);

  if (state.kind === "loading") {
    return (
      <div className="min-h-dvh bg-white p-8 text-sm text-neutral-500" aria-busy="true">
        Opening the locked version…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">This report version could not be opened</h1>
        <p className="mt-2 text-sm text-muted">{state.message}</p>
        <p className="mt-6 text-sm">
          <Link to="/report" className="underline-offset-4 hover:underline">
            Open the current report
          </Link>
        </p>
      </main>
    );
  }
  return (
    <ReadOnlyPracticeProvider profile={state.profile}>
      <ControlReport locked={state.version} />
    </ReadOnlyPracticeProvider>
  );
}
