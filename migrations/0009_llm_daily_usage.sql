-- Daily count of model calls per user and in total, kept in Postgres so the
-- ceiling holds across serverless instances and cold starts. The per-minute
-- limiter in process memory still smooths bursts; this table caps the day.
create table if not exists llm_daily_usage (
  scope text not null,
  day date not null,
  calls integer not null default 0,
  primary key (scope, day)
);
