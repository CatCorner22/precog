# Operations (deploy and integrations)

See also [UPGRADE_2026.md](./UPGRADE_2026.md) for the 2026 upgrade checklist and [SECURITY.md](./SECURITY.md) for what Precog does to protect data and who processes it.

Bracketed values such as `[NEON PITR DAYS]` in this file are facts the owner fills in. The production build gate in `scripts/migrate.mjs` checks the operator placeholders in the code, not the placeholders in this document; the checklist at the end lists them.

## Database

- Apply migrations in order under `migrations/` before enabling control evidence in production.
- Migration `0026_control_execution_log.sql` is required for the control evidence log and the monthly-review bridge.
- Migration `0048_firm_audit_log.sql` adds two guards that apply to every connection, the Neon SQL editor's included; they stop mistakes, not someone who means to change the rows. The firm activity log (`firm_audit_log`) refuses an `update` or `delete` ("firm_audit_log is append-only") unless the transaction first ran `select set_config('precog.audit_bypass', 'on', true)`; Precog's code does that only in the account deletion, the retention purge and the firm ownership transfer. The bypass is a custom setting that any connection can set. A locked report version refuses an update to what it printed ("a locked report version keeps what it printed"), with no bypass; a `delete` of the version, or of its business, is not refused. To delete log rows by hand for a data request, run the bypass and the `delete` in one transaction and note the request; the setting ends with the transaction.

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
| `STRIPE_*`                     | Firm billing when enabled, with a price id per tier and interval (see Stripe)                           |
| `PRECOG_OPERATOR_IDS`          | User ids of Precog's operators, comma-separated; only they open `/operator` (see Operator)              |
| QuickBooks                     | Intuit app credentials for read-only sync                                                               |
| `XAI_API_KEY`                  | Optional server-side AI features                                                                        |
| `LLM_DAILY_PER_USER_PAID`      | Daily model calls per account on the Firm plan or an Assessment inside its window (default 400)         |
| `LLM_DAILY_FREE_POOL`          | Daily model calls every free account together may spend of the global ceiling (default 500 of 1500)     |
| `SENTRY_DSN`                   | Error tracker (see Monitoring)                                                                          |
| `ERROR_REPORT_URL`             | Error webhook when Sentry is not used                                                                   |

## Health

`GET /api/health` includes `controlEvidenceLog: true` when migration 0026 is applied, and `migrationsApplied` with the `_migrations` ledger count (null without a ledger). After a deploy, compare the count with the migration files in the release; both answers refresh every five minutes at most.

## Monitoring

- Server failures go to Sentry when `SENTRY_DSN` is set, or as a JSON POST to `ERROR_REPORT_URL` (for example a Slack or Discord relay) when only that is set. With neither, they reach only the server log, and nobody is alerted.
- A production build prints a warning when neither is set. It does not fail the build.
- Server functions, the scheduled job, the Stripe webhook, the Resend webhook, the owner email links and the procedure images all report unexpected failures. Precog does not report expected refusals (4xx).
- The scheduled run also emails firm owners about failing or lapsing QuickBooks connections (once per problem; an address that cannot be reached is reported once instead).
- Point an uptime check at `GET /api/health` and run it no more often than every 30 minutes. Each call runs one database query, so a more frequent check keeps a scale-to-zero database (Neon) awake around the clock. See "Uptime monitor" below.

## Uptime monitor

- Monitor: `[UPTIME MONITOR]` (UptimeRobot, Better Stack or an equivalent free monitor).
- Check: `GET https://<production host>/api/health` every 30 minutes, not more often (the Neon wake reason above). Expect HTTP 200 and a body containing `"ok":true`; a 503 with `"ok":false` means the database query failed.
- `HEAD /api/health` works too, for a monitor that sends HEAD.
- Alerts go to `[ALERT INBOX]`.

## Log drain

Daily call counts live in Postgres (`llm_daily_usage`, migration 0012), so the daily ceiling holds across instances, and so does one record per call (`llm_usage`, migration 0049: account, feature, model, token counts and outcome, kept 13 months; see "AI calls" under Performance baseline). Only the latency lives in the function log alone, on the `[grok] usage` line. Vercel keeps function logs for a short time, so a drain is optional: set one to keep the latency, or the lines past 13 months:

- Vercel project → Settings → Log Drains → add a drain.
- Sources: Function and Build. Format: NDJSON.
- Destination: `[LOG DRAIN DESTINATION]` (Axiom, Better Stack, Datadog or any HTTPS endpoint that accepts NDJSON).
- Retention at the destination: `[LOG RETENTION DAYS]` days.

## Cron

Digest and integration jobs are documented in route handlers under `src/routes/api/cron/`. `vercel.json` calls `/api/cron/digest` every Monday at 13:00 UTC with `CRON_SECRET` as a bearer token.

The run answers JSON. Besides each stage's outcome (`purged`, `digest`, `synced`, `quickbooksAlerts`, `shareLogs`, `activation`, `creditReversals`) and `failures` (the stages that failed; the answer is then a 500):

- `partial` and `stopped`: the digest, QuickBooks, QuickBooks-alert and credit-reversal stages each have a deadline counted from the stage's start (`CRON_STAGE_BUDGET_MS` in `src/lib/precog/cron/budget.ts`: 150, 90, 30 and 10 seconds, inside the 300-second bound). A stage that reaches it stops before its next recipient, connection, account or reversal, and `stopped` names it (`digest`, `quickbooks`, `quickbooks-alerts`, `credit-reversals`); `partial` is then `true` and the answer is still 200.
- `modelUsage.purged`: model-call records deleted for being older than 13 months; `null` when that purge failed (reported as `cron-model-usage-purge`, not in `failures`).
- `auditPurged`: activity-log rows deleted for being older than their firm's retention period (7 years when the firm's row is gone); `null` when that purge failed (reported as `cron-audit-purge`, not in `failures`).

On `partial: true` nothing is lost: each stage logs or stamps what it finished, so the next Monday's run sends and reads what this one left. To finish sooner, call the job by hand with the same bearer token (`curl -H "Authorization: Bearer $CRON_SECRET" https://<production host>/api/cron/digest`); the digest skips the items it already announced and the QuickBooks stage skips connections read in the last 28 days. When the same stage stops two weeks running, run `select count(*) from integration_connections;`: above about 40 connections the QuickBooks stages need a schedule of their own, which is deferred work.

## Function limits

`vite.config.ts` sets the Vercel function time limits in the nitro `vercel` block, and `npm run check:functions` (CI `checks`) reads them back from the built `.vc-config.json` files after every build:

- Every function: 60 seconds (`vercel.functions.maxDuration`).
- `/api/cron/digest`: 300 seconds (`vercel.functionRules`), because one invocation purges deleted businesses and old share logs, emails every reminder and re-reads every QuickBooks connection that is due.
- 300 seconds needs the Vercel Pro plan. Hobby refuses it at deploy, so on Hobby the deploy fails until the figure is lowered to 60 and the job is split.
- Regions: `FUNCTION_REGIONS` in `vite.config.ts` is `null` until the owner confirms the Neon region (see Production settings). A wrong region name makes Vercel refuse the deploy, which is why the value is a constant in the code and not a placeholder. Until it is set, `npm run check:functions` prints "[functions] no region pinned: …" and passes; it is a warning, not a failure.
- Pooled host: in production (`VERCEL_ENV=production`), `src/lib/db.ts` refuses a `DATABASE_URL` on Neon's direct host (a `neon.tech` host whose name lacks `-pooler`), so every request that needs the database fails with "DATABASE_URL points at Neon's direct host in production. Use the pooled host (its name ends in -pooler) and redeploy." The production build warns about the same host first (`scripts/migrate.mjs`), so read the build log's warnings before promoting a deploy. A Postgres host outside Neon is not checked.

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
- Subscribe the webhook endpoint (`https://<BETTER_AUTH_URL host>/api/stripe/webhook`, signed with `STRIPE_WEBHOOK_SECRET`) to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created` and `charge.dispute.closed`.
- Dunning: in Stripe → Settings → Subscriptions and emails, set Smart Retries on, the retry period to 14 days, and "cancel the subscription" as the action after the last failed retry. Precog shows a banner on the home and Firm pages and emails the firm owner once when the subscription goes past due, keeps the paid surface open for 14 days from the first failure, and closes it after; the Monthly review and existing locked versions never close. Keep Stripe's retry period at 14 days so its cancellation and Precog's close coincide; Stripe's cancellation for a failed payment keeps the "closed because the payment failed" notice, a cancellation the firm asks for does not.
- Prices and tiers: the Firm plan sells three tiers by client businesses, Starter (up to 5), Practice (up to 20) and Firm (up to 50), each monthly (`STRIPE_PRICE_TIER_1`, `STRIPE_PRICE_TIER_2`, `STRIPE_PRICE_TIER_3`) and yearly at ten months' price (`STRIPE_PRICE_TIER_1_ANNUAL`, `STRIPE_PRICE_TIER_2_ANNUAL`, `STRIPE_PRICE_TIER_3_ANNUAL`). A price with no id is not offered (the tier, or its yearly price), and the build warns while either set of three is half filled. `STRIPE_PRICE_MONTHLY` keeps working: while `STRIPE_PRICE_TIER_1` is unset, Starter monthly sells on it; once `STRIPE_PRICE_TIER_1` is a different price, Checkout sells that one and every subscription still on `STRIPE_PRICE_MONTHLY` keeps 50 client businesses until its price changes in Stripe. A running subscription whose price Precog has not seen yet (`billing_accounts.subscription_price_id` is null until the next subscription event) also keeps 50.
- Payment methods: Checkout offers card and US bank account on both the Assessment and the Firm plan. Turn on ACH Direct Debit in Stripe → Settings → Payment methods, or Checkout fails. An Assessment paid by bank opens nothing until Stripe confirms the payment (`checkout.session.async_payment_succeeded`); a Firm plan bank payment that later fails goes through dunning like a declined card.
- Billing Portal: in Stripe → Settings → Billing → Customer portal, allow customers to switch plans and list each tier's product with both its monthly and yearly price. "Move up a tier in Manage billing", which Precog shows at a Starter or Practice limit, works only then.
- Checkout: a firm has at most one open subscription Checkout. Asking again for the same tier and interval hands back the open session; asking for another expires the firm's other open subscription sessions first. The Checkout idempotency key carries the hour, so a session Stripe expired (after 24 hours, or by this rule) is never handed back, and Precog needs no `checkout.session.expired` event.
- A second subscription: two subscription Checkouts completed in the same moment (two tiers asked for at once) leave Stripe charging both while Precog keeps the first. The webhook reports it once, on the second Checkout's completion, as `billing-second-subscription` with "second subscription sub_… beside sub_… for account …". Cancel the newer subscription in Stripe and refund its payment.
- "Names no account" reports: the webhook answers 500, and the error tracker records `stripe-webhook` with "Stripe subscription … names no account (customer cus_…)" or "Stripe event … names no account (customer cus_…)", when a paid Checkout or a running subscription cannot be tied to a Precog account. Stripe retries each delivery for up to 3 days.
  - A subscription report is expected right after you create a net-30 or hand-marked subscription in Stripe, because the customer is not linked yet. It stops once you link the customer (`npm run link:stripe-customer -- <email> <cus_…> --yes`, or Link a Stripe customer on `/operator`; see "Link a Stripe customer" below); Stripe's next retry then applies, and an event Stripe sent before the link never overwrites the state the link applied. Link within 3 days, or Stripe stops retrying.
  - A Checkout report is a payment Precog did not start (for example a Payment Link or a dashboard Checkout). Look it up in Stripe, then refund it or attribute it by hand. Its retries never succeed, because a Checkout's account comes only from the Checkout itself.
  - A cancellation for a customer no account holds is not reported; it answers 200 as "ignored".
- Assessment disputes: while a dispute is open the paid tools stay open (the chargeback can still be won); a lost dispute counts as a refund and closes them until a new payment. The firm cannot change owner while a payment is disputed — the transfer refuses until the dispute clears.
- Assessment-credit reversals retry inline, then weekly: the refund's transaction stamps `assessment_credit_reversal_pending_at` and keeps the posted amount; Stripe's confirmation zeroes the amount and clears the stamp. When the webhook cannot reach Stripe, it also stamps `assessment_credit_reversal_failed_at`; when it dies before Stripe answers, the row stays pending. The scheduled run's `credit-reversals` stage takes each failed row, and each row pending for more than an hour, reads the customer's balance transactions for one whose metadata `reversal_for` is `<user id>:<Assessment paid-at time>`, and posts the reversal only when none is there (`alreadyPosted` counts the rows it only cleared). Rows still listed after a run need a look in the Stripe dashboard (the customer balance transaction with that `reversal_for` metadata):

```sql
select user_id, stripe_customer_id, assessment_credit_cents,
  assessment_credit_reversal_pending_at, assessment_credit_reversal_failed_at
from billing_accounts
where (assessment_credit_reversal_failed_at is not null
    or assessment_credit_reversal_pending_at < now() - interval '1 hour')
  and coalesce(assessment_credit_cents, 0) > 0;
```

### Link a Stripe customer

A firm that pays by invoice (net 30), or one marked "monthly" by hand before Stripe was connected, never passes through Checkout, so Precog does not know its Stripe customer until you link it:

1. In Stripe, create the customer and a subscription on the tier's price with "Email invoice to the customer" (`collection_method=send_invoice`) and 30 days to pay.
2. Run `npm run link:stripe-customer -- <email or user id> <cus_…>` with `DATABASE_URL` and `STRIPE_SECRET_KEY` (and the `STRIPE_PRICE_TIER_*` ids, to name the tier) set in the shell. Without `--yes` it prints the account, the customer and the plan the account will have, and writes nothing.
3. Run it again with `--yes`. It stores the customer, applies the subscription as the webhook would, and names the account on the Stripe customer. Link a Stripe customer on `/operator` does the same from the browser (see Operator).

Linking ends the hand-marked exception for that firm (`HAND_MARKED_PLANS_UNTIL`): the plan now follows the subscription. Precog refuses a customer another account holds, an account that already holds another customer (unless `--replace`, or Replace ticked on `/operator`), the account of a firm member who is not the firm owner (link the firm owner's account), and a customer with no running (`active`, `trialing` or `past_due`) subscription: create the subscription in Stripe first, then link. Replace also links a customer with no running subscription, except on an account marked by hand, so a refused link never ends a hand-marked plan. Replace is also refused, by the script and on `/operator` alike, while the account's own subscription still runs and the new customer's does not ("This account's subscription sub_… is still running. Cancel it in Stripe, then link."), so a stopped subscription never goes over a running one; cancel the old subscription in Stripe first, then link.

## Resend

- In Resend → Webhooks, add the endpoint `https://<BETTER_AUTH_URL host>/api/resend/webhook` subscribed to `email.bounced` and `email.complained`, and set its signing secret (starts with `whsec_`) as `RESEND_WEBHOOK_SECRET`. A hard bounce or a complaint puts the address in `email_suppressions` (migration 0038), and the weekly digest and the owner notes skip it from the next run. A Transient bounce (a full mailbox) stops nothing. Without the secret the endpoint answers 404 and a bouncing address keeps being emailed every week.

## Activation counts

Migration `0042_product_events.sql` keeps one row per account and milestone in `product_events` (the first business set up, the first locked report version, the first report marked sent, the first monthly review recorded): two ids and a time, no names and no text, deleted with the account. The weekly run's JSON answer carries the seven days' counts under the key `activation` (`signedUp`, `firstBusiness`, `firstLockedVersion`, `firstReportSent`, `firstMonthlyReview`); `/api/health` never does. For one account, open `/operator` and find it by its address: the lookup lists its milestones. For the last eight weeks, run "Accounts that set up a first business, by week (last 8 weeks)" under Standing counts on `/operator`: one row per week with its sign-ups and each milestone. Three views in the Neon SQL editor give the longer series:

- `product_activation_weekly`: accounts per week and milestone.
- `product_signups_weekly`: accounts created per week, from `"user"."createdAt"` (no write).
- `product_retained_reviewers`: accounts that recorded a monthly review in both this month and the one before.

Precog runs no analytics script in the browser; these counts are the only product telemetry.

## Operator

`/operator` is the support page of Precog's operator (not a firm or business owner).

- Who: the user ids in `PRECOG_OPERATOR_IDS`, comma-separated, read on the server only. Unset means nobody. Sign in with Google or a confirmed email-and-password account, then read the id in the Neon SQL editor: `select id, email from "user" where lower(email) = lower('<address>');`.
- Anyone else, signed in or out, sees Precog's not-found text, and every operator server function answers 404, so the page reveals nothing about itself.
- Find an account: by its exact email address (sent in a POST body, so the address never sits in a URL or a request log; no listing, no partial match). It shows whether the address is confirmed, the sign-in providers, the day the account was created, the plan as the Firm page names it (tier, client limit, and the day it ends or closes), the firm and role, live and deleted businesses, the subscription and the Stripe customer, the last weekly digest, an email suppression, the last QuickBooks failure, today's model calls against the plan's limit, and the account's milestones.
- Link a Stripe customer: the checks of `npm run link:stripe-customer` (see "Link a Stripe customer" under Stripe), the same refusals in the same words, including Replace onto a customer whose subscription is not running while the account's own subscription still runs ("This account's subscription sub_… is still running. Cancel it in Stripe, then link."). Without Stripe configured it refuses ("Billing is not connected on this deployment").
- Lift today's cap: deletes today's model-call count for one account, so it can call the model again today.
- Standing counts: one read-only query per button: "Running subscriptions and their live clients", "Firms marked monthly by hand with no billing row", "X-only accounts with the digest on", "Google accounts without a confirmed address and the digest on", "Google accounts with the digest on", "Firm plans past due", "QuickBooks connections failing or lapsing within 30 days", "Firms with more than one member", "Deleted firm clients the retention rule now keeps", "Running subscriptions with no stored price yet", "Picture storage" (the size of `procedure_images`; past 5 GB, moving pictures to object storage, which is deferred work, is due) and "Accounts that set up a first business, by week (last 8 weeks)" (see Activation counts).
- The record: on a firm's account, each lookup, link and cap lift writes an `operator_lookup`, `operator_linked_stripe` or `operator_lifted_cap` row to that firm's activity log, with the operator as the actor, in the same transaction as the change. Every action, solo accounts and counts included, also prints `[operator] <action> <target> by <operator id>` in the function log.

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
- **AI calls:** every model call writes one `llm_usage` row (migration 0049: the account, feature, model, prompt and completion tokens, outcome and time; no text), kept 13 months and deleted with the account, and that table is the record. The view `llm_usage_daily` sums calls and tokens per day, feature and model: `select * from llm_usage_daily where day >= current_date - 30 order by day desc, calls desc;` in the Neon SQL editor. The call also logs one `[grok] usage {...}` line with the same counts plus total tokens and latency in milliseconds, and the outcome (`ok`, `empty`, `timeout`, `error` or `http_<status>`). The line holds no prompt text and no key; search the Vercel function logs for `[grok] usage` for latency, and keep them through the log drain only if you want them past Vercel's own retention.

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
- [ ] `FUNCTION_REGIONS` in `vite.config.ts` equals the Neon region `[NEON REGION]` (`check:functions` warns until it is set).
- [ ] `VITE_PUBLIC_HOSTNAME` is the production host (share previews).
- [ ] `public/` reaches the build output (`robots.txt` and `og.svg` answer on the production host).
- [ ] Vercel Firewall rules rate-limit `/api/auth/*` and the server-function path; the in-process limiters are cost control only.
- [ ] Log drain is set (Log drain above).
- [ ] Uptime monitor is set (Uptime monitor above).
- [ ] The build log's warning list from `scripts/migrate.mjs` has been read and each warning is intended.

Database

- [ ] `DATABASE_URL` is the pooled host (`-pooler`); production refuses Neon's direct host (Function limits).
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
- [ ] `PRECOG_OPERATOR_IDS` holds the operator's user id (Operator above).

Scheduled job and email

- [ ] `CRON_SECRET` is set (without it every weekly run is refused).
- [ ] `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_REPLY_TO` are set, and the sending domain has SPF, DKIM and DMARC records.
- [ ] The Resend bounce and complaint webhook is added (see Resend above), with its secret in `RESEND_WEBHOOK_SECRET`.

Billing

- [ ] `STRIPE_PRICE_ASSESSMENT` is the $1,000 one-off price and `STRIPE_PRICE_MONTHLY` the $299 monthly price in the Stripe account the secret key belongs to.
- [ ] The six tier prices are set: `STRIPE_PRICE_TIER_1`, `STRIPE_PRICE_TIER_2` and `STRIPE_PRICE_TIER_3` monthly, and their `_ANNUAL` prices at ten months' price (Stripe above).
- [ ] The Billing Portal lists every tier product with both intervals, so "Move up a tier in Manage billing" works (Stripe above).
- [ ] ACH Direct Debit is on in Stripe → Settings → Payment methods.
- [ ] The webhook endpoint is subscribed to the nine events listed under Stripe, with its signing secret in `STRIPE_WEBHOOK_SECRET`.
- [ ] Stripe Tax is active with a registration per state.
- [ ] Dunning retries and the after-retry action are set (Stripe above).
- [ ] `ENTITLEMENTS_FROM` in `src/lib/precog/firm/entitlements.ts` is the first production deploy date (an Assessment paid before it counts its 90 days from that date).
- [ ] `HAND_MARKED_PLANS_UNTIL` in the same file: firms marked monthly by hand with no billing row turn free after it; link each with `npm run link:stripe-customer -- <email> <cus_id>` or Link a Stripe customer on /operator before then (Link a Stripe customer above).
- [ ] The statement descriptor reads as the firm expects on its card statement.

QuickBooks

- [ ] `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET` and `INTEGRATION_KEY` are set and `QBO_ENVIRONMENT=production`; the Intuit app has passed Intuit's production review.

Model

- [ ] `XAI_API_KEY` is set, the vendor-side monthly cap is `[XAI MONTHLY CAP]` and the prices used for the cost estimate are `[XAI PRICES]`.
- [ ] xAI's retention terms for API data have been read and `XAI_API_DATA_POLICY_URL` points at them.

Error reporting

- [ ] `SENTRY_DSN` or `ERROR_REPORT_URL` is set and a named person receives the alerts.
