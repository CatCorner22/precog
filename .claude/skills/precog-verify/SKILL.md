---
name: precog-verify
description: The verified path to run, test and check Precog (this repository) in a fresh Linux container, with exact commands. Use it whenever a task here needs a worktree, a dev server, the unit tests, the Postgres suites, the browser suites, `npm run verify`, a bundle or migration check, or proof that locked report versions still print as before, including when the request only says "run the tests", "check my change", "is this ready for a pull request", "start the server" or "does the report still print the same". Read it before the first command of any such task, not after something fails.
---

# Precog: run, verify, test

`AGENTS.project.md` is the rule of record; this skill is the operational
checklist that satisfies it. Every command runs from the repository root of
the worktree you work in. Product wording applies to everything you write
here too: "Precog", never "the app"; "for example", never "e.g."; no "should".

## 1. Fresh container checklist

1. **Node 22** (`node -v`; `.nvmrc` pins it). Dependencies are installed at
   `/home/user/precog/node_modules`; run `npm ci` only when `package-lock.json`
   changed.
2. **One worktree per task**, from the newest `main`, sharing the installed
   dependencies by hard link (seconds instead of a second `npm ci`), then drop
   the Vite cache so the worktree gets its own:

   ```sh
   git -C /home/user/precog fetch origin main
   git -C /home/user/precog worktree add -b <branch> <wt> origin/main
   cp -al /home/user/precog/node_modules <wt>/node_modules
   rm -rf <wt>/node_modules/.vite
   cd <wt>
   ```

   Never use `git stash`: it moves work between branches silently and has lost
   edits here. Commit or discard instead.

3. **Local Postgres** (only the Postgres suites need it; `npm test` boots an
   embedded PGlite):

   ```sh
   pg_isready -h localhost -p 5432 || pg_ctlcluster 16 main start
   ```

   The SessionStart hook in `.claude/settings.json` does this once per session
   and prints one line about `node_modules` and Postgres.

4. **Chromium for the browser suites**: `npx playwright install chromium` once
   (needs network), or point `PLAYWRIGHT_BROWSERS_PATH` at an existing download.

## 2. Verify (what "done" means)

```sh
git merge origin/main          # the branch must hold the newest main
npm run verify                 # format:check, typecheck, lint, test, build, check:bundle
```

Each step, and what to do when it fails:

| Step       | Command                | When it fails                                                                       |
| ---------- | ---------------------- | ----------------------------------------------------------------------------------- |
| Formatting | `npm run format:check` | `npm run format` rewrites; `src/routeTree.gen.ts` and `AGENTS.md` are ignored       |
| Types      | `npm run typecheck`    | `tsc --noEmit` over `src/` only; `scripts/` is plain JavaScript                     |
| Lint       | `npm run lint`         | zero warnings allowed; layering rules in `eslint.config.mjs` explain themselves     |
| Unit tests | `npm test`             | one file `npx vitest run <path>`; one test `npx vitest run -t "<name>"`             |
| Build      | `npm run build`        | what Vercel runs; migrations apply only when `VERCEL_ENV` is production             |
| Bundle     | `npm run check:bundle` | gzipped budgets in `scripts/check-bundle-size.mjs`; raise only with reason and date |

After `npm run build`, CI also runs `npm run check:headers`,
`npm run check:functions` and the signed control-evidence lifecycle
(`DATABASE_URL= PRECOG_CONTROL_E2E=1 npm run test:evidence:http`). On a pull
request CI runs `BASE_REF=origin/main npm run check:migrations`.

Moved or renamed a `createServerFn` export? `npm run update:server-fn-ids`
and commit `scripts/server-fn-ids.json`, or the snapshot test fails.

## 3. Postgres suites

```sh
pg_isready -h localhost -p 5432 || pg_ctlcluster 16 main start
PRECOG_LIFECYCLE_POSTGRES=1 PRECOG_MIGRATION_TEST=1 PRECOG_QUOTA_TEST=1 \
DATABASE_URL=postgresql://postgres@localhost:5432/precog npm run test:postgres
```

That runs, in order, `test:postgres:migrations`, `:quota`, `:lifecycle`,
`:evidence` and `:races` (every `src/**/*.postgres.test.ts`). Each needs its
flag, so a plain `npm test` never touches a real database. The suites create
and drop their own schemas; the `precog` database can be reused.

## 4. Browser suites

Each `scripts/e2e-*.mjs` takes the base URL as its first argument. Use a port of
your own (other sessions run servers on this machine) and `--strictPort`, so a
taken port fails loudly instead of silently moving:

```sh
npx vite dev --host 0.0.0.0 --port 8097 --strictPort > /tmp/dev-8097.log 2>&1 &
for i in $(seq 1 60); do curl -sf http://127.0.0.1:8097/ > /dev/null && break; sleep 2; done
npm run e2e:warmup -- http://127.0.0.1:8097/
node scripts/e2e-builder.mjs      http://127.0.0.1:8097/
node scripts/e2e-enhancements.mjs http://127.0.0.1:8097/
node scripts/e2e-tabs.mjs         http://127.0.0.1:8097/
node scripts/e2e-procedures.mjs   http://127.0.0.1:8097/
```

`E2E_SCREENSHOT=<png>` saves a screenshot on failure; `E2E_TIMEOUT_MS`
(default 45000) stretches waits on a loaded machine. The account-safety suites
run against the compiled handler (`scripts/serve-built-test.mjs`) with a real
Postgres and auth variables; `scripts/README.md` lists them.

**Stop a server by PID, never with `pkill -f`** (that kills other sessions'
servers too). Find the process whose working directory is your worktree:

```sh
for p in /proc/[0-9]*; do
  pid=${p#/proc/}; [ "$pid" = "$$" ] && continue
  [ "$(readlink "$p/cwd" 2>/dev/null)" = "<wt>" ] || continue
  tr '\0' ' ' < "$p/cmdline" 2>/dev/null | grep -q -E '^(\S*/)?(node|npm) .*vite' && echo "$pid"
done | xargs -r kill
```

## 5. Locked-report parity harness

A report version locked with stored figures keeps printing the layout it was
locked under: `REPORT_LAYOUT_VERSION` in `src/lib/precog/report/stored-model.ts`
is the current layout, `PRINTED_LAYOUT_VERSIONS` the ones `ControlReport`
still prints, each with its own labels and sentences (the `layoutN` branches in
`src/components/precog/control-report.tsx`). A change to printed text raises
the version and leaves every older branch as it was. The harness proves it:
it dumps every printed layout for every industry sample and three own-business
cases from a base commit, prints the same stored figures on the branch, and
compares the print-only text.

```sh
# 1. A worktree at the base commit (usually origin/main), with the harness copied in
git -C /home/user/precog worktree add <base-wt> origin/main
cp -al /home/user/precog/node_modules <base-wt>/node_modules && rm -rf <base-wt>/node_modules/.vite
mkdir -p <base-wt>/scripts/parity && cp <wt>/scripts/parity/* <base-wt>/scripts/parity/

# 2. Dump from the base, check on the branch, compare
P=<scratch>/parity
(cd <base-wt> && PARITY=dump  PARITY_DIR=$P npx vitest run --config scripts/parity/vitest.config.mjs)
(cd <wt>      && PARITY=check PARITY_DIR=$P npx vitest run --config scripts/parity/vitest.config.mjs)
python3 -I scripts/parity/compare.py $P
```

`compare.py` prints one line per case and layout (88 lines today: 11 cases by
8 layouts). **Every line must read `SAME`.** A `DIFF` line shows the first
differing text; that is a locked version that would print differently after
the change, which `AGENTS.project.md` counts as a defect even when every test
passes. `$P/DIFFS` lists the same cases from the harness's own comparison
(before `print:hidden` parts are removed). `npm test` never runs the harness,
because it needs `PARITY` and `PARITY_DIR`.

Run it whenever a change touches `control-report*.tsx`, `report/stored-model.ts`,
`report/*`, the scoring that feeds the report, or any label the report prints.

## 6. Rules that bite

- **Migrations only add.** A new file with the next unused number under
  `migrations/`; never edit, drop or rename one that is on `main`. Dropping a
  column waits for a later release than the code that stops using it.
- **Figures.** A change that moves any score, index or count updates every
  test that pins it in the same commit.
- **Bundle budget.** Raise a budget in `scripts/check-bundle-size.mjs` only in
  the change that needs the room, with the reason and date recorded there.
- **Commit message.** Name every moved figure, label, printed text and test
  pin, and why. A commit that adds files names each file and why.
- **Pull request.** Fill `.github/pull_request_template.md`: what changes for
  the user, who wrote it, the `main` commit the branch held when
  `npm run verify` passed and the last lines of its output, database ("No
  change" or the migration), figures and bundle ("No change" or what moved).
  Agents never merge.
