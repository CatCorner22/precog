import { SectionHeading } from "./start-here-parts";
import { METHOD_CAVEATS } from "@/lib/precog/evidence";
import { Card, CardContent } from "@/components/ui/card";

export function StartHereLimitsSection() {
  return (
    <section className="space-y-3">
      <SectionHeading title="What this cannot tell you" />
      <Card>
        <CardContent className="pt-5">
          <ul className="space-y-2">
            {METHOD_CAVEATS.map((c) => (
              <li key={c} className="flex gap-2 text-sm leading-relaxed text-muted">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-subtle" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
