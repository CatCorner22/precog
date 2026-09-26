-- No business contents are retained here. Keep a deletion identity after the
-- 30-day restore window so a stale client cannot silently re-create the row.
create table if not exists business_deletion_markers (
  user_id text not null references "user"(id) on delete cascade,
  business_id text not null,
  firm_user_id text references firms(user_id) on delete set null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, business_id)
);
insert into business_deletion_markers (user_id, business_id, firm_user_id, deleted_at)
  select user_id, id, firm_user_id, deleted_at from businesses where deleted_at is not null
  on conflict (user_id, business_id) do nothing;
