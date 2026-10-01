# Precog upgrade program (2026)

Tracks the comprehensive upgrade: control workflow bridge, drift on the owner path,
performance, and trust polish. The attached plan file in Cursor artifacts is the
source outline; this document is the living deploy and phase status.

## Production deploy checklist — control evidence (migration 0026)

Before promoting control evidence as a primary workflow:

1. Run `npm run db:migrate` against production (or rely on `npm run build` with
   `VERCEL_ENV=production`, which applies pending migrations).
2. Confirm migration `0026_control_execution_log.sql` is in the ledger table
   (`schema_migrations` / migrate-core ledger — see [scripts/migrate-core.mjs](scripts/migrate-core.mjs)).
3. Hit `/api/health` on the deployment: when the database is healthy, the JSON
   body includes `controlEvidenceLog: true` once the `control_execution_log` table
   exists (false when the table is missing).
4. Review retention and contributor attribution in
   [docs/CONTROL_EVIDENCE_WORKFLOW.md](CONTROL_EVIDENCE_WORKFLOW.md) with legal/compliance.
5. Set `VITE_EVIDENCE_BRIDGE=false` only to disable monthly-review → evidence bridging
   during rollout; default is on when unset.

## Phase status

| Phase | Focus | Status |
| ----- | ----- | ------ |
| 0 | Hygiene, scale messaging, health gate, docs | Done |
| 1 | Monthly review ↔ execution log bridge | Done |
| 2 | Drift signals on home / weekly plan | Done |
| 3 | Performance (debounce, bench; template lazy-load deferred) | Done |
| 4 | Trust, report, mobile, SoD tuning | Done |
| 5 | Payroll CSV import, pilot metrics export | Done |

## Bridge behavior (Phase 1)

When a signed-in owner records a monthly review result other than **Skipped**:

1. The profile `monthlyReviews` array and `review_events` row are written as today.
2. A **record** command is appended to `control_execution_log` for the same period and
   check key, using deterministic ids so retries are idempotent.
3. **Review** steps are not auto-created; a firm reviewer must review in the evidence log.

See [src/lib/precog/controls/review-bridge.ts](../src/lib/precog/controls/review-bridge.ts).

## Drift snapshot on profile (Phase 2)

Field `integrationDriftSummary` on the business profile holds a compact summary after
QuickBooks sync or access CSV import so Start here and the weekly plan can surface
“books vs map” actions without opening `/firm`.
