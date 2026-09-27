import { Link } from "@tanstack/react-router";

/** Links to the privacy notice, the terms, and the firm workspace. Shown wherever an account can be created or a roster saved. */
export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted ${className}`}>
      <nav className="flex gap-x-4" aria-label="Legal">
        <Link to="/privacy" className="underline-offset-4 hover:text-fg hover:underline">
          Privacy
        </Link>
        <Link to="/terms" className="underline-offset-4 hover:text-fg hover:underline">
          Terms
        </Link>
      </nav>
      <Link
        to="/firm"
        title="For accountants and advisors who look after several businesses"
        className="underline-offset-4 hover:text-fg hover:underline"
      >
        Firm workspace
      </Link>
    </div>
  );
}
