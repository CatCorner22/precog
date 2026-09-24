import { Link } from "@tanstack/react-router";

/** Links to the privacy notice and terms. Shown wherever an account can be created or a roster saved. */
export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <nav
      className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted ${className}`}
      aria-label="Legal"
    >
      <Link to="/privacy" className="underline-offset-4 hover:text-fg hover:underline">
        Privacy
      </Link>
      <Link to="/terms" className="underline-offset-4 hover:text-fg hover:underline">
        Terms
      </Link>
      <Link to="/firm" className="underline-offset-4 hover:text-fg hover:underline">
        Firm workspace
      </Link>
    </nav>
  );
}
