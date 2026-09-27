export type FirmPlan = "assessment" | "monthly";

/**
 * The offer as the firm page describes it. With Stripe connected, the page
 * prints the amounts of the Stripe prices the checkout buttons charge
 * (STRIPE_PRICE_ASSESSMENT, STRIPE_PRICE_MONTHLY), so keep those prices and
 * these figures the same. Without Stripe these figures are what the firm is
 * invoiced outside the product.
 */
export const PILOT_OFFER = {
  assessmentFeeUsd: 1000,
  assessmentLabel: "Assessment",
  assessmentDetail: "One client mapped, conflicts named, and a report the CPA can send.",
  monthlyFeeUsd: 299,
  monthlyLabel: "Firm plan",
  monthlyDetail: "Ongoing monthly reviews for your clients, with reminders by email.",
} as const;
