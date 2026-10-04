-- The Stripe price a subscription runs on, so the plan knows its tier
-- (STRIPE_PRICE_TIER_n and their _ANNUAL ids). Null until the next
-- subscription event names it; a null price on a running plan keeps 50 clients.
alter table billing_accounts add column if not exists subscription_price_id text;
