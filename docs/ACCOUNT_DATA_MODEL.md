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
  (`/api/cron/digest`). After the purge a deletion marker remains
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
- The firm owner can hand the firm to a member (`transferFirmOwnership` in
  `src/lib/precog/firm/store.ts`): a new `firms` row under the new owner,
  every row that names the firm repointed (members, invitations, client
  businesses, deletion markers, the billing row), the old row deleted last;
  the new owner's role becomes owner and the old owner's reviewer. Refused
  while the firm's payment is overdue or disputed.
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
