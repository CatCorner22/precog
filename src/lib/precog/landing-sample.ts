/**
 * What the landing page shows of the product: the dental sample's "Do these
 * first" block, as Start here prints it for that fictional business. Written
 * out here, not computed, because the landing page loads none of the
 * business engine; landing-sample.test.ts pins every line to the engine's
 * output, so a change to the sample or the ranking fails the test until this
 * copy moves with it.
 */
export const LANDING_SAMPLE = {
  businessName: "Ridgeview Family Dental",
  openConflicts: 20,
  critical: 4,
  steps: [
    "Move one duty, enter write-offs, away from Maya Chen: it closes 4 of the 20 open duty conflicts",
    "Someone other than the person who banks the money reconciles the account",
    "Review voids, refunds, discounts, and write-offs grouped by employee",
  ],
} as const;
