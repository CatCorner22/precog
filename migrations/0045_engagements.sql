-- One engagement per client business (the existing engagement_marks row):
-- what the firm was engaged to do, for which period, who prepares and who
-- reviews, and whether it has ended. An ended engagement is read-only for the
-- firm's members until the firm owner reopens it.
alter table engagement_marks add column if not exists scope text not null default '';
alter table engagement_marks add column if not exists period_start date;
alter table engagement_marks add column if not exists period_end date;
alter table engagement_marks add column if not exists status text not null default 'active';
alter table engagement_marks add column if not exists ended_at timestamptz;
alter table engagement_marks add column if not exists preparer_user_id text references "user" ("id") on delete set null;
alter table engagement_marks add column if not exists reviewer_user_id text references "user" ("id") on delete set null;
do $$ begin
  alter table engagement_marks add constraint engagement_marks_status_check check (status in ('active', 'ended'));
exception when duplicate_object then null; end $$;
-- How long a firm keeps a deleted client's locked versions and monthly
-- review log, and each activity-log entry. Precog's code allows 7 to 15
-- years (RETENTION_YEARS_MIN/MAX); the wide check only stops nonsense, so a
-- lower floor needs no constraint change.
alter table firms add column if not exists retention_years integer not null default 7;
do $$ begin
  alter table firms add constraint firms_retention_years_check check (retention_years between 1 and 50);
exception when duplicate_object then null; end $$;
-- The engagement as it stood when a version was locked; printed from here only.
alter table report_versions add column if not exists engagement_scope text;
alter table report_versions add column if not exists engagement_period_start date;
alter table report_versions add column if not exists engagement_period_end date;
