import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  PILOT_OFFER,
  planAmounts,
  type CheckoutPlan,
  type FirmPlan,
  type PlanPrice,
} from "@/lib/precog/firm/pricing";
import type { BillingAccount } from "@/lib/precog/firm/billing-store";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  assessmentPaid,
  subscriptionStatusLabel,
} from "@/lib/precog/firm/billing-store";
import { openBillingPortal, startCheckout } from "@/lib/precog/billing/server";

/**
 * The offer and how to buy it. With Stripe connected the buttons open
 * Checkout, print the amounts of the Stripe prices they charge (`prices`,
 * read by the page), and the plan follows the webhook; without it the owner
 * records the stage by hand.
 */
export function FirmBilling({
  plan,
  billing,
  billingConfigured,
  prices,
  canManage,
  onMarkPlan,
}: {
  plan: FirmPlan;
  billing: BillingAccount | null;
  billingConfigured: boolean;
  /** Stripe's amounts; null while unknown, so no figure prints that Checkout would not charge. */
  prices: Record<CheckoutPlan, PlanPrice> | null;
  canManage: boolean;
  onMarkPlan: (plan: FirmPlan) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const active = billing?.subscriptionStatus
    ? ACTIVE_SUBSCRIPTION_STATUSES.has(billing.subscriptionStatus)
    : false;
  const paid = assessmentPaid(billing);

  // With Stripe connected, only Stripe's own amounts are printed; the offer's
  // figures describe the manual (invoiced) arrangement.
  const amounts = planAmounts(billingConfigured, prices);

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
              <dd className="mt-1 font-medium">{assessmentCell(billing)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Subscription</dt>
              <dd className="mt-1 font-medium">{subscriptionCell(billing)}</dd>
            </div>
          </>
        )}
      </dl>
      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2">
          {billingConfigured ? (
            <>
              {!paid && !active && (
                <p className="w-full text-xs text-subtle">
                  Start with the assessment, or go straight to the {PILOT_OFFER.monthlyLabel}.
                </p>
              )}
              {!paid && (
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
              <p className="w-full text-xs text-subtle">
                The Firm plan renews until you cancel it in Manage billing; cancelling keeps access
                to the end of the paid period, and a started month is not refunded. The Assessment
                is not refunded once a report version is locked. Prices are before sales tax, which
                Checkout adds for your billing address. See the Terms.
              </p>
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

/** "Refunded 2026-09-20", "Disputed", the day it was paid, or "Not yet". */
function assessmentCell(billing: BillingAccount | null): string {
  if (billing?.assessmentRefundedAt) return `Refunded ${billing.assessmentRefundedAt.slice(0, 10)}`;
  if (billing?.assessmentDisputedAt) return "Disputed";
  return billing?.assessmentPaidAt ? billing.assessmentPaidAt.slice(0, 10) : "Not yet";
}

/**
 * The status in plain words, with the renewal date while the subscription
 * runs (an overdue one still renews once the card pays) or the end date once
 * cancelled.
 */
function subscriptionCell(billing: BillingAccount | null): string {
  const status = billing?.subscriptionStatus ?? null;
  const label = subscriptionStatusLabel(status);
  const day = billing?.currentPeriodEnd?.slice(0, 10);
  if (!day) return label;
  if (status && ACTIVE_SUBSCRIPTION_STATUSES.has(status)) return `${label} · renews ${day}`;
  if (status === "canceled") return `${label} · ends ${day}`;
  return label;
}
