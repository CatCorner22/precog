import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ControlReport } from "@/components/precog/control-report";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getFirm, getReport } from "@/lib/precog/firm/server";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import type { FrozenReport } from "@/lib/precog/report/stored-model";
import type { PracticeProfile } from "@/lib/precog/practice-profile";
import { usePractice } from "@/lib/precog/practice-context";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { localDateKey } from "@/lib/precog/dates";

export const Route = createFileRoute("/report")({
  component: ReportPage,
  validateSearch: (search: Record<string, unknown>): { version?: string } =>
    typeof search.version === "string" && /^[\w-]{4,64}$/.test(search.version)
      ? { version: search.version }
      : {},
  head: () => ({
    meta: [
      { title: "Control Priorities Report · Precog" },
      {
        name: "description",
        content:
          "Print-ready internal control priorities report: this week's actions, priority stack, duty conflicts, know-how only one person holds, and the Decisions log.",
      },
    ],
  }),
});

function ReportPage() {
  const { version } = Route.useSearch();
  if (version) return <LockedReport id={version} />;
  return <LiveReport />;
}

/**
 * The current report. The "Prepared for … by …" line names the viewer's firm
 * only for a firm client (a member belongs to one firm, so a firm client they
 * can see is their firm's); a signed-out visitor or a solo business makes no
 * server call and prints no firm.
 */
function LiveReport() {
  // The user object is rebuilt on every render; the id is the stable key, so
  // the effect (and its getFirm() call) runs on sign-in changes only.
  const userId = useCurrentUser()?.id ?? null;
  const { profile, businesses } = usePractice();
  const businessId = profile.businessId ?? null;
  const firmClient = Boolean(businesses.find((b) => b.id === businessId)?.firmClient);
  const [firmName, setFirmName] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !firmClient) {
      setFirmName(null);
      return;
    }
    let cancel = false;
    void getFirm()
      .then((res) => {
        if (!cancel) setFirmName(res.firm?.name ?? null);
      })
      .catch(() => {
        if (!cancel) setFirmName(null);
      });
    return () => {
      cancel = true;
    };
  }, [userId, firmClient]);

  return <ControlReport firmName={firmName} />;
}

/**
 * A locked version: the frozen profile under a read-only provider, printed
 * from the figures stored when it was locked (null for an older version).
 */
function LockedReport({ id }: { id: string }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | {
        kind: "ready";
        version: ReportVersionRow;
        profile: PracticeProfile;
        frozen: FrozenReport | null;
        firmName: string | null;
      }
  >({ kind: "loading" });

  useEffect(() => {
    let cancel = false;
    setState({ kind: "loading" });
    void getReport({ data: { id, today: localDateKey(new Date()) } })
      .then((res) => {
        if (!cancel) {
          setState({
            kind: "ready",
            version: res.version,
            profile: res.profile,
            frozen: res.frozen,
            firmName: res.firmName,
          });
        }
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
        <h1 className="text-xl font-semibold">Precog could not open this report version</h1>
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
      <ControlReport locked={state.version} frozen={state.frozen} firmName={state.firmName} />
    </ReadOnlyPracticeProvider>
  );
}
