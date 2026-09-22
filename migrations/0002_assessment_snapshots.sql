create table if not exists assessment_snapshots (
  id text primary key,
  user_id text not null,
  title text not null check (char_length(title) between 1 and 120),
  practice_name text not null,
  profile_json jsonb not null,
  model_version text not null,
  corpus_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists assessment_snapshots_user_created_idx
  on assessment_snapshots (user_id, created_at desc);
