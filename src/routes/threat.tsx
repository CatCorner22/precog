import { createFileRoute, Link } from "@tanstack/react-router";
import { ThreatAssessmentPanel } from "@/components/precog/threat-assessment";

export const Route = createFileRoute("/threat")({
  component: ThreatPage,
  head: () => ({
    meta: [
      { title: "Threat Assessment · Precog Pioneer" },
      {
        name: "description",
        content:
          "Special-operations style educational threat assessment for dental practice residual risk, SoD gaps, knowledge SPOFs, and control priorities.",
      },
    ],
  }),
});

function ThreatPage() {
  return (
    <div>
      <ThreatAssessmentPanel />
      <div className="sr-only">
        <Link to="/">Return to Command</Link>
      </div>
    </div>
  );
}
