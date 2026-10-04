import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BILLING_TERMS_SENTENCE } from "@/lib/precog/firm/plan-contents";
import {
  PILOT_OFFER,
  planAmounts,
  type CheckoutPlan,
  type FirmPlan,
  type PlanAmounts,
  type PlanPrice,
} from "@/lib/precog/firm/pricing";
import type { BillingAccount } from "@/lib/precog/firm/billing-store";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  assessmentCreditApplies,
  assessmentPaid,
  subscriptionStatusLabel,
} from "@/lib/precog/firm/billing-store";
import { PAST_DUE_GRACE_DAYS, type Entitlements } from "@/lib/precog/firm/entitlements";
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
  entitlements,
  canManage,
  onMarkPlan,
}: {
  plan: FirmPlan;
  billing: BillingAccount | null;
  billingConfigured: boolean;
  /** Stripe's amounts; null while unknown, so no figure prints that Checkout would not charge. */
  prices: Record<CheckoutPlan, PlanPrice> | null;
  /** What the firm's plan opens today; null while unknown. */
  entitlements: Entitlements | null;
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
    <section id="plan" className="scroll-mt-16 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">Plan</h2>
      <p className="mt-1 text-sm text-muted">{planSentence(billingConfigured, billing, amounts)}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Current plan</dt>
          <dd className="mt-1 font-medium">
            {billingConfigured && entitlements
              ? currentPlanLabel(entitlements)
              : plan === "monthly"
                ? PILOT_OFFER.monthlyLabel
                : PILOT_OFFER.assessmentLabel}
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
              <p className="w-full text-xs text-subtle">{BILLING_TERMS_SENTENCE}</p>
              <Link to="/pricing" className="text-xs underline-offset-4 hover:underline">
                See pricing
              </Link>
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

/**
 * The offer in one sentence. With Stripe connected it says whether the
 * Assessment fee is credited against the Firm plan's invoices: it is on the
 * first subscription Checkout of an account that paid and was not refunded;
 * an account that subscribed before, or was credited already, paid a one-off.
 */
function planSentence(
  billingConfigured: boolean,
  billing: BillingAccount | null,
  amounts: PlanAmounts | null,
): string {
  const assessment = `${PILOT_OFFER.assessmentLabel}${amounts ? `: ${amounts.assessment}` : ""} — ${PILOT_OFFER.assessmentDetail}`;
  const monthly = `${PILOT_OFFER.monthlyLabel}${amounts ? ` at ${amounts.monthly}` : ""}`;
  if (!billingConfigured) {
    return `${assessment} The assessment converts to the ${monthly}. ${PILOT_OFFER.monthlyDetail}`;
  }
  if (assessmentCreditApplies(billing)) {
    return `${assessment} When you start the ${monthly}, the ${amounts ? amounts.assessment : "fee"} you paid for the Assessment is credited against its invoices, before tax. ${PILOT_OFFER.monthlyDetail}`;
  }
  if (billing?.subscriptionId || billing?.assessmentCreditUsedAt) {
    return `${assessment} The Assessment is a one-off payment. ${PILOT_OFFER.monthlyDetail}`;
  }
  return `${assessment} Start the ${monthly} later and the Assessment fee is credited against its invoices. ${PILOT_OFFER.monthlyDetail}`;
}

/** "Free", "Assessment (until 2026-12-30)", "Assessment (ended 2026-12-30)", "Firm plan" and its overdue and closed forms. */
function currentPlanLabel(e: Entitlements): string {
  if (e.closedAt) return `${PILOT_OFFER.monthlyLabel} (closed ${e.closedAt.slice(0, 10)})`;
  if (e.plan === "firm") {
    return e.graceEndsAt
      ? `${PILOT_OFFER.monthlyLabel} (payment overdue, closes ${e.graceEndsAt.slice(0, 10)})`
      : PILOT_OFFER.monthlyLabel;
  }
  if (e.plan === "assessment" && e.paidUntil) {
    return `${PILOT_OFFER.assessmentLabel} (until ${e.paidUntil.slice(0, 10)})`;
  }
  if (e.assessmentEndedAt) {
    return `${PILOT_OFFER.assessmentLabel} (ended ${e.assessmentEndedAt.slice(0, 10)})`;
  }
  return "Free";
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
 * cancelled. An overdue one with a known start says when the plan closes.
 */
function subscriptionCell(billing: BillingAccount | null): string {
  const status = billing?.subscriptionStatus ?? null;
  const label = subscriptionStatusLabel(status);
  if (status === "past_due" && billing?.pastDueSince) {
    const since = billing.pastDueSince.slice(0, 10);
    const closes = new Date(Date.parse(billing.pastDueSince) + PAST_DUE_GRACE_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return `${label} since ${since} · closes ${closes} unless the payment goes through`;
  }
  const day = billing?.currentPeriodEnd?.slice(0, 10);
  if (!day) return label;
  if (status && ACTIVE_SUBSCRIPTION_STATUSES.has(status)) return `${label} · renews ${day}`;
  if (status === "canceled") return `${label} · ends ${day}`;
  return label;
}
