-- Reviewer check-in links: a bookkeeper / manager can record that a control review
-- happened without being able to edit the map. Check-ins are stored separately and
-- merged into the owner's evidence view, so reviewers never write to the profile blob.

create table if not exists review_links (
  token text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  business_id text not null,
  label text not null default 'Reviewer',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index if not exists review_links_user_idx on review_links (user_id, created_at desc);

create table if not exists evidence_checkins (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  business_id text not null,
  process_id text not null,
  evidence_id text not null,
  done_at timestamptz not null default now(),
  by_name text not null default 'Reviewer',
  note text,
  token text
);

create index if not exists evidence_checkins_biz_idx on evidence_checkins (user_id, business_id, done_at desc);
