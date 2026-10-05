# Security

What Precog does to protect the data it holds, limited to what the code in this repository shows. Each claim names the file that makes it true, so a reader can check it. The list of who processes data is in Precog's Privacy page (`src/routes/privacy.tsx`); the copy at the end of this file repeats it, and the list in Privacy is authoritative.

## Hosting and regions

- Precog runs as Vercel serverless functions with a Neon Postgres database. One database holds every record, including procedure pictures; nothing is stored in object storage.
- The function region is the Neon region once the owner sets `FUNCTION_REGIONS` in `vite.config.ts` (see [OPERATIONS.md](./OPERATIONS.md), Production settings). Until then it is Vercel's default.

## Encryption

- In transit: TLS, with `strict-transport-security: max-age=31536000; includeSubDomains` on every response (`vite.config.ts`, nitro `routeRules`), so a browser that has visited once refuses plain http.
- At rest: by the database provider (Neon encrypts its storage). Precog adds no disk-level encryption of its own.
- Application-level encryption covers the QuickBooks tokens only: they are sealed under `INTEGRATION_KEY` before they reach the database. To rotate the key, move the old value to `INTEGRATION_KEY_PREVIOUS` and set a new `INTEGRATION_KEY`; tokens sealed under either still open, and each refresh reseals under the new key (`.env.example`, QuickBooks block).

## Browser protections

Every response carries, from `vite.config.ts`:

- `content-security-policy: frame-ancestors 'self'`, so no other site can frame Precog or a shared map (clickjacking).
- `referrer-policy: strict-origin-when-cross-origin`, so a share token never leaves in a Referer header.
- `x-content-type-options: nosniff` and `permissions-policy: camera=(), microphone=(), geolocation=()`.

`npm run check:headers` reads them back from the built output in CI.

## Authentication

- Google and X sign-in go through Precog's auth broker; Precog's own Better Auth (`src/lib/auth/server.ts`) holds the session. Session cookies are Better Auth's: http-only, secure and SameSite=Lax; server functions additionally refuse cross-site requests (`assertSameSiteRequest` in `src/lib/auth/middleware.ts`).
- Email-and-password sign-in, when a deployment turns it on (`src/lib/auth/email-password.server.ts`), stores a hash of the password, never the password, and emails a confirmation link; an unconfirmed sign-up is removed after 24 hours.
- There is no multi-factor sign-in today. A session ends seven days after Better Auth last refreshed it, and Better Auth refreshes a session only when it is used more than a day after its last refresh (its defaults `expiresIn` and `updateAge`), so a session can end about six days after its last use. Sessions in the account menu ends the other sessions or every session at any time, and lists them only within a day of signing in (`/list-sessions` requires a session created within Better Auth's `freshAge`, one day; the dialog says so).
- The email links (owner reminder consent and stop links, password reset, confirmation) carry long random tokens; a link that does not match one answers a plain "no longer works" page and reveals nothing about the account.
- Owner and digest email links (`/api/owner-email`, `/api/digest-email`) cap token lookups at sixty opens per network address per minute (`src/lib/precog/reminders/email-link-limits.ts`); excess opens get a generic wait page, not a different error that would help guessing tokens.

## Authorization

- Every server function that reads or writes account data runs behind `authMiddleware` (`src/lib/auth/middleware.ts`), which resolves the user from the same-origin session and throws when signed out; a client-sent id is never trusted.
- Every query is scoped by that user id, or by the firm the user belongs to for a firm's client businesses (`src/lib/precog/business-store.ts`, `src/lib/precog/firm/store.ts`). Firm roles (owner, preparer, reviewer) decide who records review conclusions; the recording account cannot review its own work.
- On a business with a firm, the firm's work (locking, reviewing, returning and sending versions, owner reminder addresses) needs a role in that firm, not in any firm (`requireBusinessRole` in `src/lib/precog/firm/access.server.ts`). A business its owner shared with a firm stays the owner's: the owner's account cannot do the firm's work on it, and the firm reads only the versions it locked (`report_versions.firm_user_id`), and none after the access ends. An ended engagement is read-only for the firm's members.
- Precog's operator page (`/operator`) admits only the user ids in `PRECOG_OPERATOR_IDS`, a server-only setting; every operator server function answers 404 to anyone else, signed in or not, and the page shows the not-found text. The operator finds one account at a time by its exact address, sent in a POST body, never a URL ([OPERATIONS.md](./OPERATIONS.md), "Operator").
- The routes that reach stored data without a session each carry their own proof: the shared map page by its share token (with an optional passcode), the shared report page by its token, the client invitation page (`/join/client/<token>`, which names the business and its owner before sign-in; accepting it needs the invited firm owner's signed-in account) by its token, the owner email links by their token, the Stripe webhook by Stripe's signature, the QuickBooks callback by a state signed under `INTEGRATION_KEY`, and the scheduled job by `CRON_SECRET`. `GET /api/health` runs one query and returns no data.

## Activity log and locked versions

- The firm activity log (`firm_audit_log`, migration 0048) records who did what to a firm's file: named events, each with the actor's name as it was, written by the server functions that make the change (`src/lib/precog/firm/audit.server.ts`). `src/lib/precog/firm/audit-writers.test.ts` fails when a state-changing server function in the firm, share, QuickBooks, account, profile or operator modules neither writes a row nor says why it is exempt. Edits to a business's map, Monthly review results and QuickBooks readings are not in it; they live in the business's history and logs.
- A database trigger makes the log insert-only for every connection, Precog's included: an `update` or `delete` is refused unless the transaction set `precog.audit_bypass` (`select set_config('precog.audit_bypass', 'on', true)`, transaction-local). Precog sets it at three sites only: the firm owner's account deletion (`deleteAccountRows` in `src/lib/precog/account-store.ts`), the retention purge (`purgeExpiredAudit`) and the ownership transfer, which repoints the log to the new owner (`transferFirmOwnership` in `src/lib/precog/firm/store.ts`). The bypass is a custom setting, not a privilege: any connection can set it.
- A second trigger freezes what a locked report version printed (its profile, scope note, scores and layout versions, preparer and lock time, firm snapshot and engagement line), with no bypass; the review, request, return and sent stamps stay free, as do the keys a member hand-over repoints and a deleted preparer going to null. It guards updates only: deleting a locked version, directly or by deleting its business (the cascade the purge and the account deletion use), is not refused.
- What the triggers do not stop: they refuse an update of what a locked version printed, and an update or delete of a log row made without the bypass, whether by Precog's code or by a person in the SQL editor, so they stop mistakes, not someone who means to change the rows. Any connection that can write the tables, Precog's own included, can set the bypass and then change or delete log rows, and can delete a locked version or its business; a role that owns the tables (on Neon, usually the role in `DATABASE_URL`, and anyone with the Neon console) can also drop or disable a trigger. Nothing in the database stops a privileged database administrator; Neon's point-in-time restore is the record of the database as it was (see [OPERATIONS.md](./OPERATIONS.md), "Backup and recovery").

## Secrets and configuration

- Secrets live in environment variables only (`.env.example` names each one); none are in the code or the documentation. `scripts/deploy-config.test.mjs` fails when the code reads a variable the example file does not name.
- A production build refuses to finish without `DATABASE_URL`, a `BETTER_AUTH_SECRET` of 32 or more characters, an https `BETTER_AUTH_URL` and `SUPPORT_EMAIL`, with sign-in turned off, or while `src/lib/precog/legal/operator.ts` still holds a bracketed placeholder (`scripts/migrate.mjs`).

## Segregating money movement and advisor access

Precog is not a bank or a payroll system; it models who can move or hide money
alone and what evidence a careful owner or CPA expects. The product rules below
reduce the chance that an advisor, employee or compromised sign-in can take funds
without someone else noticing. They complement (they do not replace) bank
dual-control, positive pay, separate approval in the accounting system and
physical custody rules.

| Risk                                                                          | What Precog does                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One person holds incompatible duties (for example AP entry and check signing) | The power map and duty-conflict engine flag pairs on the team; the printed report and Start here surface open conflicts (`src/lib/precog/sod/detect.ts`, scoped scoring).                                                                                                                           |
| A CPA or preparer records work and signs off alone                            | Firm roles separate preparer from reviewer; the account that recorded a control-evidence event cannot review it (`docs/CONTROL_EVIDENCE_WORKFLOW.md`). Report versions must be reviewed for issuance before a share link is minted (`reportShareRefusal` in `src/lib/precog/share/share-store.ts`). |
| Books drift from who the map says can move money                              | QuickBooks read-only sync and access CSV import feed integration drift summaries on the profile (`integrationDriftSummary`); Start here and the weekly plan can route reconciliation without opening every client on `/firm`.                                                                       |
| Shared reports or maps leak too much                                          | Share links optional passcodes, guess limits, visitor-address hashing and a single public refusal for dead tokens (`src/lib/precog/share/share-server.ts`).                                                                                                                                         |
| Cross-tenant session riding on a shared host                                  | Same-site request checks on server functions (`assertSameSiteRequest` in `src/lib/auth/isolation.server.ts`).                                                                                                                                                                                       |
| Silent takeover via emailed links                                             | Owner and digest consent links need unguessable tokens; lookups are rate-limited per address (`src/lib/precog/reminders/email-link-limits.ts`).                                                                                                                                                     |
| Changes with no trail                                                         | Firm audit log, report version history, control execution log and business history downloads; account export and per-business history export in the account menu.                                                                                                                                   |

**Practices outside the code** the operator and each firm still own: background
checks, credential rotation, limiting who holds integration manager roles,
matching modeled duties to actual bank and ERP permissions, and reconciling
cash and payroll on a fixed cadence whether or not Precog is open.

## Data handling

- Share passcodes are stored as salted scrypt hashes (`src/lib/precog/share/share-attempts.ts`), guesses are counted per share in the database and the link locks after ten in fifteen minutes; share view logs keep a hash of the visitor address, not the address (`src/lib/precog/share/share-server.ts`), for a fixed retention after which they are deleted.
- A dead, revoked, or expired map or report share link answers the same public "unavailable" reason as an unknown token (`src/lib/precog/share/share-server.ts`), so a visitor cannot probe which tokens exist.
- Map backup import rejects files larger than two megabytes before JSON parsing (`src/lib/precog/builder/map-backup.ts`), so a oversized upload cannot freeze the browser.
- The model-call cap keeps a one-way hash of the network address, and the count holds no question or reply (`src/lib/precog/llm/`).
- Before notes reach the model, Precog masks anything that looks like a password, card number or code, and masks the draft that comes back (the Privacy page lists exactly what each feature sends).
- Precog does not use what you enter to train a model and sends xAI nothing for training.
- Procedure pictures are re-encoded in the browser, which drops their EXIF and GPS data, and the server then strips the remaining metadata segments (EXIF, XMP, text and time chunks) before storing them (`src/lib/precog/procedures/image-bytes.ts`).
- Deleting an account removes its rows; a deleted business is purged after a grace period by the weekly job (`docs/ACCOUNT_DATA_MODEL.md`).

## Logging and monitoring

- Server failures go to Sentry (`SENTRY_DSN`) or to a JSON webhook (`ERROR_REPORT_URL`); the report carries the release id and the route, never prompt text or a key (`src/lib/observability/`).
- Every model call logs one `[grok] usage` line with token counts and latency, and no prompt text, and stores one `llm_usage` row (account, feature, model, token counts, outcome and time; no question or answer) for 13 months; the weekly run purges older rows and the account deletion removes the account's (`src/lib/precog/llm/usage-log.server.ts`).
- Precog runs no analytics script; activation counts come from `product_events` (ids and times only).
- `GET /api/health` runs one database query and answers `{ ok: true }` or a 503; the uptime monitor and the restore procedure both read it ([OPERATIONS.md](./OPERATIONS.md)).
- Rate limits: model calls are limited per user, per process and per network address, and capped per account per day in the database; emailed token links are limited as above. These limits are cost and abuse control at the application level; a platform-level limit (Vercel Firewall) in front is the owner's setting.

## Backups and recovery

See [OPERATIONS.md](./OPERATIONS.md), "Backup and recovery": Neon point-in-time restore, the restore procedure and the drill record.

## Reporting a vulnerability

Write to the mailbox in the `SUPPORT_EMAIL` environment variable, which is the Support link in Precog's footer. Include the route or feature, what you did and what you saw. Precog's operator answers from that mailbox.

## Assurance

- No SOC 2 report. No HIPAA business associate agreement: Precog's Terms forbid protected health information outright.
- A standard data processing agreement is available on request from the support mailbox.
- Tests in CI pin the security headers, the server-function ids, the migration ledger and the account boundaries between two signed-in sessions (`.github/workflows/ci.yml`).

## Proposed sign-in changes awaiting the operator's go-ahead (not applied)

`src/lib/auth/server.ts` stays unedited by repository rule (`AGENTS.project.md`: "Do not rewrite `src/lib/auth/server.ts`"). None of the lines below is in the code. Each needs the operator's explicit go-ahead before anyone applies it, and each can be taken alone, except that the database storage comes with the `"/get-session": false` rule.

```diff
-  session: { cookieCache: { enabled: true, maxAge: 300 } },
+  session: {
+    expiresIn: 60 * 60 * 24 * 7, // seven days, Better Auth's default made explicit
+    updateAge: 60 * 60 * 24,
+    cookieCache: { enabled: true, maxAge: 300 },
+  },
   rateLimit: {
+    storage: "database",
+    modelName: "authRateLimit",
     customRules: {
       "/sign-in/email": { window: 60, max: 5 },
       "/sign-up/email": { window: 60, max: 5 },
+      "/get-session": false,
     },
   },
+  user: { changeEmail: { enabled: true } },
   plugins: [
     ...(grokOAuthPlugin ? [grokOAuthPlugin] : []),
     bearer(),
+    twoFactor({ issuer: "Precog", allowPasswordless: true }),
     tanstackStartCookies(),
   ],
```

What each line does:

- `session.expiresIn` and `updateAge`: write down the session length Precog already has (Better Auth's defaults: seven days from the last refresh, refreshed when a session last refreshed more than a day ago is used), so a later change is a visible edit. Nothing changes for a user.
- `rateLimit.storage: "database"` and `modelName: "authRateLimit"`: the limit of five email sign-ins or sign-ups a minute from one address counts in Postgres instead of in each serverless instance's memory, so it holds across instances. Better Auth runs its limiter in production only, but there on every `/api/auth` request, not only on those two paths: a path with no rule of its own is limited to 100 requests in 10 seconds per address (Better Auth's defaults). With database storage every limited request therefore reads and writes one `"authRateLimit"` row, the client's frequent `/get-session` included, which the cookie cache otherwise answers without the database.
- `"/get-session": false`: takes the session check out of the limiter (Better Auth skips a path whose rule is `false`), so it stays off the database as today; it also drops the in-memory limit of 100 checks in 10 seconds per address that path has now. Every other auth request (sign-in and sign-up, sign-out, the Google and X callback, the Sessions dialog's list and sign-outs) still costs at least one read and one write. Take this line with the database storage, never the storage without it; alone it changes only that in-memory limit.
- `user.changeEmail`: lets an account change its sign-in address through Better Auth's change-email flow, which confirms by email. It needs a screen for it, and a decision on how a firm's invitations, the client invitations and the digest follow the new address.
- `twoFactor(…)`: optional two-step sign-in with an authenticator app (TOTP) and one-time recovery codes (Better Auth's `backupCodes`), for Google and X accounts too (`allowPasswordless`); Better Auth stores the secret and the codes encrypted under `BETTER_AUTH_SECRET`. It needs `twoFactorClient` in `src/lib/auth/client.ts`, a `/login/two-factor` page for the code, a Security dialog to turn it on, and a test of the live-preview sign-in popup with a two-step account. `tanstackStartCookies()` stays last.

The tables they need, as one add-only migration with Better Auth's names quoted as in `migrations/0001_auth.sql` (the names come from Better Auth's `get-tables.mjs` and the two-factor plugin's `schema.mjs`; confirm them against `npx @better-auth/cli generate` before applying):

```sql
-- twoFactor(): the account's switch, its secret and its recovery codes.
alter table "user" add column if not exists "twoFactorEnabled" boolean not null default false;
create table if not exists "twoFactor" (
  "id" text not null primary key,
  "secret" text not null,
  "backupCodes" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "verified" boolean not null default true,
  "failedVerificationCount" integer not null default 0,
  "lockedUntil" timestamptz
);
create index if not exists "twoFactor_userId_idx" on "twoFactor" ("userId");
create index if not exists "twoFactor_secret_idx" on "twoFactor" ("secret");
-- rateLimit.storage "database": one counter per limited path and address.
create table if not exists "authRateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);
```

## Who processes your data

The same list as the Privacy page, which is authoritative:

| Processor                                                                         | What for                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------- |
| Vercel                                                                            | Hosting                                      |
| Neon                                                                              | Database                                     |
| The operator named in `AUTH_BROKER_OPERATOR` (`src/lib/precog/legal/operator.ts`) | Google and X sign-in through the auth broker |
| Google, X                                                                         | Sign-in providers                            |
| Resend                                                                            | Email                                        |
| Stripe                                                                            | Payment                                      |
| xAI                                                                               | Model calls                                  |
| Intuit                                                                            | QuickBooks, only when a firm connects it     |
| Sentry or the error relay Precog's operator sets                                  | Error reports, without prompt text           |
