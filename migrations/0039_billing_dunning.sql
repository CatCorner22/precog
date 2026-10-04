-- Dunning and the Assessment credit. When the subscription first went past
-- due, so the Firm plan stays open for a grace period and the firm owner is
-- emailed once (with Stripe's hosted invoice link when an invoice event
-- carried one); and the Assessment fee as charged before tax, when it was
-- credited against the Firm plan, and how much was posted, so a refund can
-- reverse what was posted.
alter table billing_accounts add column if not exists past_due_since timestamptz;
alter table billing_accounts add column if not exists payment_failed_email_sent_at timestamptz;
alter table billing_accounts add column if not exists payment_failed_invoice_url text;
alter table billing_accounts add column if not exists assessment_credit_used_at timestamptz;
alter table billing_accounts add column if not exists assessment_fee_cents integer;
alter table billing_accounts add column if not exists assessment_credit_cents integer;
