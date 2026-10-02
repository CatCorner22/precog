# Operations (deploy and integrations)

See also [UPGRADE_2026.md](./UPGRADE_2026.md) for the 2026 upgrade checklist.

## Database

- Apply migrations in order under `migrations/` before enabling control evidence in production.
- Migration `0026_control_execution_log.sql` is required for the control evidence log and the monthly-review bridge.

## Environment (injected on deploy — do not commit `.env`)

| Variable            | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `DATABASE_URL`      | Neon Postgres                             |
| Better Auth / OAuth | Per-app credentials from project settings |
| `STRIPE_*`          | Firm billing when enabled                 |
| QuickBooks          | Intuit app credentials for read-only sync |
| `XAI_API_KEY`       | Optional server-side AI features          |
| `SENTRY_DSN`        | Error tracker (see Monitoring)            |
| `ERROR_REPORT_URL`  | Error webhook when Sentry is not used     |

## Health

`GET /api/health` includes `controlEvidenceLog: true` when migration 0026 is applied.

## Monitoring

- Server failures go to Sentry when `SENTRY_DSN` is set, or as a JSON POST to `ERROR_REPORT_URL` (for example a Slack or Discord relay) when only that is set. With neither, they reach only the server log, and nobody is alerted.
- A production build prints a warning when neither is set. It does not fail the build.
- Server functions, the scheduled job, the Stripe webhook, the owner email links and the procedure images all report unexpected failures. Precog does not report expected refusals (4xx).
- Point an uptime check at `GET /api/health` and run it no more often than every 30 minutes. Each call runs one database query, so a more frequent check keeps a scale-to-zero database (Neon) awake around the clock.

## Cron

Digest and integration jobs are documented in route handlers under `src/routes/api/cron/`.

## Performance baseline (2 October 2026)

Measured on `main` at c679abc. Compare a later measurement against these numbers before and after a speed change.

### JavaScript each page downloads on first load

Gzipped, signed out, from `npm run perf:first-load`. The budget is the measured size plus 10 percent, rounded up to the next KB; `PAGE_BUDGETS_KB` in `scripts/perf-first-load.mjs` holds the budgets.

| Page       | Measured (KB) | Budget (KB) |
| ---------- | ------------- | ----------- |
| `/`        | 406.0         | 447         |
| `/login`   | 321.2         | 354         |
| `/privacy` | 321.7         | 354         |
| `/terms`   | not measured  | 354         |
| `/share/x` | not measured  | 354         |

`/terms` and `/share/<token>` share the `/privacy` budget until their first measurement replaces it.

### Whole bundle

From `npm run check:bundle` after `npm run build`: 80 chunks, 774.3 KB gzipped in total (budget 775 KB); the largest chunk is the 261.6 KB entry (budget 265 KB).

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

- The Vercel function region equals the Neon database region. If they differ, set `"regions"` in `vercel.json` to the Neon region.
- `DATABASE_URL` uses the pooled host, the one whose name ends in `-pooler`.
- Business profile and history sizes, read-only, in the Neon SQL editor:

```sql
select count(*), avg(pg_column_size(profile)), max(pg_column_size(profile)) from businesses;
select count(*), avg(pg_column_size(profile)), max(pg_column_size(profile)) from business_history;
select pg_size_pretty(pg_total_relation_size('business_history')),
       pg_size_pretty(pg_total_relation_size('procedure_images'));
```
