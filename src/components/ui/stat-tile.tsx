import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export type StatTone = "danger" | "warn" | "ok" | "primary";

/** One figure on a card: its label as a toned badge, the value, and an optional line of basis. */
export function StatTile({
  label,
  value,
  hint,
  tone = "primary",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <Badge variant={tone}>{label}</Badge>
        <p className="mt-2 text-2xl font-semibold tabular">{value}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </CardContent>
    </Card>
  );
}
