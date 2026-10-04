import { formatUsd } from "@/lib/utils";
import type { Entitlements } from "./entitlements";

export type FirmPlan = "assessment" | "monthly";

export type CheckoutPlan = "assessment" | "monthly";

/** What a plan costs, as the Stripe price behind its checkout button says. */
export interface PlanPrice {
  /** In the currency's main unit (dollars, not cents). */
  amount: number;
  /** ISO code in lower case, as Stripe writes it ("usd"). */
  currency: string;
  /** "month" for the Firm plan's subscription; null for a one-off payment. */
  interval: string | null;
}

/**
 * The offer as the firm page describes it. PILOT_OFFER is the only hard-coded
 * copy of the figures, and it prints only when Stripe is not configured: with
 * Stripe connected, every page prints the amounts of the Stripe prices the
 * checkout buttons charge (STRIPE_PRICE_ASSESSMENT, STRIPE_PRICE_MONTHLY), so
 * the price shown is the price charged. Without Stripe these figures are what
 * the firm is invoiced outside the product.
 */
export const PILOT_OFFER = {
  assessmentFeeUsd: 1000,
  assessmentLabel: "Assessment",
  assessmentDetail: "One client mapped, conflicts named, and a report the CPA can send.",
  monthlyFeeUsd: 299,
  monthlyLabel: "Firm plan",
  monthlyDetail: "Ongoing monthly reviews for your clients, with reminders by email.",
} as const;

/** "$1,000", "$299 a month", "$299.50 a month"; other currencies print in their own symbol. */
export function formatPlanPrice(price: PlanPrice): string {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(price.amount) ? 0 : 2,
  }).format(price.amount);
  return price.interval ? `${amount} a ${price.interval}` : amount;
}

/** The amounts a page prints for the two plans. */
export interface PlanAmounts {
  assessment: string;
  monthly: string;
}

/**
 * What to print for each plan. With Stripe configured, only Stripe's own
 * amounts print: null until they are known (loading, or Stripe did not
 * answer), so no page ever shows a figure Checkout would not charge. Without
 * Stripe, the PILOT_OFFER figures.
 */
export function planAmounts(
  configured: boolean,
  prices: Record<CheckoutPlan, PlanPrice> | null,
): PlanAmounts | null {
  if (configured) {
    if (!prices) return null;
    return {
      assessment: formatPlanPrice(prices.assessment),
      monthly: formatPlanPrice(prices.monthly),
    };
  }
  return {
    assessment: formatUsd(PILOT_OFFER.assessmentFeeUsd),
    monthly: `${formatUsd(PILOT_OFFER.monthlyFeeUsd)} a month`,
  };
}

/**
 * The firm page's note on what the paid plans open, for an account whose
 * plan closes the tools (Stripe connected). The amounts print only once
 * Stripe's are known, so the note never prints a figure Checkout would not
 * charge. After an Assessment's window ended, the note says so and what
 * stays.
 */
export function closedToolsNote(
  amounts: PlanAmounts | null,
  e: Pick<Entitlements, "plan" | "assessmentEndedAt">,
): string {
  const monthly = amounts ? ` (${amounts.monthly})` : "";
  const stays = "The Monthly review on each business's own screen stays open.";
  if (e.assessmentEndedAt) {
    return `Your Assessment's 90 days ended on ${e.assessmentEndedAt.slice(0, 10)}. The QuickBooks link and new locked versions are closed; every locked version you already hold stays. Start the Firm plan${monthly} on this page. ${stays}`;
  }
  const assessment = amounts ? ` (${amounts.assessment})` : "";
  return `The QuickBooks link, locked report versions, firm members, owner reminder emails and more than one client business are part of the Firm plan${monthly}. The Assessment${assessment} covers one client with locked versions and the QuickBooks link for 90 days from payment. ${stays}`;
}
