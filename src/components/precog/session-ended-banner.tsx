import { Link } from "@tanstack/react-router";
import { buttonClass } from "@/components/ui/button-variants";
import { useSessionEnded } from "@/lib/precog/practice-context";

/** The banner text while the signed-in session has ended. */
export const SESSION_ENDED_MESSAGE =
  "Your session ended. Sign in again to keep working on this business. Until then, Precog shows it read-only.";

/**
 * Shown above the business when the signed-in session ended without a
 * sign-out in this browser (it expired, or another device signed it out).
 * Precog keeps the business on screen read-only and saves nothing until the
 * owner signs in again. Renders nothing otherwise.
 */
export function SessionEndedBanner() {
  if (!useSessionEnded()) return null;
  return (
    <div
      role="status"
      className="mx-4 mt-2 flex flex-wrap items-center gap-3 rounded border border-border bg-panel p-3 text-sm"
    >
      <p className="min-w-0 flex-1">{SESSION_ENDED_MESSAGE}</p>
      <Link to="/login" className={buttonClass({ size: "sm" })}>
        Sign in
      </Link>
    </div>
  );
}
