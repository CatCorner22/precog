-- An Assessment-credit reversal still owed when a new Assessment payment
-- arrived. The billing row holds one payment's credit at a time, and a new
-- payment clears it so the new payment earns its own credit; a reversal of
-- the earlier credit that was still pending or had failed moves here first,
-- so it is still posted (by the scheduled run, see billing/webhook.ts
-- retryFailedCreditReversals) instead of being dropped, which would leave
-- the earlier credit on the customer's balance beside the new one.
--
-- Keyed by the Stripe customer and the payment intent whose credit it takes
-- back. pending_at is when the reversal was committed to; failed_at when an
-- attempt last failed. The row goes once Stripe confirms the reversal.
create table if not exists assessment_credit_reversals (
  id bigserial primary key,
  user_id text not null references "user" ("id") on delete cascade,
  stripe_customer_id text not null,
  credit_cents integer not null check (credit_cents > 0),
  assessment_paid_at timestamptz,
  assessment_payment_intent text,
  pending_at timestamptz not null default now(),
  failed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists assessment_credit_reversals_user_idx
  on assessment_credit_reversals (user_id);
