import { MAX_BUSINESSES_PER_ACCOUNT } from "../business-lifecycle";
import type { BillingAccount } from "./billing-store";
import type { FirmPlan } from "./pricing";

/**
 * What a plan opens, computed from the billing row alone. Pure, so the firm
 * page, the home banner and the tests read it without a server; the server
 * reads it through entitlements.server.ts.
 */
export type Plan = "free" | "assessment" | "firm";

export type Feature =
  "quickbooks" | "lockedVersions" | "members" | "ownerReminders" | "moreClients";

export const ASSESSMENT_WINDOW_DAYS = 90;
export const PAST_DUE_GRACE_DAYS = 14;
/** The first production deploy; the Assessment window of a row paid before it counts from here. The owner may change it. */
export const ENTITLEMENTS_FROM = "2026-10-05";
/** Until this day a firm marked "monthly" by hand before Stripe was connected (no billing row) keeps the Firm plan with Stripe configured. The owner may change it. */
export const HAND_MARKED_PLANS_UNTIL = "2027-01-04";

export interface Entitlements {
  plan: Plan;
  features: Record<Feature, boolean>;
  /** Live client businesses the plan holds: 1 free and Assessment, MAX_BUSINESSES_PER_ACCOUNT (50) Firm plan and without Stripe. */
  clientLimit: number;
  /** When the Assessment window ends (ISO), else null. */
  paidUntil: string | null;
  /** When the Assessment window ended, when it has (ISO), else null. */
  assessmentEndedAt: string | null;
  /** Set only while the stored status is past_due or unpaid, or canceled after Stripe's retries ran out. */
  pastDueSince: string | null;
  /** pastDueSince + 14 days while past_due or unpaid and inside the grace; null otherwise or when the start is unknown. */
  graceEndsAt: string | null;
  /** graceEndsAt once passed: the day the paid surface closed because the payment failed. Never set for a cancellation the firm asked for. */
  closedAt: string | null;
  aiPlan: "free" | "paid";
}

/** The billing columns the rules read; a full BillingAccount fits. */
export type BillingFacts = Pick<
  BillingAccount,
  "subscriptionStatus" | "pastDueSince" | "assessmentPaidAt" | "assessmentRefundedAt"
>;

const DAY_MS = 86_400_000;
const ALL_FEATURES: Record<Feature, boolean> = {
  quickbooks: true,
  lockedVersions: true,
  members: true,
  ownerReminders: true,
  moreClients: true,
};
const NO_FEATURES: Record<Feature, boolean> = {
  quickbooks: false,
  lockedVersions: false,
  members: false,
  ownerReminders: false,
  moreClients: false,
};
type Dates = Pick<
  Entitlements,
  "paidUntil" | "assessmentEndedAt" | "pastDueSince" | "graceEndsAt" | "closedAt"
>;
const NO_DATES: Dates = {
  paidUntil: null,
  assessmentEndedAt: null,
  pastDueSince: null,
  graceEndsAt: null,
  closedAt: null,
};
/** Statuses whose stored past_due_since describes a failed payment the firm still sees. */
const DUNNING_STATUSES = new Set(["past_due", "unpaid", "canceled"]);

function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * The plan and what it opens.
 *
 * Without Stripe everything is open (preview, CI, a self-hosted copy), the
 * plan being whatever the owner marked by hand. With Stripe: an active or
 * trialing subscription is the Firm plan; a past_due or unpaid one stays the
 * Firm plan for PAST_DUE_GRACE_DAYS from the first failed payment (or while
 * the start is unknown), then falls through; a firm marked "monthly" by hand
 * with no billing row keeps the Firm plan until HAND_MARKED_PLANS_UNTIL; a paid
 * Assessment opens locked versions and QuickBooks for ASSESSMENT_WINDOW_DAYS
 * from the later of its payment and ENTITLEMENTS_FROM; else free. The grace
 * dates show only while the stored status is past_due, unpaid or canceled, so
 * a stray past_due_since under an active subscription means nothing.
 */
export function entitlementsFor(input: {
  stripeConfigured: boolean;
  firmPlan: FirmPlan | null;
  billing: BillingFacts | null;
  now: Date;
}): Entitlements {
  const { firmPlan, billing } = input;
  const now = input.now.getTime();
  if (!input.stripeConfigured) {
    return {
      plan: firmPlan === "assessment" ? "assessment" : "firm",
      features: ALL_FEATURES,
      clientLimit: MAX_BUSINESSES_PER_ACCOUNT,
      ...NO_DATES,
      aiPlan: "paid",
    };
  }
  const status = billing?.subscriptionStatus ?? null;
  if (status === "active" || status === "trialing") return firmPlanOpen(NO_DATES);

  const dunning = status !== null && DUNNING_STATUSES.has(status);
  const pastDueSince = dunning ? (billing?.pastDueSince ?? null) : null;
  const graceEnd = pastDueSince ? Date.parse(pastDueSince) + PAST_DUE_GRACE_DAYS * DAY_MS : null;
  if ((status === "past_due" || status === "unpaid") && (graceEnd === null || now < graceEnd)) {
    return firmPlanOpen({
      ...NO_DATES,
      pastDueSince,
      graceEndsAt: graceEnd === null ? null : iso(graceEnd),
    });
  }
  const closedAt = graceEnd !== null && now >= graceEnd ? iso(graceEnd) : null;
  const dates = { ...NO_DATES, pastDueSince, closedAt };

  if (billing === null && firmPlan === "monthly" && now < dayStart(HAND_MARKED_PLANS_UNTIL)) {
    return firmPlanOpen(NO_DATES);
  }

  if (billing?.assessmentPaidAt && !billing.assessmentRefundedAt) {
    const start = Math.max(Date.parse(billing.assessmentPaidAt), dayStart(ENTITLEMENTS_FROM));
    const end = start + ASSESSMENT_WINDOW_DAYS * DAY_MS;
    if (now < end) {
      return {
        plan: "assessment",
        features: { ...NO_FEATURES, quickbooks: true, lockedVersions: true },
        clientLimit: 1,
        ...dates,
        paidUntil: iso(end),
        aiPlan: "paid",
      };
    }
    return {
      plan: "free",
      features: NO_FEATURES,
      clientLimit: 1,
      ...dates,
      assessmentEndedAt: iso(end),
      aiPlan: "free",
    };
  }
  return { plan: "free", features: NO_FEATURES, clientLimit: 1, ...dates, aiPlan: "free" };
}

function firmPlanOpen(dates: Dates): Entitlements {
  return {
    plan: "firm",
    features: ALL_FEATURES,
    clientLimit: MAX_BUSINESSES_PER_ACCOUNT,
    ...dates,
    aiPlan: "paid",
  };
}

const FEATURE_NAMES: Record<Exclude<Feature, "moreClients">, string> = {
  quickbooks: "The QuickBooks link",
  lockedVersions: "Locked report versions",
  members: "Firm members",
  ownerReminders: "Reminder emails to clients' owners",
};

const FEATURE_TAILS: Partial<Record<Feature, string>> = {
  lockedVersions: "; the live report still prints",
  ownerReminders: "; reminders inside Precog still show",
};

/** The 402 text for a closed feature, by why it is closed. */
export function entitlementRefusal(
  feature: Exclude<Feature, "moreClients">,
  e: Entitlements,
): string {
  const name = FEATURE_NAMES[feature];
  const are = feature === "quickbooks" ? "is" : "are";
  const tail = FEATURE_TAILS[feature] ?? "";
  if (e.closedAt) {
    return `${name} closed on ${day(e.closedAt)} because the Firm plan's payment failed. Fix the payment in Manage billing on the Firm page${tail}.`;
  }
  if (e.assessmentEndedAt) {
    return `Your Assessment's 90 days ended on ${day(e.assessmentEndedAt)}. ${name} ${are} part of the Firm plan; start it on the Firm page${tail}.`;
  }
  if (feature === "quickbooks" || feature === "lockedVersions") {
    return `${name} ${are} part of the Firm plan and the Assessment. Start one on the Firm page${tail}.`;
  }
  return `${name} ${are} part of the Firm plan. Start it on the Firm page${tail}.`;
}

/** "YYYY-MM-DD" of an ISO timestamp, as the Plan card prints its dates. */
function day(stamp: string): string {
  return stamp.slice(0, 10);
}
