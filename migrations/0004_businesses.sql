-- Multi-business portfolio: an owner or advisor can keep several businesses.
-- business_profiles stays the "active" pointer + copy; this table holds every business.

create table if not exists businesses (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  name text not null default 'My Business',
  industry text not null default 'general',
  profile jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists businesses_user_idx on businesses (user_id, updated_at desc);
