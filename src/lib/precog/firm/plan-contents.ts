/**
 * What each plan includes, as the pricing page and the Plan card print it.
 * Each list says what a plan "includes": nothing here promises a gate, and
 * the figures never live here (they come from `planAmounts`, so the price
 * shown is the price Checkout charges).
 */
export const FREE_INCLUDES: readonly string[] = [
  "One business per account",
  "The printed report",
  "Reminders inside Precog",
  "The AI coach within the daily allowance",
];

export const ASSESSMENT_INCLUDES: readonly string[] = [
  "One client business",
  "Locked report versions",
  "The QuickBooks link",
  "All of it for 90 days from payment",
];

export const FIRM_INCLUDES: readonly string[] = [
  "More than one client business",
  "Firm members with preparer and reviewer roles",
  "Locked report versions",
  "Reminder emails to each client's owner",
  "The QuickBooks link",
  "A larger daily AI allowance",
];

/**
 * A price statement, not a rule: nothing in Precog refuses a sixth client
 * business on the Firm plan today. Per-client tiers come with a later batch.
 */
export const FIRM_CLIENT_RULE =
  "The Firm plan is priced for up to five client businesses. Running more? Write to Support.";

/** The billing sentence under the Checkout buttons, word for word on the Plan card. */
export const BILLING_TERMS_SENTENCE =
  "The Firm plan renews until you cancel it in Manage billing; cancelling keeps access to the end of the paid period, and a started month is not refunded. The Assessment is not refunded once a report version is locked. Prices are before sales tax, which Checkout adds for your billing address. See the Terms.";
