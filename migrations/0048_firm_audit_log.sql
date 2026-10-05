-- One row per thing done to a firm's file: membership and roles, invitations,
-- ownership, clients deleted, restored, granted or handed back, engagements,
-- share links, locked versions and their review, QuickBooks links, owner
-- emails, letterhead, exports, plan changes and Precog operator actions.
-- Insert-only: the trigger refuses an update or delete from every connection,
-- Precog's included, unless the transaction set precog.audit_bypass (the
-- firm owner's account deletion, the retention purge and the ownership
-- transfer). actor_name is the name at the time; no FK on the actor, so a
-- departed member's rows still read.
create table if not exists firm_audit_log (
  id bigserial primary key,
  firm_user_id text not null references "user" ("id") on delete cascade,
  actor_user_id text,
  actor_name text not null default '',
  event text not null,
  business_id text,
  subject_user_id text,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint firm_audit_log_event_check check (event in (
    'member_invited', 'invite_revoked', 'member_joined', 'member_left', 'member_removed',
    'role_changed', 'ownership_transferred', 'letterhead_changed', 'retention_changed',
    'client_deleted', 'client_restored', 'client_handed_over', 'client_granted',
    'client_handed_back', 'engagement_saved', 'engagement_ended', 'engagement_reopened',
    'share_created', 'share_revoked', 'version_locked', 'version_review_requested',
    'version_returned', 'version_reviewed', 'version_sent', 'owner_email_set',
    'quickbooks_connected', 'quickbooks_disconnected', 'export_run', 'plan_changed',
    'operator_lookup', 'operator_linked_stripe', 'operator_lifted_cap'
  ))
);
create index if not exists firm_audit_log_firm_idx on firm_audit_log (firm_user_id, occurred_at desc);

create or replace function precog_audit_log_guard() returns trigger language plpgsql as $$
begin
  if current_setting('precog.audit_bypass', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'firm_audit_log is append-only' using errcode = 'insufficient_privilege';
end $$;
drop trigger if exists firm_audit_log_guard on firm_audit_log;
create trigger firm_audit_log_guard before update or delete on firm_audit_log
  for each row execute function precog_audit_log_guard();

-- A locked version keeps what it printed. Stamps (review, request, return,
-- sent), the two key columns the member hand-over repoints, firm_user_id
-- (an ownership transfer repoints it), and prepared_by going to null when
-- its account is deleted stay free. No delete trigger:
-- the cascade from businesses is the purge and the account deletion.
create or replace function precog_report_version_frozen() returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id
    or new.version_no is distinct from old.version_no
    or new.revision is distinct from old.revision
    or new.profile is distinct from old.profile
    or new.scope_note is distinct from old.scope_note
    or (new.prepared_by is distinct from old.prepared_by and new.prepared_by is not null)
    or new.prepared_at is distinct from old.prepared_at
    or new.scoring_version is distinct from old.scoring_version
    or new.layout_version is distinct from old.layout_version
    or new.report_model is distinct from old.report_model
    or new.firm_name is distinct from old.firm_name
    or new.firm_letterhead is distinct from old.firm_letterhead
    or new.firm_logo_data_url is distinct from old.firm_logo_data_url
    or new.engagement_scope is distinct from old.engagement_scope
    or new.engagement_period_start is distinct from old.engagement_period_start
    or new.engagement_period_end is distinct from old.engagement_period_end
  then
    raise exception 'a locked report version keeps what it printed' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
drop trigger if exists report_versions_frozen on report_versions;
create trigger report_versions_frozen before update on report_versions
  for each row execute function precog_report_version_frozen();
