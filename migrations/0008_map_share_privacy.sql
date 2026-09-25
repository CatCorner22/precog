alter table map_shares add column if not exists redacted boolean not null default false;
alter table map_shares add column if not exists passcode_salt text;
alter table map_shares add column if not exists passcode_hash text;

create table if not exists map_share_views (
  id bigserial primary key,
  token text not null references map_shares (token) on delete cascade,
  viewed_at timestamptz not null default now(),
  ip_hash text,
  user_agent text
);

create index if not exists map_share_views_token_idx on map_share_views (token, viewed_at desc);
