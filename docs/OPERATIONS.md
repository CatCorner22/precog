# Operations (deploy and integrations)

See also [UPGRADE_2026.md](./UPGRADE_2026.md) for the 2026 upgrade checklist.

## Database

- Apply migrations in order under `migrations/` before enabling control evidence in production.
- Migration `0026_control_execution_log.sql` is required for the control evidence log and the monthly-review bridge.

## Environment (injected on deploy — do not commit `.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres |
| Better Auth / OAuth | Per-app credentials from project settings |
| `STRIPE_*` | Firm billing when enabled |
| QuickBooks | Intuit app credentials for read-only sync |
| `XAI_API_KEY` | Optional server-side AI features |

## Health

`GET /api/health` includes `controlEvidenceLog: true` when migration 0026 is applied.

## Cron

Digest and integration jobs are documented in route handlers under `src/routes/api/cron/`.
