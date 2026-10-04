import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { loadReportShare } from "@/lib/precog/share/share-server";
import { clientErrorStatus } from "@/lib/request-errors";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import type { FirmSnapshot } from "@/lib/precog/firm/store";
import type { FrozenReport } from "@/lib/precog/report/stored-model";
import type { PracticeProfile } from "@/lib/precog/practice-profile";
import { formatDay } from "@/lib/precog/dates";
import { ShareGate } from "@/components/precog/share-gate";

export const SHARED_REPORT_TITLE = "Shared report · Precog";
export const SHARED_REPORT_UNAVAILABLE = "Shared report unavailable";

export const Route = createFileRoute("/share/report/$token")({
  component: SharedReportPage,
  head: () => ({
    meta: [
      { title: SHARED_REPORT_TITLE },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Read-only view of a locked internal control priorities report, as issued.",
      },
    ],
  }),
});

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; reason: string }
  | {
      kind: "ok";
      version: ReportVersionRow;
      frozen: Pick<FrozenReport, "layoutVersion" | "model"> | null;
      firm: FirmSnapshot | null;
      profile: PracticeProfile;
      expiresAt: string | null;
    };

// The report renderer and the engines behind it load after the page itself,
// as the signed-in report page's chunk does, so the gate and the share bar
// answer before the report's code arrives.
const SharedReport = lazy(() =>
  Promise.all([
    import("@/components/precog/control-report"),
    import("@/lib/precog/read-only-practice"),
  ]).then(([report, provider]) => ({
    default: function SharedReport({
      version,
      frozen,
      firm,
      profile,
    }: Pick<Extract<LoadState, { kind: "ok" }>, "version" | "frozen" | "firm" | "profile">) {
      return (
        <provider.ReadOnlyPracticeProvider profile={profile}>
          <report.ControlReport
            locked={version}
            frozen={frozen}
            firm={firm}
            coverPage={false}
            shared
          />
        </provider.ReadOnlyPracticeProvider>
      );
    },
  })),
);

function SharedReportPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const loadShare = useCallback(
    async (code?: string) => {
      setState({ kind: "loading" });
      try {
        const res = await loadReportShare({ data: { token, passcode: code } });
        if (!res.found) setState({ kind: "error", reason: res.reason });
        else
          setState({
            kind: "ok",
            version: res.version,
            frozen: res.frozen,
            firm: res.firm,
            profile: res.profile,
            expiresAt: res.expiresAt,
          });
      } catch (err) {
        // A throttled reader waits a minute; anyone else checks the connection.
        setState({
          kind: "error",
          reason: clientErrorStatus(err) === 429 ? "throttled" : "network",
        });
      }
    },
    [token],
  );

  useEffect(() => {
    void loadShare();
  }, [loadShare]);

  if (state.kind === "loading") {
    return (
      <div className="min-h-dvh bg-white p-8 text-sm text-neutral-500" aria-busy="true">
        Loading shared report…
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <ShareGate
        reason={state.reason}
        heading={SHARED_REPORT_UNAVAILABLE}
        onRetry={() => void loadShare()}
        onPasscode={(passcode) => void loadShare(passcode)}
      />
    );
  }

  const { version, expiresAt } = state;
  return (
    <div className="min-h-dvh bg-white text-neutral-900">
      {/* The page's one toolbar: ControlReport's own stays off under `shared`. */}
      <div className="print:hidden sticky top-[var(--grok-banner-h,0px)] z-10 border-b border-neutral-200 bg-neutral-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-3 text-xs text-neutral-600">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="size-3.5" /> Read-only share · version {version.versionNo}
            {version.reviewedAt ? ` · issued ${formatDay(version.reviewedAt)}` : ""}
            {expiresAt ? ` · expires ${formatDay(expiresAt)}` : ""}
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-white"
          >
            Print
          </button>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="p-8 text-sm text-neutral-500" aria-busy="true">
            Loading shared report…
          </div>
        }
      >
        <SharedReport
          version={version}
          frozen={state.frozen}
          firm={state.firm}
          profile={state.profile}
        />
      </Suspense>
    </div>
  );
}
