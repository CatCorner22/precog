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
