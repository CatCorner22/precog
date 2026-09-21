-- Per-user business profile for Precog Pioneer (internal controls / risk SaaS).
-- Scoped by Better Auth user id; never trust client-sent user_id.

create table if not exists business_profiles (
  user_id text primary key references "user" ("id") on delete cascade,
  name text not null default 'My Business',
  industry text not null default 'dental',
  profile jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_profiles_industry_idx on business_profiles (industry);
