# Operations (deploy and integrations)

See also [UPGRADE_2026.md](./UPGRADE_2026.md) for the 2026 upgrade checklist and [SECURITY.md](./SECURITY.md) for what Precog does to protect data and who processes it.

Bracketed values such as `[NEON PITR DAYS]` in this file are facts the owner fills in. The production build gate in `scripts/migrate.mjs` checks the operator placeholders in the code, not the placeholders in this document; the checklist at the end lists them.

## Database

- Apply migrations in order under `migrations/` before enabling control evidence in production.
- Migration `0026_control_execution_log.sql` is required for the control evidence log and the monthly-review bridge.

## Environment (injected on deploy — do not commit `.env`)

`.env.example` names every variable with its comment; this table is the short list.

| Variable                       | Purpose                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | Neon Postgres                                                                                           |
| Better Auth / OAuth            | Per-app credentials from project settings                                                               |
| `SUPPORT_EMAIL`                | Support mailbox; baked at build; production refuses without it or with an operator placeholder          |
| `CRON_SECRET`                  | Bearer token Vercel sends to `/api/cron/digest`; without it the weekly job is refused                   |
| `RESEND_API_KEY`, `EMAIL_FROM` | Reminder, digest, confirmation and invitation email through Resend; without both, Precog sends no email |
| `RESEND_WEBHOOK_SECRET`        | Resend bounce and complaint signing secret; without it a bouncing address keeps being emailed           |
| `STRIPE_*`                     | Firm billing when enabled                                                                               |
| QuickBooks                     | Intuit app credentials for read-only sync                                                               |
| `XAI_API_KEY`                  | Optional server-side AI features                                                                        |
| `SENTRY_DSN`                   | Error tracker (see Monitoring)                                                                          |
| `ERROR_REPORT_URL`             | Error webhook when Sentry is not used                                                                   |

## Health

`GET /api/health` includes `controlEvidenceLog: true` when migration 0026 is applied.

## Monitoring

- Server failures go to Sentry when `SENTRY_DSN` is set, or as a JSON POST to `ERROR_REPORT_URL` (for example a Slack or Discord relay) when only that is set. With neither, they reach only the server log, and nobody is alerted.
- A production build prints a warning when neither is set. It does not fail the build.
- Server functions, the scheduled job, the Stripe webhook, the Resend webhook, the owner email links and the procedure images all report unexpected failures. Precog does not report expected refusals (4xx).
- Point an uptime check at `GET /api/health` and run it no more often than every 30 minutes. Each call runs one database query, so a more frequent check keeps a scale-to-zero database (Neon) awake around the clock. See "Uptime monitor" below.

## Uptime monitor

- Monitor: `[UPTIME MONITOR]` (UptimeRobot, Better Stack or an equivalent free monitor).
- Check: `GET https://<production host>/api/health` every 30 minutes, not more often (the Neon wake reason above). Expect HTTP 200 and a body containing `"ok":true`; a 503 with `"ok":false` means the database query failed.
- `HEAD /api/health` works too, for a monitor that sends HEAD.
- Alerts go to `[ALERT INBOX]`.

## Log drain

Until model usage is stored in the database (batch 3), the only record of what the model calls cost is the `[grok] usage` line in the function log (see "AI calls" under Performance baseline). Vercel keeps function logs for a short time, so drain them:

- Vercel project → Settings → Log Drains → add a drain.
- Sources: Function and Build. Format: NDJSON.
- Destination: `[LOG DRAIN DESTINATION]` (Axiom, Better Stack, Datadog or any HTTPS endpoint that accepts NDJSON).
- Retention at the destination: `[LOG RETENTION DAYS]` days.

## Cron

Digest and integration jobs are documented in route handlers under `src/routes/api/cron/`. `vercel.json` calls `/api/cron/digest` every Monday at 13:00 UTC with `CRON_SECRET` as a bearer token.

## Function limits

`vite.config.ts` sets the Vercel function time limits in the nitro `vercel` block, and `npm run check:functions` (CI `checks`) reads them back from the built `.vc-config.json` files after every build:

- Every function: 60 seconds (`vercel.functions.maxDuration`).
- `/api/cron/digest`: 300 seconds (`vercel.functionRules`), because one invocation purges deleted businesses and old share logs, emails every reminder and re-reads every QuickBooks connection that is due.
- 300 seconds needs the Vercel Pro plan. Hobby refuses it at deploy, so on Hobby the deploy fails until the figure is lowered to 60 and the job is split.
- Regions: `FUNCTION_REGIONS` in `vite.config.ts` is `null` until the owner confirms the Neon region (see Production settings). A wrong region name makes Vercel refuse the deploy, which is why the value is a constant in the code and not a placeholder.

## Backup and recovery

What there is to back up:

- One Neon database holds everything Precog stores: accounts, businesses and their history, firm records, report versions, the evidence log, shares, QuickBooks tokens and readings, and the procedure pictures (stored in the database, not in object storage).
- Stripe holds its own customer, invoice and tax records; the auth broker holds its own sign-in records. Precog does not back those up and cannot restore them.

Mechanism: Neon point-in-time restore from the write-ahead log. Window: `[NEON PITR DAYS]` days (set in the Neon project settings; the Neon plan sets the ceiling). Recovery point objective: seconds (any timestamp inside the window). Recovery time objective: `[RTO]`, to be replaced by the figure the first drill measures.

Restore procedure:

1. In the Neon console, restore the branch to the timestamp just before the damage (Neon creates a new branch from that point and keeps the old one).
2. Point `DATABASE_URL` in the Vercel project settings at the restored branch's pooled host (the one whose name ends in `-pooler`).
3. Redeploy, so every function reads the new value.
4. Run `npm run db:migrate` against the restored database. It is a no-op when the migration ledger already matches the code; it applies the missing files when the restore point predates a migration.
5. Check `GET /api/health` returns 200 with `"ok":true`, then sign in and open a business.

If the point-in-time window is under seven days, add a nightly `pg_dump` of the database to object storage with its own retention; nothing in the repository does this today.

Drill record (one row per drill; the first drill sets `[RTO]`):

| Date | Who | Restore point | Time to restore | Outcome |
| ---- | --- | ------------- | --------------- | ------- |
|      |     |               |                 |         |

## Stripe

- Activate Stripe Tax in the Stripe dashboard and add a tax registration for each state where Precog collects. Every Checkout collects the billing address and tax id and applies Stripe Tax, so without an active Stripe Tax account Checkout fails with Stripe's automatic-tax error.
- Subscribe the webhook endpoint (`https://<BETTER_AUTH_URL host>/api/stripe/webhook`, signed with `STRIPE_WEBHOOK_SECRET`) to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created` and `charge.dispute.closed`.
- Dunning: in Stripe → Settings → Subscriptions and emails, set Smart Retries on, the retry period to 14 days, and "cancel the subscription" as the action after the last failed retry. Precog closes the paid tools while Stripe reports `past_due` (`commercialToolsOpen` in `src/lib/precog/firm/billing-store.ts`) and shows the status on the Firm page; the in-product warning and email during the retry period are a later batch.

## Resend

- In Resend → Webhooks, add the endpoint `https://<BETTER_AUTH_URL host>/api/resend/webhook` subscribed to `email.bounced` and `email.complained`, and set its signing secret (starts with `whsec_`) as `RESEND_WEBHOOK_SECRET`. A hard bounce or a complaint puts the address in `email_suppressions` (migration 0038), and the weekly digest and the owner notes skip it from the next run. A Transient bounce (a full mailbox) stops nothing. Without the secret the endpoint answers 404 and a bouncing address keeps being emailed every week.

## Release tags

A successful Production deploy is tagged `deploy-<utc time>-<12-char sha>` by `.github/workflows/tag-deploy.yml`, for example `deploy-20261003-141500-dd10113abcde`. The 12-character suffix is the release id in error reports (`VITE_RELEASE` in the browser, `release` in Sentry), so a report maps to its tag with:

```sh
git tag -l "deploy-*-<release>"
```

If no tag appears after a production deploy: open the repository's Actions tab, workflow "Tag production deploy". A run whose job was skipped means the GitHub Deployment was not named `Production` (the workflow matches `github.event.deployment.environment == 'Production'`; check the environment name in the Vercel Git integration). No run at all means the Vercel GitHub integration is not creating Deployments. A failed run means the `GITHUB_TOKEN` cannot push tags (a tag protection ruleset blocks it).

## Performance baseline (2 October 2026)

Measured on 2 October 2026 against the compiled build, before (`main` at c679abc) and after public pages stopped loading the business engine. Compare a later measurement against these numbers before and after a speed change.

### JavaScript each page downloads on first load

Gzipped, signed out, from `npm run perf:first-load`. The budget is the measured size after the change plus 10 percent, rounded up to the next KB; `PAGE_BUDGETS_KB` in `scripts/perf-first-load.mjs` holds the budgets.

| Page       | Before (KB)  | After (KB) | Budget (KB) |
| ---------- | ------------ | ---------- | ----------- |
| `/`        | 406.0        | 381.9      | 421         |
| `/login`   | 321.2        | 150.9      | 167         |
| `/privacy` | 321.7        | 140.0      | 154         |
| `/terms`   | not measured | 138.1      | 152         |
| `/share/x` | not measured | 145.5      | 161         |

### Whole bundle

From `npm run check:bundle` after `npm run build`: 99 chunks, 782.9 KB gzipped in total (budget 790 KB); the largest chunk is the 107.3 KB entry (budget 118 KB). Before the change: 80 chunks, 774.3 KB, with a 261.6 KB entry. The total rose because the same code sits in more, smaller chunks; what each page downloads fell.

### Register engines

From `npm run bench`, median of 3 runs on a development container. The sizes are 25, 50 and 100 percent of the largest business Precog accepts (`LIST_LIMITS` in `src/lib/precog/profile-entries.ts`).

| Size                       | People | Register items | Relations | Coverage (ms) | Weekly plan (ms) |
| -------------------------- | ------ | -------------- | --------- | ------------- | ---------------- |
| Dental sample              | 6      | 8              | 15        | 0.1           | 2.8              |
| Setup cap (`OWN_TEAM_MAX`) | 60     | 300            | 1,200     | 9.6           | 15.4             |
| 25% of limits              | 250    | 500            | 5,000     | 42.2          | 26.8             |
| 50% of limits              | 500    | 1,000          | 10,000    | 166.4         | 68.6             |
| 100% of limits             | 1,000  | 2,000          | 20,000    | 435.0         | 230.0            |

### How to measure

- **First load:** run `npm run build`, serve the compiled build (CI runs `node scripts/serve-built-test.mjs`), then run `npm run perf:first-load -- http://localhost:8080`. It prints a table and a JSON line and exits 1 naming each page over budget. CI runs it in the "Authenticated compiled-server safety" job.
- **Register engines:** run `npm run bench`. It prints a table and a JSON line. It is not part of CI, because shared runners time too unevenly to fail on.
- **AI calls:** every model call logs one `[grok] usage {...}` line with the feature, model, prompt, completion and total tokens, latency in milliseconds and outcome (`ok`, `empty`, `timeout`, `error` or `http_<status>`). The line holds no prompt text and no key. Search the Vercel function logs for `[grok] usage` to add up tokens per feature or per day.

### Production facts the owner checks

- The Vercel function region equals the Neon database region. If they differ, set `FUNCTION_REGIONS` in `vite.config.ts` to the Neon region.
- `DATABASE_URL` uses the pooled host, the one whose name ends in `-pooler`.
- Business profile and history sizes, read-only, in the Neon SQL editor:

```sql
select count(*), avg(pg_column_size(profile)), max(pg_column_size(profile)) from businesses;
select count(*), avg(pg_column_size(profile)), max(pg_column_size(profile)) from business_history;
select pg_size_pretty(pg_total_relation_size('business_history')),
       pg_size_pretty(pg_total_relation_size('procedure_images'));
```

## Production settings checklist

Tick each line before the first production deploy and after each change to the setting. The bracketed values in this file are not checked by the build; `scripts/migrate.mjs` checks only `SUPPORT_EMAIL` and the operator placeholders in `src/lib/precog/legal/operator.ts`. Two lines are answered from the repository and need no action.

Hosting

- [ ] Vercel plan is Pro, so the 300-second `maxDuration` on `/api/cron/digest` deploys (Function limits).
- [ ] `FUNCTION_REGIONS` in `vite.config.ts` equals the Neon region `[NEON REGION]`.
- [ ] `VITE_PUBLIC_HOSTNAME` is the production host (share previews).
- [ ] Vercel Firewall rules rate-limit `/api/auth/*` and the server-function path; the in-process limiters are cost control only.
- [ ] Log drain is set (Log drain above).
- [ ] Uptime monitor is set (Uptime monitor above).
- [ ] The build log's warning list from `scripts/migrate.mjs` has been read and each warning is intended.

Database

- [ ] `DATABASE_URL` is the pooled host (`-pooler`).
- [ ] Neon plan and point-in-time window `[NEON PITR DAYS]` are known, and one restore drill is recorded (Backup and recovery).
- [ ] The three size queries above and `select count(*) from integration_connections;` have been run once and the figures noted.
- [x] A share dies with its account: `map_shares.user_id` references `"user"` with `on delete cascade` (`migrations/0004_map_shares.sql`).
- [x] Disconnecting QuickBooks deletes the readings: `deleteConnection` in `src/lib/precog/integrations/qbo/store.ts` deletes `integration_connections` and `integration_snapshots` in one transaction.

Sign-in

- [ ] `BETTER_AUTH_URL` is the https production address and `BETTER_AUTH_SECRET` has 32 or more characters (the production build refuses otherwise).
- [ ] `GROK_AUTH_CLIENT_ID` and `GROK_AUTH_CLIENT_SECRET` are the production broker client (the build warns when Google and X sign-in lack them).

Support and legal

- [ ] `SUPPORT_EMAIL` is set and the mailbox is read.
- [ ] `OPERATOR_LEGAL_NAME`, `OPERATOR_ADDRESS` and `GOVERNING_LAW` in `src/lib/precog/legal/operator.ts` hold the real values (the production build refuses while a bracketed placeholder remains); `AUTH_BROKER_OPERATOR` and `XAI_API_DATA_POLICY_URL` too.
- [ ] A trademark search on "Precog" has been done.

Scheduled job and email

- [ ] `CRON_SECRET` is set (without it every weekly run is refused).
- [ ] `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_REPLY_TO` are set, and the sending domain has SPF, DKIM and DMARC records.
- [ ] The Resend bounce and complaint webhook is added (see Resend above), with its secret in `RESEND_WEBHOOK_SECRET`.

Billing

- [ ] `STRIPE_PRICE_ASSESSMENT` is the $1,000 one-off price and `STRIPE_PRICE_MONTHLY` the $299 monthly price in the Stripe account the secret key belongs to.
- [ ] The webhook endpoint is subscribed to the eight events listed under Stripe, with its signing secret in `STRIPE_WEBHOOK_SECRET`.
- [ ] Stripe Tax is active with a registration per state.
- [ ] Dunning retries and the after-retry action are set (Stripe above).
- [ ] The statement descriptor reads as the firm expects on its card statement.

QuickBooks

- [ ] `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET` and `INTEGRATION_KEY` are set and `QBO_ENVIRONMENT=production`; the Intuit app has passed Intuit's production review.

Model

- [ ] `XAI_API_KEY` is set, the vendor-side monthly cap is `[XAI MONTHLY CAP]` and the prices used for the cost estimate are `[XAI PRICES]`.
- [ ] xAI's retention terms for API data have been read and `XAI_API_DATA_POLICY_URL` points at them.

Error reporting

- [ ] `SENTRY_DSN` or `ERROR_REPORT_URL` is set and a named person receives the alerts.
