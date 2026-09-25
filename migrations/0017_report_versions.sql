-- A report the firm sends is a locked version: the profile frozen as it was,
-- the preparer, and the reviewer who signed it off. Nothing in a locked
-- version changes after it is created; a new report is a new version.

create table if not exists report_versions (
  id text primary key,
  user_id text not null,
  business_id text not null,
  version_no integer not null,
  revision bigint,
  profile jsonb not null,
  scope_note text not null default '',
  prepared_by text references "user" ("id") on delete set null,
  prepared_at timestamptz not null default now(),
  reviewed_by text references "user" ("id") on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',
  sent_at timestamptz,
  constraint report_versions_business_fk
    foreign key (user_id, business_id) references businesses ("user_id", "id") on delete cascade,
  constraint report_versions_number_unique unique (user_id, business_id, version_no)
);

create index if not exists report_versions_business_idx
  on report_versions (user_id, business_id, version_no desc);
