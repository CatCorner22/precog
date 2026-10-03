import { createFileRoute, Link } from "@tanstack/react-router";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { getPlanPrices } from "@/lib/precog/billing/server";
import {
  ASSESSMENT_INCLUDES,
  BILLING_TERMS_SENTENCE,
  FIRM_CLIENT_RULE,
  FIRM_INCLUDES,
  FREE_INCLUDES,
} from "@/lib/precog/firm/plan-contents";
import { PILOT_OFFER, planAmounts, type PlanAmounts } from "@/lib/precog/firm/pricing";
import { LegalFooter } from "@/components/precog/legal-footer";
import { buttonClass } from "@/components/ui/button-variants";

const PRICING_TITLE = "Pricing · Precog";
const PRICING_DESCRIPTION =
  "What Precog costs: free for one business, an Assessment for one client, the Firm plan for several.";

export const Route = createFileRoute("/pricing")({
  // The amounts as Stripe charges them, read before the page renders so the
  // served HTML already carries them. Null when the price service fails, so
  // the page never prints a figure Checkout would not charge.
  loader: () => getPlanPrices().catch(() => null),
  component: PricingPage,
  // The share tags repeat the title and description, so a shared /pricing
  // link unfurls as the pricing page rather than as the home page.
  head: () => ({
    meta: [
      { title: PRICING_TITLE },
      { name: "description", content: PRICING_DESCRIPTION },
      { property: "og:title", content: PRICING_TITLE },
      { property: "og:description", content: PRICING_DESCRIPTION },
    ],
  }),
});

function PricingPage() {
  // With Stripe connected only its own amounts print; without Stripe the
  // offer's own figures print; while the price is unknown, no figure.
  const prices = Route.useLoaderData();
  const amounts: PlanAmounts | null = prices ? planAmounts(prices.configured, prices.prices) : null;

  return (
    <main className="mx-auto min-h-[calc(100dvh-var(--grok-banner-h,0px))] max-w-4xl px-6 py-10">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Precog</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Pricing</h1>
      <p className="mt-2 text-sm text-muted">
        Precog is free for one business. A firm pays to run several.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <PlanCard name="Free" amount="Free" includes={FREE_INCLUDES} />
        <PlanCard
          name={PILOT_OFFER.assessmentLabel}
          amount={amounts?.assessment ?? null}
          includes={ASSESSMENT_INCLUDES}
        />
        <PlanCard
          name={PILOT_OFFER.monthlyLabel}
          amount={amounts?.monthly ?? null}
          includes={FIRM_INCLUDES}
          note={FIRM_CLIENT_RULE}
        />
      </div>

      <p className="mt-6 text-xs text-subtle">{BILLING_TERMS_SENTENCE}</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <SignedOut>
          <Link to="/login" className={buttonClass()}>
            Sign in to start
          </Link>
        </SignedOut>
        <SignedIn>
          <Link to="/firm" className={buttonClass()}>
            Open the Firm page
          </Link>
        </SignedIn>
      </div>

      <LegalFooter className="mt-10" />
    </main>
  );
}

/** One plan: its name, the amount (nothing while unknown), and what it includes. */
function PlanCard({
  name,
  amount,
  includes,
  note,
}: {
  name: string;
  amount: string | null;
  includes: readonly string[];
  note?: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold tracking-tight">{name}</h2>
      {amount && <p className="mt-1 text-2xl font-semibold tracking-tight">{amount}</p>}
      <p className="mt-4 text-xs font-medium tracking-wide text-muted uppercase">Includes</p>
      <ul className="mt-2 space-y-1 text-sm">
        {includes.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {note && <p className="mt-4 text-xs text-muted">{note}</p>}
    </section>
  );
}
