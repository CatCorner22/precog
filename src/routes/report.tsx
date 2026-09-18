import { createFileRoute } from "@tanstack/react-router";
import { ControlReport } from "@/components/precog/control-report";
import { useHydrated } from "@/lib/use-hydrated";

export const Route = createFileRoute("/report")({
  component: ReportPage,
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
  if (!hydrated) {
    return (
      <div className="min-h-dvh bg-white p-8 text-sm text-neutral-500" aria-busy="true">
        Preparing report…
      </div>
    );
  }
  return <ControlReport />;
}
