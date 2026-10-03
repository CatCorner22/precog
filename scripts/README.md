# scripts/

Every script, what runs it, and where. Tests beside a script (`*.test.mjs`)
run with `npm test`.

## Deploy

| Script                      | Run by                                             | What it does                                                                                                                                                       |
| --------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `migrate.mjs`               | `npm run db:migrate`; `npm run build` (production) | Applies pending `migrations/*.sql` to `DATABASE_URL`. With `--only-on-production` it does nothing unless `VERCEL_ENV` is production. Tested in `migrate.test.mjs`. |
| `migrate-core.mjs`          | `migrate.mjs`, the Postgres migration check        | The ledger: each file once, under an advisory lock, with renamed files moved. Tested in `migrate-core.test.mjs`.                                                   |
| `check-bundle-size.mjs`     | `npm run check:bundle` (CI `checks`)               | Fails when the built client's JavaScript passes its gzipped budget.                                                                                                |
| `check-build-headers.mjs`   | `npm run check:headers` (CI `checks`)              | Fails when the build's page route lacks a security header from `vite.config.ts`.                                                                                   |
| `check-build-functions.mjs` | `npm run check:functions` (CI `checks`)            | Fails when a built function lacks a numeric `maxDuration` or `/api/cron/digest` is not at 300 s.                                                                   |
| `deploy-config.test.mjs`    | `npm test`                                         | `.env.example` names every variable the code reads; every cron in `vercel.json` calls a route that exists.                                                         |

## PostgreSQL checks (CI `migrations` job)

Each needs a local disposable Postgres in `DATABASE_URL` and its own opt-in flag.

| Script                         | Run by                                                         | What it does                                                                    |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `test-migrations-postgres.mjs` | `npm run test:postgres:migrations` (`PRECOG_MIGRATION_TEST=1`) | Two simultaneous runners, lock timeout, rollback and retry on real connections. |
| `test-quota-postgres.mjs`      | `npm run test:postgres:quota` (`PRECOG_QUOTA_TEST=1`)          | The daily model budget under 64 parallel requests.                              |

`npm run test:postgres:lifecycle` (`PRECOG_LIFECYCLE_POSTGRES=1`) runs
`src/lib/precog/business-lifecycle-safety.test.ts` on the same database.

## Browser suites

Each takes the base URL as its first argument (default `http://127.0.0.1:8080/`)
and needs `npx playwright install --with-deps chromium` once.

| Script                   | Run by                                             | What it does                                                                                                                 |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `e2e-warmup.mjs`         | `npm run e2e:warmup` (CI `e2e`)                    | Waits until the dev server has stopped forcing reloads.                                                                      |
| `e2e-builder.mjs`        | `npm run e2e` (CI `e2e`)                           | Map builder: add a process, keyboard shortcuts, CSV import and undo.                                                         |
| `e2e-enhancements.mjs`   | `npm run e2e:enhancements` (CI `e2e`)              | Insurance confirmation, map undo and redo, exception-first setup.                                                            |
| `e2e-tabs.mjs`           | `npm run e2e:tabs` (CI `e2e` and `account-safety`) | Every tab of every industry demo and every standalone page; fails on any page error.                                         |
| `e2e-account-safety.mjs` | `npm run e2e:safety` (CI `account-safety`)         | Two real signed sessions against the compiled build; account boundaries.                                                     |
| `serve-built-test.mjs`   | CI `account-safety`                                | Serves the compiled Vercel handler on port 8080 for the suites above.                                                        |
| `lib/`                   | the suites                                         | `e2e.mjs` (browser page, waits, storage key), `steps.mjs` (step log, `eventually`), `server-fn-id.mjs`, `auth-test-env.mjs`. |

## Platform tools

Used by the app-builder sandbox, not by CI.

| Script                  | What it does                                                         |
| ----------------------- | -------------------------------------------------------------------- |
| `browser-smoke.mjs`     | Loads a page and saves a screenshot under `screenshots/`.            |
| `preview-thumbnail.mjs` | Captures the 1280x800 preview image.                                 |
| `browser-guard.mjs`     | Keeps both of the above on loopback URLs and workspace output paths. |
