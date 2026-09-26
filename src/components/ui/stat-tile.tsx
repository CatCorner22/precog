import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "danger" | "warn" | "ok" | "primary";

/**
 * One figure on a card: its label, the value, and an optional line of basis.
 * The label is a toned badge, or with `icon` a line of text led by the icon
 * in the tone's colour.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "primary",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
  icon?: LucideIcon;
}) {
  return (
    <Card className={cn(Icon && tone === "danger" && "border-danger/30")}>
      <CardContent className="p-4">
        {Icon ? (
          <div className="flex items-center gap-2 text-xs text-muted">
            <Icon className={cn("size-3.5", TONE_TEXT[tone])} aria-hidden />
            {label}
          </div>
        ) : (
          <Badge variant={tone}>{label}</Badge>
        )}
        <p className="mt-2 text-2xl font-semibold tabular">{value}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const TONE_TEXT: Record<StatTone, string> = {
  danger: "text-danger",
  warn: "text-warn",
  ok: "text-ok",
  primary: "text-primary",
};
