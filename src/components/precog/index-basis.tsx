import { INDEX_BASIS } from "@/lib/precog/scoring/bands";
import { cn } from "@/lib/utils";

/** One line, shown wherever a 0–100 index is printed, saying what the number is. */
export function IndexBasis({ className }: { className?: string }) {
  return <p className={cn("text-xs leading-relaxed text-subtle", className)}>{INDEX_BASIS}</p>;
}
