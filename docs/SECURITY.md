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
- There is no multi-factor sign-in today.
- The email links (owner reminder consent and stop links, password reset, confirmation) carry long random tokens; a link that does not match one answers a plain "no longer works" page and reveals nothing about the account.

## Authorization

- Every server function that reads or writes account data runs behind `authMiddleware` (`src/lib/auth/middleware.ts`), which resolves the user from the same-origin session and throws when signed out; a client-sent id is never trusted.
- Every query is scoped by that user id, or by the firm the user belongs to for a firm's client businesses (`src/lib/precog/business-store.ts`, `src/lib/precog/firm/store.ts`). Firm roles (owner, preparer, reviewer) decide who records review conclusions; the recording account cannot review its own work.
- The routes that reach stored data without a session each carry their own proof: the shared map page by its share token (with an optional passcode), the owner email links by their token, the Stripe webhook by Stripe's signature, the QuickBooks callback by a state signed under `INTEGRATION_KEY`, and the scheduled job by `CRON_SECRET`. `GET /api/health` runs one query and returns no data.

## Secrets and configuration

- Secrets live in environment variables only (`.env.example` names each one); none are in the code or the documentation. `scripts/deploy-config.test.mjs` fails when the code reads a variable the example file does not name.
- A production build refuses to finish without `DATABASE_URL`, a `BETTER_AUTH_SECRET` of 32 or more characters, an https `BETTER_AUTH_URL` and `SUPPORT_EMAIL`, with sign-in turned off, or while `src/lib/precog/legal/operator.ts` still holds a bracketed placeholder (`scripts/migrate.mjs`).

## Data handling

- Share passcodes are stored as salted scrypt hashes (`src/lib/precog/share/share-attempts.ts`), guesses are counted per share in the database and the link locks after ten in fifteen minutes; share view logs keep a hash of the visitor address, not the address (`src/lib/precog/share/share-server.ts`), for a fixed retention after which they are deleted.
- The model-call cap keeps a one-way hash of the network address, and the count holds no question or reply (`src/lib/precog/llm/`).
- Before notes reach the model, Precog masks anything that looks like a password, card number or code, and masks the draft that comes back (the Privacy page lists exactly what each feature sends).
- Precog does not use what you enter to train a model and sends xAI nothing for training.
- Procedure pictures are re-encoded in the browser, which drops their EXIF and GPS data, and the server then strips the remaining metadata segments (EXIF, XMP, text and time chunks) before storing them (`src/lib/precog/procedures/image-bytes.ts`).
- Deleting an account removes its rows; a deleted business is purged after a grace period by the weekly job (`docs/ACCOUNT_DATA_MODEL.md`).

## Logging and monitoring

- Server failures go to Sentry (`SENTRY_DSN`) or to a JSON webhook (`ERROR_REPORT_URL`); the report carries the release id and the route, never prompt text or a key (`src/lib/observability/`).
- Every model call logs one `[grok] usage` line with token counts and latency, and no prompt text.
- Precog runs no analytics script; activation counts come from `product_events` (ids and times only).
- `GET /api/health` runs one database query and answers `{ ok: true }` or a 503; the uptime monitor and the restore procedure both read it ([OPERATIONS.md](./OPERATIONS.md)).
- Rate limits: model calls are limited per user, per process and per network address, and capped per account per day in the database. These limits are cost and abuse control at the application level; a platform-level limit (Vercel Firewall) in front is the owner's setting.

## Backups and recovery

See [OPERATIONS.md](./OPERATIONS.md), "Backup and recovery": Neon point-in-time restore, the restore procedure and the drill record.

## Reporting a vulnerability

Write to the mailbox in the `SUPPORT_EMAIL` environment variable, which is the Support link in Precog's footer. Include the route or feature, what you did and what you saw. Precog's operator answers from that mailbox.

## Assurance

- No SOC 2 report. No HIPAA business associate agreement: Precog's Terms forbid protected health information outright.
- A standard data processing agreement is available on request from the support mailbox.
- Tests in CI pin the security headers, the server-function ids, the migration ledger and the account boundaries between two signed-in sessions (`.github/workflows/ci.yml`).

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
