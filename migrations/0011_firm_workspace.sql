-- Advisor firm, per-client engagement stamps, and an append-only monthly review log.
-- Review rows are never updated: a later result is a new row. Queries always
-- scope by the verified user id so one account cannot read another's clients.

create table if not exists firms (
  user_id text primary key references "user" ("id") on delete cascade,
  name text not null,
  -- assessment: the paid pilot engagement. monthly: converted firm plan.
  plan text not null default 'assessment',
  updated_at timestamptz not null default now(),
  constraint firms_plan_check check (plan in ('assessment', 'monthly'))
);

create table if not exists engagement_marks (
  user_id text not null references "user" ("id") on delete cascade,
  business_id text not null,
  started_at timestamptz,
  map_completed_at timestamptz,
  report_sent_at timestamptz,
  open_findings integer not null default 0,
  accepted_findings integer not null default 0,
  primary key (user_id, business_id)
);

create table if not exists review_events (
  id bigserial primary key,
  user_id text not null references "user" ("id") on delete cascade,
  business_id text not null,
  period text not null,
  item_key text not null,
  owner_name text not null default '',
  due_on date,
  result text not null,
  notes text not null default '',
  recorded_at timestamptz not null default now(),
  constraint review_events_result_check check (result in ('done', 'exception', 'skipped'))
);

create index if not exists review_events_business_idx
  on review_events (user_id, business_id, recorded_at desc);
