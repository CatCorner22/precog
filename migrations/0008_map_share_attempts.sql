-- Failed passcode attempts on a shared map, recorded per token so the lockout
-- holds across serverless instances (the in-memory limiter does not).
create table if not exists map_share_attempts (
  id bigserial primary key,
  token text not null references map_shares (token) on delete cascade,
  attempted_at timestamptz not null default now(),
  ip_hash text
);

create index if not exists map_share_attempts_token_idx on map_share_attempts (token, attempted_at desc);
