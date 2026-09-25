-- A read-only connection from one business to its accounting system. Tokens
-- are stored encrypted (AES-256-GCM under INTEGRATION_KEY). Each sync keeps
-- the vendor and employee lists it read, so the next one can say what changed.

create table if not exists integration_connections (
  user_id text not null,
  business_id text not null,
  provider text not null,
  realm_id text not null,
  access_token_enc text not null,
  refresh_token_enc text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  connected_by text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  primary key (user_id, business_id, provider),
  constraint integration_connections_business_fk
    foreign key (user_id, business_id) references businesses ("user_id", "id") on delete cascade,
  constraint integration_connections_provider_check check (provider in ('qbo'))
);

create table if not exists integration_snapshots (
  id bigserial primary key,
  user_id text not null,
  business_id text not null,
  provider text not null,
  taken_at timestamptz not null default now(),
  vendors jsonb not null default '[]',
  employees jsonb not null default '[]',
  constraint integration_snapshots_business_fk
    foreign key (user_id, business_id) references businesses ("user_id", "id") on delete cascade
);

create index if not exists integration_snapshots_business_idx
  on integration_snapshots (user_id, business_id, provider, taken_at desc);
