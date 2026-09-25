import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PILOT_OFFER, type FirmPlan } from "@/lib/precog/firm/pricing";
import type { BillingAccount } from "@/lib/precog/firm/billing-store";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/precog/firm/billing-store";
import { openBillingPortal, startCheckout } from "@/lib/precog/billing/server";

/**
 * The offer and how to buy it. With Stripe connected the buttons open
 * Checkout and the plan follows the webhook; without it the owner records
 * the stage by hand, as before.
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
  const active = billing?.subscriptionStatus
    ? ACTIVE_SUBSCRIPTION_STATUSES.has(billing.subscriptionStatus)
    : false;

  async function buy(which: "assessment" | "monthly") {
    setBusy(true);
    try {
      const { url } = await startCheckout({ data: { plan: which } });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout could not be started.");
      setBusy(false);
    }
  }

  async function portal() {
    setBusy(true);
    try {
      const { url } = await openBillingPortal();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The billing portal could not be opened.");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">Plan</h2>
      <p className="mt-1 text-sm text-muted">
        {PILOT_OFFER.assessmentLabel}: ${PILOT_OFFER.assessmentFeeUsd.toLocaleString()} —{" "}
        {PILOT_OFFER.assessmentDetail} It converts to the {PILOT_OFFER.monthlyLabel} at $
        {PILOT_OFFER.monthlyFeeUsd}/month for {PILOT_OFFER.monthlyClients} clients.{" "}
        {PILOT_OFFER.monthlyDetail}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Current plan</dt>
          <dd className="mt-1 font-medium">
            {plan === "monthly" ? PILOT_OFFER.monthlyLabel : "Assessment"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Assessment paid</dt>
          <dd className="mt-1 font-medium">
            {billing?.assessmentPaidAt ? billing.assessmentPaidAt.slice(0, 10) : "Not recorded"}
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
      </dl>
      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2">
          {billingConfigured ? (
            <>
              {!billing?.assessmentPaidAt && (
                <Button size="sm" onClick={() => void buy("assessment")} disabled={busy}>
                  Pay the ${PILOT_OFFER.assessmentFeeUsd.toLocaleString()} assessment
                </Button>
              )}
              {!active && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void buy("monthly")}
                  disabled={busy}
                >
                  Start the firm plan (${PILOT_OFFER.monthlyFeeUsd}/month)
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
                {plan === "monthly" ? "Mark back to assessment" : "Mark converted to monthly"}
              </Button>
              <p className="self-center text-xs text-subtle">
                Card payments are not connected on this deployment; payment is invoiced outside
                Precog.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
