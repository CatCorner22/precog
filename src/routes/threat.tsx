import { createFileRoute } from "@tanstack/react-router";
import { ThreatAssessment } from "@/components/precog/threat-assessment";

export const Route = createFileRoute("/threat")({
  component: ThreatPage,
  head: () => ({
    meta: [
      { title: "Threat Assessment · Precog Pioneer" },
      {
        name: "description",
        content:
          "Special-operations style educational threat assessment for small dental practices — residual risk, SoD, SPOFs, and control ROE.",
      },
    ],
  }),
});

function ThreatPage() {
  return <ThreatAssessment />;
}
