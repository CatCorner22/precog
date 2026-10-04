import { formatUsd } from "@/lib/utils";
import type { Entitlements } from "./entitlements";

export type FirmPlan = "assessment" | "monthly";

export type Tier = 1 | 2 | 3;
export type BillingInterval = "month" | "year";

/**
 * What a Checkout button buys. "monthly" stays accepted as Starter monthly
 * for one release (a stale tab's button); every other subscription plan
 * names its tier, and the `_annual` ones bill a year at ten months' price.
 */
export type CheckoutPlan =
  | "assessment"
  | "monthly"
  | "tier1"
  | "tier2"
  | "tier3"
  | "tier1_annual"
  | "tier2_annual"
  | "tier3_annual";

export const CHECKOUT_PLANS: readonly CheckoutPlan[] = [
  "assessment",
  "monthly",
  "tier1",
  "tier2",
  "tier3",
  "tier1_annual",
  "tier2_annual",
  "tier3_annual",
];

/** The Firm plan's tiers by live client businesses: Starter 1–5, Practice 6–20, Firm 21–50. */
export const TIERS: readonly {
  tier: Tier;
  label: "Starter" | "Practice" | "Firm";
  clients: "1–5" | "6–20" | "21–50";
}[] = [
  { tier: 1, label: "Starter", clients: "1–5" },
  { tier: 2, label: "Practice", clients: "6–20" },
  { tier: 3, label: "Firm", clients: "21–50" },
];

/** Every plan but the Assessment is a Firm plan subscription. */
export function isSubscriptionPlan(plan: CheckoutPlan): boolean {
  return plan !== "assessment";
}

export function checkoutPlanFor(tier: Tier, interval: BillingInterval): CheckoutPlan {
  return interval === "year" ? `tier${tier}_annual` : `tier${tier}`;
}

/** What a plan costs, as the Stripe price behind its checkout button says. */
export interface PlanPrice {
  /** In the currency's main unit (dollars, not cents). */
  amount: number;
  /** ISO code in lower case, as Stripe writes it ("usd"). */
  currency: string;
  /** "month" or "year" for the Firm plan's subscription; null for a one-off payment. */
  interval: string | null;
}

/**
 * The Stripe prices behind the Checkout buttons. `monthly` is Starter monthly
 * (STRIPE_PRICE_TIER_1, else STRIPE_PRICE_MONTHLY); a tier price is null when
 * its id is not set or Stripe could not read it, so that tier is not offered.
 */
export interface PlanPrices {
  assessment: PlanPrice;
  monthly: PlanPrice;
  tiers: Record<Tier, { month: PlanPrice | null; year: PlanPrice | null }>;
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
  /**
   * The no-Stripe tier figures (monthly, USD). Null until the owner supplies
   * them: a null tier prints "Write to Support" and is not offered without
   * Stripe. Yearly is ten times the monthly figure.
   */
  tiers: [
    { tier: 1, monthlyUsd: 299 },
    { tier: 2, monthlyUsd: null },
    { tier: 3, monthlyUsd: null },
  ] as readonly { tier: Tier; monthlyUsd: number | null }[],
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

/** The amounts a page prints: the two plans, and each tier by interval (null when not offered). */
export interface PlanAmounts {
  assessment: string;
  /** Starter monthly, the figure "from …" names. */
  monthly: string;
  tiers: Record<Tier, { month: string | null; year: string | null }>;
}

/**
 * What to print for each plan. With Stripe configured, only Stripe's own
 * amounts print: null until they are known (loading, or Stripe did not
 * answer), so no page ever shows a figure Checkout would not charge. Without
 * Stripe, the PILOT_OFFER figures.
 */
export function planAmounts(configured: boolean, prices: PlanPrices | null): PlanAmounts | null {
  if (configured) {
    if (!prices) return null;
    const tier = (t: Tier) => {
      const p = prices.tiers?.[t];
      return {
        month: p?.month ? formatPlanPrice(p.month) : null,
        year: p?.year ? formatPlanPrice(p.year) : null,
      };
    };
    return {
      assessment: formatPlanPrice(prices.assessment),
      monthly: formatPlanPrice(prices.monthly),
      tiers: { 1: tier(1), 2: tier(2), 3: tier(3) },
    };
  }
  const fallback = (t: Tier) => {
    const usd = PILOT_OFFER.tiers.find((entry) => entry.tier === t)?.monthlyUsd ?? null;
    return usd === null
      ? { month: null, year: null }
      : { month: `${formatUsd(usd)} a month`, year: `${formatUsd(usd * 10)} a year` };
  };
  return {
    assessment: formatUsd(PILOT_OFFER.assessmentFeeUsd),
    monthly: `${formatUsd(PILOT_OFFER.monthlyFeeUsd)} a month`,
    tiers: { 1: fallback(1), 2: fallback(2), 3: fallback(3) },
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
  const monthly = amounts ? ` (from ${amounts.monthly})` : "";
  const stays = "The Monthly review on each business's own screen stays open.";
  if (e.assessmentEndedAt) {
    return `Your Assessment's 90 days ended on ${e.assessmentEndedAt.slice(0, 10)}. The QuickBooks link and new locked versions are closed; every locked version you already hold stays. Start the Firm plan${monthly} on this page. ${stays}`;
  }
  const assessment = amounts ? ` (${amounts.assessment})` : "";
  return `The QuickBooks link, locked report versions, firm members, owner reminder emails and more than one client business are part of the Firm plan${monthly}. The Assessment${assessment} covers one client with locked versions and the QuickBooks link for 90 days from payment. ${stays}`;
}
