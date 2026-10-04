/**
 * Links a Stripe customer the owner set up outside Checkout to a Precog
 * account: the net-30 recipe (create the invoice subscription in Stripe
 * first, then link) and the firms marked "monthly" by hand before Stripe was
 * connected. Plain Node: `src/` cannot be loaded here (its imports have no
 * extensions and use the `@/` alias), so this file speaks SQL and Stripe
 * itself. It runs the same statement and refusals as `setStripeCustomer` in
 * src/lib/precog/firm/billing-store.ts, and scripts/link-stripe-customer.test.mjs
 * pins that both write the same row and print the same texts.
 *
 * `query(text, params)` answers rows; `stripeGet(path)` answers the parsed
 * body, or null when Stripe has no such object; `stripePost(path, form)`
 * posts form fields. Nothing is written without `yes`.
 */

/** Copied from billing-store.ts (the test pins the two equal). */
export function NO_RUNNING_SUBSCRIPTION(customerId) {
  return `Stripe customer ${customerId} has no running subscription. Create the subscription in Stripe first, then link.`;
}

export const CUSTOMER_OF_ANOTHER_ACCOUNT = "That customer belongs to another account in Precog.";

/** The statement setStripeCustomer runs. */
export const LINK_STATEMENT = `insert into billing_accounts (user_id, stripe_customer_id, updated_at)
  values ($1, $2, now())
  on conflict (user_id) do update set
    stripe_customer_id = excluded.stripe_customer_id, updated_at = now()`;

const RUNNING = new Set(["active", "trialing", "past_due"]);
const TIER_LABELS = { 1: "Starter", 2: "Practice", 3: "Firm" };

/** A refusal: printed as is, nothing written. */
export class LinkRefused extends Error {}

/** The tier a Stripe price stands for, by the same rule as tierForPrice in stripe.server.ts. */
export function tierForPrice(priceId, env = process.env) {
  if (!priceId) return null;
  for (const tier of [1, 2, 3]) {
    const ids = [env[`STRIPE_PRICE_TIER_${tier}`], env[`STRIPE_PRICE_TIER_${tier}_ANNUAL`]];
    if (ids.some((id) => id && id === priceId)) return tier;
  }
  return null;
}

/** "Firm plan · Starter, active, renews 2026-11-04", or why there is no Firm plan. */
export function planLine(subscription, env = process.env) {
  if (!subscription) return "Plan after linking: no Firm plan (the customer has no subscription)";
  const day = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString().slice(0, 10)
    : null;
  if (!RUNNING.has(subscription.status)) {
    return `Plan after linking: no Firm plan (the newest subscription is ${subscription.status})`;
  }
  const tier = tierForPrice(priceOf(subscription), env);
  const name = tier ? `Firm plan · ${TIER_LABELS[tier]}` : "Firm plan";
  return `Plan after linking: ${name}, ${subscription.status}${day ? `, renews ${day}` : ""}`;
}

function priceOf(subscription) {
  const price = subscription?.items?.data?.[0]?.price;
  return typeof price === "string" ? price : (price?.id ?? null);
}

export async function linkCustomer({
  query,
  stripeGet,
  stripePost,
  account,
  customerId,
  replace = false,
  yes = false,
  env = process.env,
  log = console.log,
}) {
  const users = account.includes("@")
    ? await query(`select id, email from "user" where email = $1`, [account])
    : await query(`select id, email from "user" where id = $1`, [account]);
  const user = users[0];
  if (!user) throw new LinkRefused(`No Precog account has ${account}.`);
  log(`Account: ${user.email ?? user.id} (${user.id})`);

  const customer = await stripeGet(`/customers/${encodeURIComponent(customerId)}`);
  if (!customer || customer.deleted) throw new LinkRefused(`Stripe has no customer ${customerId}.`);
  log(`Stripe customer: ${customerId}${customer.email ? ` (${customer.email})` : ""}`);

  const holders = await query(
    `select user_id from billing_accounts where stripe_customer_id = $1`,
    [customerId],
  );
  if (holders[0] && holders[0].user_id !== user.id)
    throw new LinkRefused(CUSTOMER_OF_ANOTHER_ACCOUNT);
  const memberships = await query(
    `select u.email, f.name as firm
     from firm_members m
     join firms f on f.user_id = m.firm_user_id
     join "user" u on u.id = m.member_user_id
     where m.member_user_id = $1 and m.role <> 'owner'`,
    [user.id],
  );
  if (memberships[0]) {
    throw new LinkRefused(
      `${memberships[0].email ?? user.id} is a member of ${memberships[0].firm}, not its owner. Link the firm owner's account.`,
    );
  }
  const stored = await query(`select stripe_customer_id from billing_accounts where user_id = $1`, [
    user.id,
  ]);
  const current = stored[0]?.stripe_customer_id ?? null;
  if (current && current !== customerId && !replace) {
    throw new LinkRefused(
      `This account already has Stripe customer ${current}. Tick Replace to link another.`,
    );
  }

  const list = await stripeGet(
    `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=3`,
  );
  const subscriptions = [...(list?.data ?? [])].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  const running = subscriptions.find((s) => RUNNING.has(s.status)) ?? null;
  if (!running) {
    const handMarked = await query(
      `select 1 from firms f
       where f.user_id = $1 and f.plan = 'monthly'
         and not exists (select 1 from billing_accounts b where b.user_id = f.user_id)`,
      [user.id],
    );
    // Without a running subscription the new row would close the plan; only
    // --replace on an account that is not marked by hand may go ahead.
    if (!replace || handMarked.length > 0)
      throw new LinkRefused(NO_RUNNING_SUBSCRIPTION(customerId));
  }
  const applied = running ?? subscriptions[0] ?? null;
  log(planLine(applied, env));

  if (!yes) {
    log("Nothing written. Run again with --yes to link.");
    return { outcome: "dry-run", userId: user.id };
  }
  if (current === customerId) {
    log(`Already linked to ${customerId}.`);
  } else {
    await query(LINK_STATEMENT, [user.id, customerId]);
    log(`Linked ${customerId} to ${user.id}.`);
  }
  if (applied) {
    await query(
      `update billing_accounts set
         subscription_id = $2,
         subscription_status = $3,
         current_period_end = case when $4::bigint is null then current_period_end else to_timestamp($4::bigint) end,
         subscription_price_id = coalesce($5::text, subscription_price_id),
         past_due_since = case
           when $3 in ('past_due', 'unpaid') then coalesce(past_due_since, now())
           when $3 in ('active', 'trialing') then null
           else past_due_since
         end,
         updated_at = now()
       where user_id = $1`,
      [user.id, applied.id, applied.status, applied.current_period_end ?? null, priceOf(applied)],
    );
    // The firm row follows the subscription, as the webhook's setFirmPlan does.
    await query(`update firms set plan = $2, updated_at = now() where user_id = $1`, [
      user.id,
      RUNNING.has(applied.status) ? "monthly" : "assessment",
    ]);
    log(`Applied subscription ${applied.id} (${applied.status}).`);
  }
  await stripePost(`/customers/${encodeURIComponent(customerId)}`, { "metadata[userId]": user.id });
  log(`Named ${user.id} on the Stripe customer.`);
  return { outcome: current === customerId ? "unchanged" : "linked", userId: user.id };
}
