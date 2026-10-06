-- Review rules for locked versions (CPA-8).
--
-- 1. review_override_note: when a client's engagement names a reviewer and a
--    different owner or reviewer of the firm reviews a version for issuance,
--    that person writes why (10 to 600 characters). Null on every other
--    review and on every version reviewed before this migration. Like the
--    other review stamps it stays outside the frozen-column trigger
--    (migration 0048), so a withdrawn review clears it.
--
-- 2. The activity log accepts 'version_review_withdrawn': the firm owner, or
--    the person who reviewed a version, withdraws that review before the
--    version is sent. The check list only grows; every earlier event stays
--    valid, so code still running from before this release writes as before.
alter table report_versions add column if not exists review_override_note text;

alter table firm_audit_log drop constraint if exists firm_audit_log_event_check;
alter table firm_audit_log add constraint firm_audit_log_event_check check (event in (
  'member_invited', 'invite_revoked', 'member_joined', 'member_left', 'member_removed',
  'role_changed', 'ownership_transferred', 'letterhead_changed', 'retention_changed',
  'client_deleted', 'client_restored', 'client_handed_over', 'client_granted',
  'client_handed_back', 'engagement_saved', 'engagement_ended', 'engagement_reopened',
  'share_created', 'share_revoked', 'version_locked', 'version_review_requested',
  'version_returned', 'version_reviewed', 'version_review_withdrawn', 'version_sent',
  'owner_email_set', 'quickbooks_connected', 'quickbooks_disconnected', 'export_run',
  'plan_changed', 'operator_lookup', 'operator_linked_stripe', 'operator_lifted_cap'
));
