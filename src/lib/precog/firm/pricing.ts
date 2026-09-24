/**
 * Pilot offer shown to advisors. These are prices to test with design
 * partners, not a checkout. The app records which stage the firm is in;
 * invoicing happens outside the product.
 */
export const PILOT_OFFER = {
  assessmentFeeUsd: 1000,
  assessmentLabel: "Fixed assessment",
  assessmentDetail: "One client mapped, conflicts named, and a report the CPA can send.",
  monthlyFeeUsd: 299,
  monthlyClients: 10,
  monthlyLabel: "Firm plan",
  monthlyDetail:
    "Up to ten active clients, a monthly review trail, and the firm name on each report.",
} as const;

export type FirmPlan = "assessment" | "monthly";
