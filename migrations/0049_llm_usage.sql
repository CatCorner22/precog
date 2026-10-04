-- One row per model call: who, which feature and model, the token counts the
-- API reported, the outcome and when. No prompt, no answer, no address.
-- Purged after 13 months by the weekly run; deleted with the account.
create table if not exists llm_usage (
  id bigserial primary key,
  user_id text references "user" ("id") on delete cascade,
  feature text not null,
  model text not null,
  prompt_tokens integer,
  completion_tokens integer,
  outcome text not null,
  called_at timestamptz not null default now()
);
create index if not exists llm_usage_called_idx on llm_usage (called_at desc);
create index if not exists llm_usage_user_idx on llm_usage (user_id, called_at desc);
create or replace view llm_usage_daily as
  select called_at::date as day, feature, model, count(*)::int as calls,
    coalesce(sum(prompt_tokens), 0)::bigint as prompt_tokens,
    coalesce(sum(completion_tokens), 0)::bigint as completion_tokens
  from llm_usage group by 1, 2, 3;
