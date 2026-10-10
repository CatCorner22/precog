# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules of record

`AGENTS.project.md` governs every change: done means `npm run verify` passes on
a branch that holds the newest `main`; agents never merge; migrations only add;
a moved figure updates its test pins in the same commit; and the product wording
rules (write "Precog", never "the app"; "for example", never "e.g."; no
"should"). The Precog section at the top of `AGENTS.md` points there; the rest
of `AGENTS.md` is the Grok sandbox guidance for the live preview and still
applies to it. Nothing in this file overrides either one.

Two project skills hold the long form: `.claude/skills/precog-verify` (run and
check Precog in a fresh container, with the locked-report parity harness) and
`.claude/skills/precog-personas` (the persona usability protocol).

## Commands

Node 22 (`.nvmrc`). Dependencies are already in `node_modules`; run `npm ci`
only when `package-lock.json` changed.

| Task                        | Command                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Dev server (live preview)   | `npm run dev` binds `0.0.0.0:8080`                                                                                    |
| What CI's `checks` job runs | `npm run verify` = `format:check`, `typecheck`, `lint`, `test`, `build`, `check:bundle`                               |
| Unit tests                  | `npm test`; one file `npx vitest run src/lib/precog/engine.test.ts`; one test `npx vitest run -t "<name>"`            |
| Typecheck, lint, format     | `npm run typecheck`, `npm run lint`, `npm run format:check` (`npm run format` rewrites)                               |
| Build (what Vercel runs)    | `npm run build`, then `npm run check:bundle`, `check:headers`, `check:functions`                                      |
| Server-function ids         | `npm run update:server-fn-ids` after moving or renaming a `createServerFn` export; the snapshot test fails until then |
| Migrations unchanged        | `BASE_REF=origin/main npm run check:migrations`                                                                       |

### Worktrees

One branch per task from the newest `main`. Share the installed dependencies by
hard link instead of a second `npm ci`, then drop the Vite cache so the worktree
gets its own:

```sh
git -C /home/user/precog fetch origin main
git -C /home/user/precog worktree add -b <branch> <wt> origin/main
cp -al /home/user/precog/node_modules <wt>/node_modules
rm -rf <wt>/node_modules/.vite
```

Never use `git stash`.

### Local Postgres

`npm test` never needs it: unit tests boot an embedded PGlite in `beforeAll`.
The `src/**/*.postgres.test.ts` files and the migration, quota and race checks
run only through the `test:postgres*` scripts against a real cluster:

```sh
pg_isready -h localhost -p 5432 || pg_ctlcluster 16 main start
PRECOG_LIFECYCLE_POSTGRES=1 PRECOG_MIGRATION_TEST=1 PRECOG_QUOTA_TEST=1 \
DATABASE_URL=postgresql://postgres@localhost:5432/precog npm run test:postgres
```

### Browser suites

`scripts/e2e-*.mjs` take the base URL as their first argument. Start a dev
server on a port of your own, warm it, run the suites, then stop the server by
its PID. Chromium comes from `npx playwright install chromium` (once), or point
`PLAYWRIGHT_BROWSERS_PATH` at an existing download.

```sh
npx vite dev --host 0.0.0.0 --port 8097 --strictPort > /tmp/dev-8097.log 2>&1 &
npm run e2e:warmup -- http://127.0.0.1:8097/
node scripts/e2e-tabs.mjs http://127.0.0.1:8097/   # also e2e-builder, e2e-enhancements, e2e-procedures
```

Stop a server by the PID whose working directory is your worktree, never with
`pkill -f` (other sessions run their own servers on this machine):

```sh
for p in /proc/[0-9]*; do
  pid=${p#/proc/}; [ "$pid" = "$$" ] && continue
  [ "$(readlink "$p/cwd" 2>/dev/null)" = "<wt>" ] || continue
  tr '\0' ' ' < "$p/cmdline" 2>/dev/null | grep -q -E '^(\S*/)?(node|npm) .*vite' && echo "$pid"
done | xargs -r kill
```

## Rules that bite

- **Locked reports print as before.** `REPORT_LAYOUT_VERSION` in
  `src/lib/precog/report/stored-model.ts` names the current printed layout. A
  report version locked with stored figures under an older layout keeps
  printing that layout's labels, counts and sentences (`PRINTED_LAYOUT_VERSIONS`
  and the `layoutN` branches in `src/components/precog/control-report.tsx`). A
  change to printed text raises the version and keeps every older branch; the
  harness in `scripts/parity/` dumps every printed layout from a base commit
  and compares the branch, and every line must read `SAME`.
- **Migrations only add.** A new file with the next unused number under
  `migrations/`; never edit, drop or rename one that is on `main`.
- **Bundle budget.** `scripts/check-bundle-size.mjs` holds the gzipped budgets.
  Raise one only in the change that needs the room, with the reason and date
  recorded in that file.
- **Commit message.** Name every moved figure, label, printed text and test
  pin, and why it moved. A commit that adds files names each file and why.

## Architecture

- **TanStack Start.** File routes in `src/routes/` (`routeTree.gen.ts` is
  generated and prettier-ignored), `getRouter` in `src/router.tsx`, the
  document shell in `src/routes/__root.tsx` (keep `CreatedWithGrokBanner`
  mounted). Server code is `export const x = createServerFn(...)`;
  `authMiddleware` (`src/lib/auth/middleware`) hands the handler a verified
  `userId`. A server function's id derives from its file path and export
  name and is pinned in `scripts/server-fn-ids.json`, because an open tab keeps
  calling the ids it loaded with.
- **Database.** `getSql()` in `src/lib/db.ts` is node-postgres when
  `DATABASE_URL` is set and an in-memory PGlite otherwise, with
  `migrations/*.sql` applied at boot. `migrations/renamed.json` tells the ledger
  about renamed files.
- **Domain, `src/lib/precog/`.** The practice profile (`practice-profile.ts`,
  `profile-reducer.ts`) is the one record of a business. `practice-context.tsx`
  holds it in React and saves it to browser storage per account
  (`workspace-storage.ts`) and, when signed in, to Postgres through
  `profile-server.ts` and `business-store.ts`. Industry templates
  (`templates/`, `industry.ts`) seed it; `scoring/`, `engine.ts` and `coso.ts`
  compute the figures; `firm/` is the CPA workspace (clients, engagements,
  report versions, review, billing); `report/stored-model.ts` freezes the
  figures a locked version prints.
- **UI.** `src/components/precog/` holds the owner screens, `firm/` the CPA
  workspace and `builder/` the map builder; `src/components/ui/` the
  primitives.
- **Tests.** Vitest uses its own `vitest.config.ts` (node environment, `@`
  alias from tsconfig); `scripts/*.test.mjs` run under `npm test` too.
  `scripts/README.md` lists every script, what runs it and where.
