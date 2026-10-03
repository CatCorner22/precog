import { Link } from "@tanstack/react-router";
import { SUPPORT_EMAIL } from "@/lib/precog/legal/operator";

/**
 * Links to the privacy notice, the terms, the support mailbox, and the firm
 * workspace. Shown on the home screen, onboarding, and wherever an account can
 * be created or a roster saved. The firm workspace passes `hideFirmLink`, so
 * it never links to itself.
 */
export function LegalFooter({
  className = "",
  hideFirmLink = false,
}: {
  className?: string;
  hideFirmLink?: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted ${className}`}>
      <nav className="flex gap-x-4" aria-label="Legal">
        <Link to="/privacy" className="underline-offset-4 hover:text-fg hover:underline">
          Privacy
        </Link>
        <Link to="/terms" className="underline-offset-4 hover:text-fg hover:underline">
          Terms
        </Link>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="underline-offset-4 hover:text-fg hover:underline"
        >
          Support
        </a>
      </nav>
      {!hideFirmLink && (
        <Link
          to="/firm"
          title="For accountants and advisors who look after several businesses"
          className="underline-offset-4 hover:text-fg hover:underline"
        >
          Firm workspace
        </Link>
      )}
    </div>
  );
}
