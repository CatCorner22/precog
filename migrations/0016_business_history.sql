-- Every save keeps the version it replaced, with who saved and when, so the
-- map as it stood on a given day can be reopened. A deleted business is
-- marked, not removed, until the purge job clears it after its grace period.

create table if not exists business_history (
  id bigserial primary key,
  user_id text not null,
  business_id text not null,
  revision bigint not null,
  name text not null,
  industry text not null,
  profile jsonb not null,
  saved_by text,
  saved_at timestamptz not null default now(),
  constraint business_history_business_fk
    foreign key (user_id, business_id) references businesses ("user_id", "id") on delete cascade,
  constraint business_history_revision_unique unique (user_id, business_id, revision)
);

create index if not exists business_history_business_idx
  on business_history (user_id, business_id, revision desc);

alter table businesses add column if not exists deleted_at timestamptz;
alter table businesses add column if not exists saved_by text;
