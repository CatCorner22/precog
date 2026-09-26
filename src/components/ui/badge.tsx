import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tracking-wide",
  {
    variants: {
      variant: {
        default: "border-border bg-elevated text-muted",
        primary: "border-primary/30 bg-primary/10 text-primary",
        danger: "border-danger/30 bg-danger/10 text-danger",
        warn: "border-warn/30 bg-warn/10 text-warn",
        ok: "border-ok/30 bg-ok/10 text-ok",
        accent: "border-accent/30 bg-accent/10 text-accent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

/** A span, so a badge may sit inside a button or a paragraph. */
export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
