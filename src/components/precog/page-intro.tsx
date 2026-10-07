import type { KeyboardEvent, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { tabLabel, type NavTarget } from "@/lib/precog/navigation";
import { usePresentation } from "@/lib/precog/presentation";
import { cn } from "@/lib/utils";

/** One sentence in both wordings, or the same sentence for both. */
export type Wording = string | { plain: string; tactical: string };

function pick(wording: Wording, say: (plain: string, tactical: string) => string): string {
  return typeof wording === "string" ? wording : say(wording.plain, wording.tactical);
}

/**
 * The top of a page: its name, which is the tab that opened it in the active
 * wording, one sentence saying what the page is for, and the method folded
 * under "How this works" so the work comes first.
 */
export function PageIntro({
  tab,
  purpose,
  method,
  icon,
  className,
}: {
  tab: NavTarget;
  purpose: Wording;
  /** The method, folded until the owner asks for it. */
  method?: ReactNode;
  /** Drawn before the name, for pages with an emblem. */
  icon?: ReactNode;
  className?: string;
}) {
  const { say } = usePresentation();
  return (
    <div className={cn("space-y-2", className)}>
      <div>
        <h1 className={cn("text-lg font-semibold", icon && "flex items-center gap-2")}>
          {icon}
          {tabLabel(tab, say)}
        </h1>
        <p className="max-w-2xl text-sm text-muted">{pick(purpose, say)}</p>
      </div>
      {method && <HowThisWorks>{method}</HowThisWorks>}
    </div>
  );
}

/**
 * Space toggles the fold even where a page-wide key handler (the process
 * map's pan key) cancels the browser's own Space activation.
 */
function toggleOnSpace(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== " ") return;
  e.preventDefault();
  const details = e.currentTarget.parentElement;
  if (details instanceof HTMLDetailsElement) details.open = !details.open;
}

/** The method behind a page or section, closed by default. */
export function HowThisWorks({
  children,
  className,
  bodyClassName,
  summary = "How this works",
}: {
  children: ReactNode;
  className?: string;
  /** Classes for the body, for a fold that holds whole sections rather than a note. */
  bodyClassName?: string;
  summary?: string;
}) {
  return (
    <details className={cn("group max-w-2xl rounded-xl border border-border", className)}>
      <summary
        className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm font-medium"
        onKeyDown={toggleOnSpace}
      >
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        {summary}
      </summary>
      <div className={cn("space-y-3 px-4 pb-4 text-sm leading-relaxed text-muted", bodyClassName)}>
        {children}
      </div>
    </details>
  );
}
