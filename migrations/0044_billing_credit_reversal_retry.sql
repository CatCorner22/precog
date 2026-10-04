-- A failed Assessment-credit reversal keeps its amount and the time it last
-- failed, so the weekly run retries it instead of the ledger and Stripe
-- disagreeing silently (see billing/webhook.ts reverseAssessmentCredit).
alter table billing_accounts
  add column if not exists assessment_credit_reversal_failed_at timestamptz;
