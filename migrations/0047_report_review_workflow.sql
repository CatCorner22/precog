-- Request and return on a locked version. A returned version stays as it was
-- locked; the preparer locks a new one. All stamps, never frozen.
alter table report_versions add column if not exists review_requested_at timestamptz;
alter table report_versions add column if not exists review_requested_by text references "user" ("id") on delete set null;
alter table report_versions add column if not exists review_requested_from text references "user" ("id") on delete set null;
alter table report_versions add column if not exists returned_at timestamptz;
alter table report_versions add column if not exists returned_by text references "user" ("id") on delete set null;
alter table report_versions add column if not exists return_note text not null default '';
