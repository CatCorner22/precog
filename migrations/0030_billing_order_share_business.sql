-- When Stripe created the newest subscription event applied to an account,
-- so a retried or late event cannot overwrite newer billing state.
alter table billing_accounts add column if not exists subscription_event_at timestamptz;

-- The business a share link copies, so deleting the business or removing the
-- member who made the link revokes it, and the firm owner can revoke links
-- on the firm's clients. Null on links made before this column existed.
alter table map_shares add column if not exists business_owner_id text;
alter table map_shares add column if not exists business_id text;

create index if not exists map_shares_business_idx
  on map_shares (business_owner_id, business_id) where business_id is not null;
