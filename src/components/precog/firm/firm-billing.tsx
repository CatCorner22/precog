import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PILOT_OFFER, type FirmPlan } from "@/lib/precog/firm/pricing";
import type { BillingAccount } from "@/lib/precog/firm/billing-store";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/precog/firm/billing-store";
import { getPlanPrices, openBillingPortal, startCheckout } from "@/lib/precog/billing/server";
import { formatPlanPrice, type CheckoutPlan, type PlanPrice } from "@/lib/precog/billing/stripe";
import { formatUsd } from "@/lib/utils";

/**
 * The offer and how to buy it. With Stripe connected the buttons open
 * Checkout, print the amounts of the Stripe prices they charge, and the plan
 * follows the webhook; without it the owner records the stage by hand.
 */
export function FirmBilling({
  plan,
  billing,
  billingConfigured,
  canManage,
  onMarkPlan,
}: {
  plan: FirmPlan;
  billing: BillingAccount | null;
  billingConfigured: boolean;
  canManage: boolean;
  onMarkPlan: (plan: FirmPlan) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<Record<CheckoutPlan, PlanPrice> | null>(null);
  const active = billing?.subscriptionStatus
    ? ACTIVE_SUBSCRIPTION_STATUSES.has(billing.subscriptionStatus)
    : false;

  useEffect(() => {
    if (!billingConfigured) return;
    let cancel = false;
    void getPlanPrices()
      .then((res) => {
        if (!cancel) setPrices(res.prices);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [billingConfigured]);

  // With Stripe connected, only Stripe's own amounts are printed; the offer's
  // figures describe the manual (invoiced) arrangement.
  const amounts = billingConfigured
    ? prices && {
        assessment: formatPlanPrice(prices.assessment),
        monthly: formatPlanPrice(prices.monthly),
      }
    : {
        assessment: formatUsd(PILOT_OFFER.assessmentFeeUsd),
        monthly: `${formatUsd(PILOT_OFFER.monthlyFeeUsd)} a month`,
      };

  async function buy(which: CheckoutPlan) {
    setBusy(true);
    try {
      const { url } = await startCheckout({ data: { plan: which } });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Precog could not start checkout.");
      setBusy(false);
    }
  }

  async function portal() {
    setBusy(true);
    try {
      const { url } = await openBillingPortal();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Precog could not open the billing portal.");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">Plan</h2>
      <p className="mt-1 text-sm text-muted">
        {PILOT_OFFER.assessmentLabel}
        {amounts ? `: ${amounts.assessment}` : ""} — {PILOT_OFFER.assessmentDetail} The assessment
        converts to the {PILOT_OFFER.monthlyLabel}
        {amounts ? ` at ${amounts.monthly}` : ""}. {PILOT_OFFER.monthlyDetail}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Current plan</dt>
          <dd className="mt-1 font-medium">
            {plan === "monthly" ? PILOT_OFFER.monthlyLabel : PILOT_OFFER.assessmentLabel}
          </dd>
        </div>
        {billingConfigured && (
          <>
            <div>
              <dt className="text-xs text-muted">Assessment paid</dt>
              <dd className="mt-1 font-medium">
                {billing?.assessmentPaidAt ? billing.assessmentPaidAt.slice(0, 10) : "Not yet"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Subscription</dt>
              <dd className="mt-1 font-medium">
                {billing?.subscriptionStatus
                  ? `${billing.subscriptionStatus}${billing.currentPeriodEnd ? ` · renews ${billing.currentPeriodEnd.slice(0, 10)}` : ""}`
                  : "None"}
              </dd>
            </div>
          </>
        )}
      </dl>
      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2">
          {billingConfigured ? (
            <>
              {!billing?.assessmentPaidAt && !active && (
                <p className="w-full text-xs text-subtle">
                  Start with the assessment, or go straight to the {PILOT_OFFER.monthlyLabel}.
                </p>
              )}
              {!billing?.assessmentPaidAt && (
                <Button size="sm" onClick={() => void buy("assessment")} disabled={busy}>
                  Pay for the assessment{amounts ? ` (${amounts.assessment})` : ""}
                </Button>
              )}
              {!active && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void buy("monthly")}
                  disabled={busy}
                >
                  Start the {PILOT_OFFER.monthlyLabel}
                  {amounts ? ` (${amounts.monthly})` : ""}
                </Button>
              )}
              {billing?.stripeCustomerId && (
                <Button size="sm" variant="secondary" onClick={() => void portal()} disabled={busy}>
                  Manage billing
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void onMarkPlan(plan === "monthly" ? "assessment" : "monthly")}
              >
                {plan === "monthly"
                  ? "Mark as back on the assessment"
                  : `Mark as moved to the ${PILOT_OFFER.monthlyLabel}`}
              </Button>
              <p className="self-center text-xs text-subtle">
                Card payments are not connected on this deployment, so we invoice you outside
                Precog.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
