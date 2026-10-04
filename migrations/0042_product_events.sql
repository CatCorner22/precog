-- Product milestones, one row per account and milestone: the first business an
-- account set up, the first report version it locked, the first report it
-- marked sent and the first monthly review it recorded. Two ids and a time; no
-- names, no text, no addresses. Counted each week by the scheduled run; deleted
-- with the account. business_id has no foreign key on purpose, so a purged
-- first business keeps its milestone.
create table if not exists product_events (
  user_id text not null references "user" ("id") on delete cascade,
  event text not null,
  business_id text,
  occurred_at timestamptz not null default now(),
  primary key (user_id, event),
  constraint product_events_event_check check (event in (
    'first_business', 'first_locked_version', 'first_report_sent', 'first_monthly_review'
  ))
);
create index if not exists product_events_event_idx on product_events (event, occurred_at desc);
create or replace view product_activation_weekly as
  select date_trunc('week', occurred_at)::date as week_start, event, count(*)::int as accounts
  from product_events group by 1, 2;
create or replace view product_signups_weekly as
  select date_trunc('week', "createdAt")::date as week_start, count(*)::int as accounts
  from "user" group by 1;
create or replace view product_retained_reviewers as
  select r.recorded_by as user_id from review_events r
  where r.recorded_by is not null
    and r.recorded_at >= date_trunc('month', now()) - interval '1 month'
  group by r.recorded_by
  having count(distinct date_trunc('month', r.recorded_at)) = 2;
