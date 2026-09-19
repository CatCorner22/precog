import { createFileRoute } from "@tanstack/react-router";
import { LenderPack } from "@/components/precog/lender-pack";
import { useHydrated } from "@/lib/use-hydrated";

export const Route = createFileRoute("/pack")({
  component: PackPage,
  head: () => ({
    meta: [
      { title: "Lender & Insurer Pack · Precog Pioneer" },
      {
        name: "description",
        content:
          "Print-ready internal control pack: map health, control design vs operating effectiveness, test results, SoD, exposures, bus factor, decisions, and owner attestation.",
      },
    ],
  }),
});

function PackPage() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <div className="min-h-dvh bg-white p-8 text-sm text-neutral-500" aria-busy="true">
        Preparing pack…
      </div>
    );
  }
  return <LenderPack />;
}
