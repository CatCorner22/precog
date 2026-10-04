import { createFileRoute, Link } from "@tanstack/react-router";
import { CASE_COUNT } from "@/lib/precog/evidence/case-count";
import { LegalFooter } from "@/components/precog/legal-footer";
import { buttonClass } from "@/components/ui/button-variants";

/**
 * The landing page: what Precog shows a business owner, with the way into
 * setup and the firm offer. It renders on the server and loads none of the
 * business engine, so a first visit and a share preview paint at once. The
 * home page sends a signed-out visitor with no business here.
 */
const WELCOME_DESCRIPTION =
  "Precog shows a small-business owner who can move money alone, what one absence would stop, and which fix to make this week.";

export const Route = createFileRoute("/welcome")({
  component: WelcomePage,
  // The title stays the root's; the share description is this page's own.
  head: () => ({
    meta: [
      { name: "description", content: WELCOME_DESCRIPTION },
      { property: "og:description", content: WELCOME_DESCRIPTION },
    ],
  }),
});

function WelcomePage() {
  return (
    <main className="mx-auto min-h-[calc(100dvh-var(--grok-banner-h,0px))] max-w-4xl px-6 py-10">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Precog</p>
      <div className="mt-6 grid items-center gap-8 md:grid-cols-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            See who in your business can move or hide money alone
          </h1>
          <p className="mt-4 text-sm text-muted">
            Precog maps who holds which money duties, shows what stops when one person is away, and
            tells you what to check each month, with prosecuted cases behind the findings.
          </p>
          <p className="mt-3 text-sm font-medium">
            {`${CASE_COUNT} prosecuted cases behind the findings.`}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/" search={{ start: true }} className={buttonClass()}>
              Set up your business
            </Link>
            <Link to="/login" className={buttonClass({ variant: "secondary" })}>
              Sign in
            </Link>
          </div>
        </div>
        <img src="/og.svg" alt="" className="w-full rounded-xl border border-border" />
      </div>

      <p className="mt-10 text-sm text-muted">
        Accountants and advisors: run several client businesses on the Firm plan.{" "}
        <Link to="/pricing" className="underline-offset-4 hover:text-fg hover:underline">
          See pricing
        </Link>{" "}
        ·{" "}
        <Link to="/firm" className="underline-offset-4 hover:text-fg hover:underline">
          Firm workspace
        </Link>
      </p>

      <LegalFooter className="mt-10" />
    </main>
  );
}
