import { SectionHeading } from "./start-here-parts";
import { COLLUSION_CAVEAT, METHOD_CAVEATS } from "@/lib/precog/evidence";
import { usePresentation } from "@/lib/precog/presentation";
import { Card, CardContent } from "@/components/ui/card";

export function StartHereLimitsSection() {
  const { say } = usePresentation();
  return (
    <section className="space-y-3">
      <SectionHeading title="What this cannot tell you" />
      <Card>
        <CardContent className="pt-5">
          <ul className="space-y-2">
            {METHOD_CAVEATS.map((c) => (
              <li key={c} className="flex gap-2 text-sm leading-relaxed text-muted">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-subtle" />
                <span>{c === COLLUSION_CAVEAT.tactical ? say(COLLUSION_CAVEAT.plain, c) : c}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
