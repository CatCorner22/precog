# Control-evidence hardening

This continues the unpublished control-evidence implementation. It is not a
production deployment or an operating-effectiveness opinion. The combined change
still requires migration `0026_control_execution_log.sql` before deployed use.

## Reviewer independence across history

A review or retest checks every recorded performance and correction, not just the
latest one. The recording account for any of those events cannot independently
review that check. The same restriction applies when the reviewer's current name
matches any reported performer after Unicode normalization, case folding and
whitespace normalization. Reopening and another correction do not erase earlier
participation. The server and the interface use the same conflict helper.

These are conservative workflow rules, not verified identity matching. Separate
accounts can belong to one person; names can change or collide. An attestation and
real-world independence/competence review remain necessary. A reviewer who only
reviewed earlier work is not disqualified merely by that earlier review.

A correction date cannot precede the preceding reported performance/correction.
Same-day corrections remain allowed: the application does not invent a time of day
for a calendar-date entry. Existing history is retained unchanged.

## Authorization and lock order

The initial candidate query identifies an accessible business; its membership and
role data do not authorize the final command. The transaction locks that business
row first, then reads current membership in a separate SQL statement and holds a
`FOR SHARE` lock on the membership row through the command's commit. This blocks
both membership deletion and non-key role updates while an admitted command runs.

This is important with PostgreSQL Read Committed statement snapshots: a joined
membership read started before a wait on the business lock can otherwise retain an
obsolete role. An operation admitted first may finish while a later revocation
waits. The guarantee is serialization of admission and revocation, not retroactive
cancellation of a committed action.

Log reads use shared parent-row locks rather than exclusive update locks, allowing
readers to coexist. Writes still serialize per business to protect quota, first
insert, history and business-deletion invariants. There are no external service
calls inside these transactions.

Primary implementation references, reviewed September 29, 2026:

- PostgreSQL 16, explicit row locking:
  https://www.postgresql.org/docs/16/explicit-locking.html
- PostgreSQL 16, Read Committed isolation:
  https://www.postgresql.org/docs/16/transaction-iso.html

Those references explain database semantics; the exact authorization and lock-order
rules are application design decisions, not an external certification.

## Stable pagination

The log now accepts `cursor: null` for its first page. Further requests pass the
returned `nextCursor`, which names the last displayed check. Its timestamp is
resolved inside the authenticated account/business/month. A cursor from another
scope is rejected; it is never used as authority. The query compares
`(created_at, id)`, keeping timestamp precision inside PostgreSQL.

Newer inserts do not shift existing records into duplicate or skipped offset pages.
This remains a live log, not a frozen point-in-time snapshot. Reload starts at the
first page to show newly added records. A stale/missing cursor produces an explicit
recovery error rather than an empty-success response. The UI keeps a cursor history
for previous/next navigation and clears it when the period changes.

The previous `page` argument was part of an unpublished feature; the combined patch
updates the server, UI, HTTP fixture and tests together. No published API is
claimed to support both request contracts.

## Verification and release gates

New regression tests cover earlier authors and performers, Unicode/whitespace name
matching, repeated corrections/reopening, correction chronology, permission changes
at the lock boundary and new inserts between pages. The deterministic authorization
interleaving tests mutate membership at a controlled SQL boundary in the embedded
database; they do not simulate separate PostgreSQL connections.

The dedicated `npm run test:postgres:evidence` command requires
`PRECOG_LIFECYCLE_POSTGRES=1` and an isolated local PostgreSQL `DATABASE_URL` and
refuses production. It runs the store and pagination suites plus two independent-
connection lock-wait tests. Those tests observe actual lock waiting before a
membership revocation or demotion. They are explicitly skipped in an ordinary
embedded-only test run, not counted as passed. The mandatory migrations CI job
includes this command.

Before release, run the complete suite, compiled HTTP tests, interactive browser
journey, real-PostgreSQL tests and fresh dependency audit, then review the migration
and retention behavior. A successful embedded or HTTP check is not evidence of
external OAuth, real PostgreSQL, a hosted deployment or an interactive browser pass.
Do not delete the log table/history as an application rollback.
