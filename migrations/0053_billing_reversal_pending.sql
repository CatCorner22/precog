-- An Assessment-credit reversal the webhook has committed to but Stripe has
-- not yet confirmed. Set in the same transaction as the refund or lost
-- dispute (the posted amount stays in assessment_credit_cents); cleared, with
-- the amount zeroed, once Stripe confirms. A row still pending an hour later
-- (the webhook died between its commit and the Stripe call) is completed by
-- the scheduled run, which first looks for the reversal at Stripe by its
-- reversal_for metadata (see billing/webhook.ts retryFailedCreditReversals).
alter table billing_accounts
  add column if not exists assessment_credit_reversal_pending_at timestamptz;
