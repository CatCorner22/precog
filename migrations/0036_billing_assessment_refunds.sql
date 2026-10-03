-- A refunded or disputed assessment closes the paid tools again; the
-- payment intent lets a refund or dispute find its account, and a new
-- payment with a new intent reopens them.
alter table billing_accounts add column if not exists assessment_payment_intent text;
alter table billing_accounts add column if not exists assessment_refunded_at timestamptz;
alter table billing_accounts add column if not exists assessment_disputed_at timestamptz;
