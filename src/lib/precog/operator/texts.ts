import type { Entitlements } from "../firm/entitlements";
import { PILOT_OFFER, TIERS } from "../firm/pricing";
import { formatDay } from "../dates";

/**
 * What the operator page prints. Precog's operator is "the operator"; "owner"
 * stays the business or firm owner. Pure, so the page and its tests read the
 * same strings.
 */
export const OPERATOR_HEADING = "Operator";
export const FIND_HEADING = "Find an account";
export const EMAIL_LABEL = "Email address";
export const FIND_BUTTON = "Find";
export const NO_ACCOUNT = "No account uses that address.";
export const LINK_HEADING = "Link a Stripe customer";
export const CUSTOMER_LABEL = "Stripe customer id (cus_…)";
export const REPLACE_LABEL =
  "Replace the customer this account has (also links a customer with no running subscription)";
export const LINK_BUTTON = "Link";
export const LIFT_BUTTON = "Lift today's cap";
export const COUNTS_HEADING = "Standing counts";
/** A count whose table has no rows. */
export const NO_ROWS = "Nothing to list.";
export const NOT_A_CUSTOMER_ID = "A Stripe customer id starts with cus_.";
export const BILLING_NOT_CONNECTED = "Billing is not connected on this deployment";
/** The plan label on a deployment without Stripe, where every account has every feature. */
export const PLAN_WITHOUT_BILLING = "Everything open (billing is not connected on this deployment)";

/** The not-found text every unknown address prints (src/routes/__root.tsx), for anyone who is not an operator. */
export const NOT_FOUND_EYEBROW = "Page not found";
export const NOT_FOUND_HEADING = "There is no page at this address";
export const NOT_FOUND_BODY =
  "Check the link for a typo, or go back to your business. Nothing you saved has changed.";

export function noAccountWithId(account: string): string {
  return `No Precog account has ${account}.`;
}

export function stripeHasNoCustomer(customerId: string): string {
  return `Stripe has no customer ${customerId}.`;
}

export function linkedToast(name: string, customerId: string, planLabel: string): string {
  return `Linked ${name} to Stripe customer ${customerId}; plan now ${planLabel}.`;
}

export function liftedToast(email: string): string {
  return `Today's model-call count for ${email} is back to 0.`;
}

/**
 * The standing counts, by name: the production questions the owner runs
 * before a release (the batch plan's Integration 6), as read-only buttons.
 */
export const OPERATOR_COUNTS = [
  { name: "running-subscriptions", label: "Running subscriptions and their live clients" },
  { name: "hand-marked", label: "Firms marked monthly by hand with no billing row" },
  { name: "x-only-digest", label: "X-only accounts with the digest on" },
  {
    name: "google-unconfirmed-digest",
    label: "Google accounts without a confirmed address and the digest on",
  },
  { name: "google-digest", label: "Google accounts with the digest on" },
  { name: "past-due", label: "Firm plans past due" },
  {
    name: "quickbooks-attention",
    label: "QuickBooks connections failing or lapsing within 30 days",
  },
  { name: "multi-member-firms", label: "Firms with more than one member" },
  { name: "retained-clients", label: "Deleted firm clients the retention rule now keeps" },
  { name: "no-price-yet", label: "Running subscriptions with no stored price yet" },
  { name: "picture-storage", label: "Picture storage" },
  {
    name: "weekly-activation",
    label: "Accounts that set up a first business, by week (last 8 weeks)",
  },
] as const;

export type OperatorCountName = (typeof OPERATOR_COUNTS)[number]["name"];

/** A count's answer: one figure when it is one cell, else a table. */
export interface OperatorCountResult {
  name: OperatorCountName;
  label: string;
  columns: string[];
  rows: (string | number | boolean | null)[][];
}

/**
 * The account's plan as the firm page's Plan card names it, plus the hand-marked
 * exception: "Free", "Assessment (until 2026-12-30)", "Firm plan · Starter, up
 * to 5 client businesses", "Firm plan (payment overdue, closes 2026-11-02)".
 * Without billing connected every account has every feature whatever its
 * stored plan (entitlementsFor), so the label says that instead.
 */
export function operatorPlanLabel(
  e: Entitlements,
  handMarked: boolean,
  billingConnected: boolean,
): string {
  if (!billingConnected) return PLAN_WITHOUT_BILLING;
  if (e.closedAt) return `${PILOT_OFFER.monthlyLabel} (closed ${e.closedAt.slice(0, 10)})`;
  if (e.plan === "firm") {
    const tier = TIERS.find((t) => t.tier === e.tier);
    const name = tier
      ? `${PILOT_OFFER.monthlyLabel} · ${tier.label}, up to ${e.clientLimit} client businesses`
      : PILOT_OFFER.monthlyLabel;
    if (handMarked) return `${name} (marked by hand, no billing row)`;
    return e.graceEndsAt ? `${name} (payment overdue, closes ${e.graceEndsAt.slice(0, 10)})` : name;
  }
  if (e.plan === "assessment" && e.paidUntil) {
    return `${PILOT_OFFER.assessmentLabel} (until ${e.paidUntil.slice(0, 10)})`;
  }
  if (e.assessmentEndedAt) {
    return `${PILOT_OFFER.assessmentLabel} (ended ${e.assessmentEndedAt.slice(0, 10)})`;
  }
  return "Free";
}

/** What the lookup answers: one account's support facts, no profile and no figures. */
export interface OperatorAccount {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  /** "credential", "grok-google", "grok-x". */
  providers: string[];
  createdAt: string;
  firm: { firmUserId: string; name: string; role: string } | null;
  businesses: { live: number; deleted: number };
  stripeCustomerId: string | null;
  subscriptionLabel: string;
  planLabel: string;
  lastDigest: { sentAt: string; recipient: string } | null;
  suppression: string | null;
  quickBooksFailure: { at: string | null; error: string } | null;
  modelCalls: { today: number; limit: number };
  milestones: { event: string; occurredAt: string }[];
}

const PROVIDER_LABELS: Record<string, string> = {
  credential: "email and password",
  "grok-google": "Google",
  "grok-x": "X",
};

const MILESTONE_LABELS: Record<string, string> = {
  first_business: "first business",
  first_locked_version: "first locked version",
  first_report_sent: "first report sent",
  first_monthly_review: "first monthly review",
};

/** The support lines the page prints for a found account, in order. */
export function accountLines(a: OperatorAccount): string[] {
  const providers = a.providers.map((p) => PROVIDER_LABELS[p] ?? p);
  const milestones = a.milestones.map(
    (m) => `${MILESTONE_LABELS[m.event] ?? m.event} ${formatDay(m.occurredAt)}`,
  );
  return [
    `${a.email} · ${a.emailVerified ? "address confirmed" : "address not confirmed"}`,
    `Signs in with: ${providers.length > 0 ? providers.join(", ") : "nothing on record"}`,
    `Account created ${formatDay(a.createdAt)}`,
    `Plan: ${a.planLabel}`,
    a.firm ? `Firm: ${a.firm.name} (${a.firm.role})` : "Firm: none",
    `Businesses: ${a.businesses.live} live, ${a.businesses.deleted} deleted`,
    `Subscription: ${a.subscriptionLabel}`,
    `Stripe customer: ${a.stripeCustomerId ?? "none"}`,
    a.lastDigest
      ? `Last weekly digest: ${formatDay(a.lastDigest.sentAt)} to ${a.lastDigest.recipient}`
      : "No weekly digest sent yet",
    ...(a.suppression ? [`Email to this address is stopped (${a.suppression})`] : []),
    a.quickBooksFailure
      ? `QuickBooks: last reading failed on ${a.quickBooksFailure.at ? formatDay(a.quickBooksFailure.at) : "an unknown day"} (${a.quickBooksFailure.error})`
      : "QuickBooks: no failure on record",
    `Model calls today: ${a.modelCalls.today} of ${a.modelCalls.limit}`,
    `Milestones: ${milestones.length > 0 ? milestones.join("; ") : "none yet"}`,
  ];
}
