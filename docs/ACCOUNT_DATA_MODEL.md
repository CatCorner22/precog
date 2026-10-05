# Account and business data model

How the app keeps one account's businesses apart from another's, in the
browser and in Postgres, and where each rule is tested. The change note that
introduced this model is in
[`history/ACCOUNT_DATA_SAFETY_2026-09-25.md`](history/ACCOUNT_DATA_SAFETY_2026-09-25.md).

## Browser workspaces

- The app stores a signed-in account's data under
  `precog.workspace.v2:account:<encoded verified id>:` and a guest's under
  `precog.workspace.v2:guest:` (`src/lib/precog/workspace-storage.ts`).
  Profiles, portfolios, onboarding drafts, value-proof data and power-map
  baselines all sit inside that namespace.
- The app never treats "sign-in still loading" as a guest session. When the
  account changes, it remounts the workspace and drops earlier requests and
  queued saves.
- Older records written before namespacing belong to nobody the app can
  verify. The app leaves them unassigned and offers them for export under
  **Local recovery and guest work**; it never uploads them to whoever signs in
  next. The owner can copy finished guest work into the signed-in account's
  local portfolio, where it gets new business ids; the guest copy stays.
- On sign-out the app first tries to flush the active workspace. If that
  fails, the user can cancel or export a recovery copy. After sign-out the app
  removes the active and portfolio copies the server has confirmed with
  identical content, and keeps everything else (unconfirmed records, drafts,
  records with no verified cloud copy) in the account's own namespace.
- Namespacing is not encryption: anyone with the same browser profile and
  developer tools can read it. A blocked or full browser store cannot
  guarantee recovery after the page closes.
- Other open tabs learn of a sign-out through a signal that carries no
  credentials or business data, and stop showing the old workspace until they
  reload.

## Server authorization

- Every server operation compares the account the client expects with the
  verified session; saving and deleting a profile also require that
  expectation in their validated input. No id the client sends grants access.
- The session check bypasses Better Auth's cookie cache
  (`disableCookieCache` in `src/lib/auth/verify.server.ts`), so a revoked
  session stops working at once.

## Business lifecycle in Postgres

- Creating, updating, recording history and moving the active pointer run on
  one reserved connection inside one transaction (PGLite uses its own
  transaction API). The store never treats independent pool queries as a
  transaction.
- A lock on the owner's row serializes lifecycle changes and enforces the
  per-account business limit. The store rechecks shared-business membership
  inside the transaction.
- A save with an old base revision for a business that no longer exists is a
  conflict, never a new business.
- Deleting a business is a soft delete with a 30-day restoration window
  (`DELETED_RETENTION_DAYS` in `src/lib/precog/business-store.ts`). Deleting
  and restoring each advance the revision, so a device that saw the business
  before it was deleted must reload before it can overwrite the restored one.
  Deleting also removes the business's active pointers in the same
  transaction.
- The weekly scheduled job purges businesses past their grace period
  (`/api/cron/digest`), except a firm's client that holds a locked report
  version and that its owner did not share with the firm: that row stays
  soft-deleted (unseen, and not restorable once the grace period is over)
  until its firm's `retention_years` have passed since the deletion, so its
  locked versions, monthly review log and engagement row stay with it
  (`KEPT_FOR_RETENTION` in `src/lib/precog/business-store.ts`). No data is
  written to keep it; the purge simply skips it. Two account deletions end
  the period early. The account that set up the client (the row's
  `user_id`) takes it at once through the cascade, kept or not: a member can
  delete their account once every client they set up is deleted, because
  `refuseWhileHoldingFirmClients` in `src/lib/precog/account-store.ts`
  counts only live clients. The firm owner's account deletion clears
  `firm_user_id` on its members' businesses, deleted ones included
  (`deleteAccountRows`), so their kept clients stop matching and the next
  weekly purge removes each once its 30 days have passed; for the same
  reason the predicate's fallback of 7 years for a missing `firms` row is
  never reached today. The Terms and Privacy say both. After a purge, review-log and engagement rows whose business is gone
  are deleted too (`deleteOrphanedClientAudit` in
  `src/lib/precog/firm/store.ts`). After the purge a deletion marker remains
  (`migrations/0023_business_deletion_markers.sql`): identity references and
  the deletion time, no profile. It stops a client with no revision from
  recreating a deleted id. Restoring removes the marker; deleting the account
  removes its markers through a foreign-key cascade. The same job purges share
  view logs and failed passcode guesses past their retention
  (`SHARE_VIEW_RETENTION_DAYS`, `PASSCODE_ATTEMPT_RETENTION_DAYS`).
- History keeps one version per 15 minutes of each person's editing, for 90
  days and at most 200 versions per business; the newest kept version stays
  however old it is (`src/lib/precog/business-retention.ts`). A save copies
  the row it replaces into `business_history` only when the newest kept
  version is older than the window or another account saved either one.
  The 90 days count from when the next kept version was saved (no earlier
  than the version was replaced), not from the version's own save, so the
  state from before a session that follows months without edits stays.
  Before a restore loads a past version, a separate POST
  (`keepHistoryBeforeRestore`) keeps the current state.
- `business_history_business_idx` (0016) duplicates the columns of the
  `business_history_revision_unique` constraint. Drop it in a new migration
  only after `EXPLAIN` on production shows that `listBusinessHistory` and the
  history prune use the unique index.
- An active pointer names both the business and the account that owns it.
  The store reads a legacy full-profile pointer only for a profile that was
  never migrated, never for a modern id-only pointer or a known deletion.
- When a firm member is removed or leaves, every client business they set
  up for the firm (live and deleted) moves to the firm owner's account in
  the same transaction (`transferBusinessesToOwner` in
  `src/lib/precog/business-store.ts`). A business row is keyed by its owner
  and no child table cascades an update, so the move is a copy of the parent
  row under the owner, a repoint of every child row (history, report
  versions, QuickBooks connections and readings, procedure pictures, evidence
  log, engagement marks, review log, reminder and owner-email logs, shares,
  deletion markers and colleagues' profile pointers; the member's own pointer
  is deleted), and the old parent deleted last. When the owner already holds
  the same id, as a
  `businesses` row or a `business_deletion_markers` row, the moved business
  gets a new id (`<old id>-<8 hex>`); the owner's Firm page names it, and the
  member's open tab meets the usual "no longer available" refusal on its next
  save. The owner's per-account ceiling is not checked (nothing is created).
  A business the member owns and shared with the firm (`granted_at` set) does
  not move: it stays the member's, the firm keeps working on it, and the
  member's own links on it survive. The firm's activity-log rows are not
  repointed: they stay with the firm and keep the business id they were
  written with.
- The firm owner can hand the firm to a member (`transferFirmOwnership` in
  `src/lib/precog/firm/store.ts`): a new `firms` row under the new owner
  (name, plan, letterhead, logo, cover page and retention period carried),
  every row that names the firm repointed (members, invitations, client
  businesses, deletion markers, the billing row, accepted client
  invitations, `report_versions.firm_user_id`, and the activity log under
  the bypass, so the firm's history outlives the previous owner's account),
  the old row deleted last; the new owner's role becomes owner and the old
  owner's reviewer. Refused while the firm's payment is overdue or disputed.
- `product_events` (migration 0042) keeps one row per account and milestone
  (first business, first locked version, first report sent, first monthly
  review): the account id, the business id with no foreign key, and a time.
  It is deleted with the account and never backfilled; a purged first
  business keeps its milestone.
- A firm's letterhead text, logo (a data URL up to 64 KB) and cover-page
  switch live on `firms` (migration 0041); locking a report version copies
  the firm's name, letterhead and logo into `report_versions`, so a locked
  version prints what the firm looked like when it was locked. Versions
  locked before 0041 carry no snapshot and print the firm's live name only.
- A shared locked report is a `map_shares` row with `report_version_id` set
  (migration 0040), so it dies with the version and with the account like a
  shared map does.

## Firm clients after batch 3 (migrations 0045 to 0050)

- Engagement (0045): the client's `engagement_marks` row also holds the
  engagement: `scope`, `period_start`, `period_end`, `status` (`active` or
  `ended`), `ended_at`, `preparer_user_id` and `reviewer_user_id` (both set
  to null when that account is deleted, and read as not set once the person
  has left the firm). An ended engagement is read-only for the firm's
  members (`assertEngagementOpen`, called from every save and change path);
  the business's own account is unaffected, and reads, exports, the archive
  and deletion stay open. Locking a version copies the scope and period
  into `report_versions.engagement_scope`, `engagement_period_start` and
  `engagement_period_end`, which the version prints from; versions locked
  before 0045 hold nulls and print no engagement line.
- Retention (0045): `firms.retention_years`, default 7. The database allows
  1 to 50; Precog lets a firm owner pick 7 to 15 (`RETENTION_YEARS_MIN` and
  `RETENTION_YEARS_MAX` in `src/lib/precog/firm/engagement-row.ts`), so a
  lower floor is a constant change, not a constraint change. It sets how
  long a deleted client holding a locked version is kept (above) and how
  long each activity-log entry lives.
- Client invitations (0046): `business_firm_grants` holds a business
  owner's invitation to a firm (token, invited address, 14 days to accept,
  who accepted and when, revoked). On acceptance `businesses.firm_user_id`
  becomes the firm and `businesses.granted_at` is stamped; `user_id` never
  changes, so the business stays the owner's. Ending the access, by the
  owner or by the firm owner, clears both columns, revokes the links the
  firm's members made on the business and resets the engagement (scope,
  period, preparer, reviewer, status). A firm owner's account deletion hands
  back every business shared with that firm the same way; the business
  owner's account deletion removes the business with the account, and the
  firm's log records it as handed back. A shared business counts toward the
  firm's client limit, never moves in a member hand-over, cannot be deleted
  or restored by the firm, and is purged 30 days after its owner deletes it.
- Versions a firm locked (0046): `report_versions.firm_user_id` (no foreign
  key, so the value outlives the firm owner's account) is the firm a
  version was locked for. A firm member reads a version only when it equals
  the business's `firm_user_id`, or it is null (locked before 0046) on a
  business that was never shared (`FIRM_READS_VERSION` in
  `src/lib/precog/firm/reports.ts`). So after a hand-back, or a later
  invitation to another firm, a firm reads none of the versions another
  firm locked. The business's own account reads every version.
- Request and return (0047): `review_requested_at`, `review_requested_by`,
  `review_requested_from`, `returned_at`, `returned_by` and `return_note`
  (1 to 600 characters) on `report_versions`, all stamps. The request goes to
  the engagement's reviewer when they can review it now, else the firm
  owner, else to every member who can (owner or reviewer, and not its
  preparer). A returned version stays as it was locked; the preparer locks a
  new one.
- Activity log (0048): `firm_audit_log`, one row per event (the event list
  is the table's check constraint), keyed by the firm owner's account
  (`firm_user_id`, cascading with it) with the actor's id and their name as
  it was (no foreign key on the actor, so a departed member's rows still
  read). A trigger refuses every `update` and `delete`, Precog's included,
  unless the transaction set `precog.audit_bypass`; Precog sets it in the
  firm owner's account deletion, the retention purge and the ownership
  transfer, which repoints the rows to the new owner. A member hand-over
  repoints nothing. The weekly run deletes each row once it is older than
  its firm's `retention_years` (7 when the firm's row is gone), each by its
  own age, not by a client's deletion date (`purgeExpiredAudit` in
  `src/lib/precog/firm/audit.server.ts`). The firm owner's account export
  carries the log as `firmActivity`. The same migration freezes what a
  locked version printed: a second trigger refuses any change to those
  columns, with no bypass.
- Model-call records (0049): `llm_usage`, one row per call (account,
  feature, model, prompt and completion tokens, outcome, time; no text),
  deleted with the account and purged after 13 months by the weekly run;
  the view `llm_usage_daily` sums them by day, feature and model, and the
  account export carries the account's totals per feature (`modelUsage`).
- Tier price (0050): `billing_accounts.subscription_price_id`, the Stripe
  price a subscription runs on, which names its tier and so its client
  limit; null until the next subscription event, and a running plan with a
  null price keeps 50 clients.

## Releasing changes to this model

Release database and application changes together and apply migrations
before the code that relies on them. An older client without the account
expectation must reload rather than save unguarded. Never roll back to a
build that silently re-creates deleted records; keep additive schema objects
when rolling forward to a fix.

## Where it is tested

- `src/lib/precog/workspace-storage.test.ts`: separate namespaces for each
  account and the guest, legacy records left unassigned, sign-out cleanup of
  confirmed copies only, save queues closed when the account changes.
- `src/lib/precog/business-store.test.ts`: per-account keys, revisions and
  racing writers, stale saves for a business that no longer exists, active
  pointers, soft delete, restore and purge, against PGLite with every
  migration applied.
- `src/lib/precog/account-store.test.ts`: deleting an account removes what it
  owns and leaves other accounts intact.
- `src/lib/precog/firm/grant-store.test.ts`, `engagement-store.test.ts`,
  `business-role.test.ts` and `audit.server.test.ts`: client invitations
  and their hand-back, the engagement and its read-only state, the firm's
  role on a shared business, and the activity log's triggers and purge;
  `audit-writers.test.ts` fails when a firm-changing server function writes
  no log row and names no reason.
- `src/lib/precog/business-lifecycle-safety.test.ts`: the same lifecycle
  against PGLite on every `npm test`, and in CI against a disposable Postgres
  schema with up to eight connections (simultaneous updates, the business
  limit, save and delete races, injected failures, sharing revocation,
  retention and purge markers).
- `scripts/e2e-account-safety.mjs` (CI job "Authenticated compiled-server
  safety"): the production build behind a local HTTP adapter, a dedicated
  `precog_safety_e2e` database and two real Better Auth signed sessions. It
  covers edit, save and reload in the browser, switching accounts in one
  browser, sign-out in another tab, a delayed request for the wrong account,
  and a stale save after a delete. The seeded sessions do not exercise an
  identity provider's sign-in redirect or a live Vercel deployment.
