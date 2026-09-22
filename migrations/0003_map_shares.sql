-- Read-only shared snapshots of a business's process map (advisor / lender view).
-- Token is the public capability; payload is a frozen copy so later edits don't leak.

create table if not exists map_shares (
  token text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  business_name text not null default 'My Business',
  industry text not null default 'general',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index if not exists map_shares_user_idx on map_shares (user_id, created_at desc);
