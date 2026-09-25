-- What the payment provider says about an account. Written only by the
-- webhook, read by the firm workspace; the plan on the firm row follows it
-- when billing is connected.

create table if not exists billing_accounts (
  user_id text primary key references "user" ("id") on delete cascade,
  stripe_customer_id text,
  subscription_id text,
  subscription_status text,
  assessment_paid_at timestamptz,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists billing_accounts_customer_idx
  on billing_accounts (stripe_customer_id) where stripe_customer_id is not null;

-- Webhook deliveries already handled, so a retried event is not applied twice.
create table if not exists billing_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
