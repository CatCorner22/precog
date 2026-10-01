-- An owner who stops reminders stays stopped for that address on that
-- business, even when an advisor clears the address and enters it again:
-- saving it sends nothing, and the owner's own link still turns them back on.

create table if not exists owner_email_stops (
  user_id text not null references "user" ("id") on delete cascade,
  business_id text not null,
  email text not null,
  token text not null,
  stopped_at timestamptz not null default now(),
  primary key (user_id, business_id, email)
);
