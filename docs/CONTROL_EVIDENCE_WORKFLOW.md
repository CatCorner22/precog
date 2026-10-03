# Control evidence workflow

## Scope and intended result

A signed-in preparer records what was checked, for what period, how, and where
supporting records are held. A separate authorized account records a review.
Exceptions stay open through correction and retest. The earlier result remains
visible in the history. This is a bounded execution log for the five
monthly checks, not a full control-design catalog or an audit opinion.

This implementation starts from main `efb358b4e345ff7c7314760666d5f80acb9b5361`,
source tree `b85abdbbd88ed7652a4ff3d743c7ec2d83ee26d9` (merged PR #146).

## Where it appears

The control evidence log is a section of each business's Monthly review
(`/?tab=monthly`, section `evidence`, so `/?tab=monthly&item=evidence` opens on
it), beside the monthly checks, the control calendar and the Decisions log. The
firm workspace (`/firm`) no longer shows it: its client list opens each client
on that client's Monthly review. The digest email still links to `/firm`, where
that list is.

## Behavior

| Action                                  | Result                      | Guard                                                                               |
| --------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| Record work, no exception reported      | Awaiting review             | Scope, real date, reported performer, method, references and note required          |
| Record work or review with an exception | Correction needed           | Follow-up owner and due date required                                               |
| Review with no exception                | Reviewed for recorded scope | Separate authorized account, attestation, evidence references and more than inquiry |
| Correct an exception                    | Retest needed               | Correction scope, performer, date, references and explanation required              |
| Retest with no exception                | Reviewed for recorded scope | Separate authorized account and reperformance required                              |
| Reopen a conclusion                     | Correction needed           | Reason, follow-up owner and due date required                                       |

Firm owners and reviewers may review; preparers may not. The account that
recorded the latest performance/correction is excluded from reviewing it. The
reviewer's name must not equal the reported performer's name. These checks and
an explicit attestation constrain self-review; they do not establish that two
accounts are controlled by different humans or verify actual permissions and
competence. The screen explains the limitation.

When a signed-in user records Done or Exception on the monthly review, Precog
adds one **record** entry for that check and month, recorded by that account. The
entry is dated the day the result is recorded, uses method inquiry, names the
monthly review's suggested owner as performer and cites the note as its one
evidence reference. When the note is empty, the one reference reads exactly
"No evidence reference given", so the entry never reads as if it cites
something; entries recorded before this release keep the placeholder they were
written with ("Monthly review note for" and the month). Done awaits review; Exception needs correction, with
the monthly due date as the follow-up due date. A later result for the same
check and month is refused here and kept only in the monthly review log.
Monthly-review results recorded before this release are neither imported nor
relabeled. No score, control-effectiveness calculation, insurance assumption or
AI answer is improved merely by recording an event. The UI uses “no exception
reported,” never a blanket “control effective” badge.

## Evidence and data handling

Records include a stable check id, source-business revision, covered month,
revision number, status and an ordered event history. Each event holds the
verified account id/name and a server-generated timestamp. The performed date
and performer are explicitly reported facts. The source-business revision is a
reference, not a permanent copy of all configuration or evidence at that time.

The log stores at most eight restricted document/version references per event,
not evidence-file bytes. It neither fetches those locations nor attests to the
records' integrity, completeness or authenticity. Avoid signed URLs, credentials,
patient information and full financial account numbers. References display as
escaped text, not executable markup or automatically clickable URLs.

History is append-only through these APIs, not cryptographically immutable or
protected against a privileged database administrator. A profile restore cannot
replace it because it is outside the client-editable profile JSON. Hard business
or owning-account deletion cascades; soft-deleted businesses are inaccessible.
The owner's account export includes owned logs; a contributor's attribution in
another owner's retained log remains. Review this privacy/retention behavior
before commercial release; this file does not establish a legal retention rule.

Draft fields use immutable account-scoped session storage and business/check
keys. They are not cloud saved until submission. Reload restores available draft
fields but never the independence attestation. Errors retain the draft; an
unchanged retry uses the same command id. Closing a tab or clearing storage may
remove a draft. Refused browser storage is disclosed. Late callbacks from an
unmounted account workspace cannot show results in the next workspace.

## Transactions and limits

Ambiguous shared business identifiers are rejected instead of silently choosing
a client. The server resolves ownership and firm membership from the authenticated
account, not the request. Its existing same-origin and expected-account checks
run before domain operations. A transaction locks the owning business row,
checks current membership and log revision, and appends one event. An old
revision returns conflict; an identical retry of the same actor/command is
idempotent. Canonical JSON comparison accommodates PostgreSQL JSONB key order.
The owning business row lock also coordinates with deletion/other log writes.

Limits: 20 checks per page with explicit more-pages state; 5,000 checks per
business; 200 events per check; 300,000 serialized bytes per application record;
350,000 database JSON-text bytes. Hitting a limit refuses a new event and does
not truncate existing evidence/history. Export and start a linked check or obtain
support rather than silently removing records. Page offsets can shift when
another user inserts a record; reload to refresh the view.

## Basis and policy choices

PCAOB AS 2201 paragraphs .42–.50 distinguish design from operation and discuss
inquiry, observation, inspection and reperformance; inquiry alone is not sufficient
evidence of a control's effectiveness. These are professional audit principles,
not an assertion that every small business is subject to PCAOB standards.
Source reviewed 2026-09-29:
https://pcaobus.org/oversight/standards/auditing-standards/details/AS2201

The required second account and reperformance after a correction are this
application's conservative workflow rules. They are not universal legal mandates
or a guarantee of independent assurance. The five checks are Precog's existing
catalog; additional controls and implementation-state evidence remain later work.

The transaction uses PostgreSQL row locks, described in the current official
locking documentation, reviewed 2026-09-29:
https://www.postgresql.org/docs/current/explicit-locking.html

## Verification commands

```sh
npm run typecheck
npm run lint
npm run format:check
npm test -- --maxWorkers=2
npm run build
npm run check:bundle
npm run check:headers
PRECOG_CONTROL_E2E=1 node scripts/test-control-evidence-http.mjs
PRECOG_CONTROL_E2E=1 node scripts/e2e-control-evidence.mjs
```

The two standalone scripts use the compiled Vercel handler on localhost:8089,
genuine signed fixture sessions, and a disposable embedded PGlite database. They
refuse a configured DATABASE_URL or VERCEL production environment and make no
external model/payment/email calls. The test-only harness copies the installed
PGlite runtime assets into disposable build output. This does not change the
production PostgreSQL deployment path. Browser testing requires an allowed local
browser runtime and installed Chromium. The optional
PLAYWRIGHT_CHROMIUM_EXECUTABLE selects an already-installed executable, not a way
to override browser policy. Neither script creates an application test-login route.

The store test suite can additionally target isolated real PostgreSQL through
the repository's existing `PRECOG_LIFECYCLE_POSTGRES=1` / `openSafetyDb` contract.
Do not confuse embedded concurrent requests with independent pooled PostgreSQL
connection coverage. Execution results and environment limitations belong in the
accompanying session report, not assumed from test availability.

## Release and open work

No dependency, framework replacement or model training is required. Apply the
additive migration only through the authorized release workflow. Older code
ignores the new table; an application rollback must retain the table/history.
Do not drop it to roll back the UI. There is no automatic conversion of earlier
monthly notes. Customer support/data retention decisions must be reviewed before
commercial launch.

Still separate: generic control configuration and source/version lifecycle,
actual-system access reconciliation, evidence uploads and integrity checking,
notifications/escalation, quantified evidence-backed effectiveness, cross-period
analytics, complete hierarchical mapping, broader insurance and paid-pilot work.
