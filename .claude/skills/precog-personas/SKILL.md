---
name: precog-personas
description: The persona usability protocol for Precog (this repository). AI personas, four owners and a CPA, attempt the fourteen core tasks unaided through scripted browser steps, and one failed core task means the verdict is "no, training materials are still needed". Use it whenever a task asks whether a first-time owner or CPA can do something in Precog without help, to test usability or intuitiveness, to walk through Precog as a new user, to re-run a persona round after fixes, or to drive Precog step by step in a persistent browser profile; also when the request only says "try it as a first-time user", "is this screen clear", "UX walkthrough" or "run the personas".
---

# Precog: persona usability rounds

The protocol is `scripts/ux/PROTOCOL.md`: the claim under test, the thresholds
fixed in advance, the four personas, the fourteen tasks in the user's words,
the declared constraints and the recording plan. Read it first and keep its
wording; the tasks are given to personas word for word so that the person who
built a fix cannot steer the round.

The drivers are `scripts/ux/drive.mjs` (owner personas, signed out, against a
dev server) and `scripts/ux/cpa/drive.mjs` plus `scripts/ux/cpa/serve-firm.mjs`
(the CPA persona, signed in to a seeded firm on the compiled build). Both
drivers keep a browser profile per persona between calls, so local data
survives like a real visitor's, and both print what a user would see: the
address, the visible text, every button, link, tab and field with its
accessible name, any page error or dialog, and a screenshot path. Action
errors are printed, not thrown: a persona that clicks the wrong thing sees
what a user sees.

## 1. Before a round

Write the round's addendum to `scripts/ux/PROTOCOL.md` **before** any
walkthrough runs: the build under test (branch and commit), what is unchanged
from the earlier rounds, the fresh profile names, and the constraints. The
verdict rule and the thresholds never change between rounds. Earlier rounds
are not re-scored.

Everything the drivers write goes under `.tmp/ux/` in the repository (profiles,
screenshots, cookies, downloads), which `.gitignore` leaves out of every
commit; `UX_DIR` moves it. Use fresh profile names per round (`dana3`, not
`dana`), so a persona cannot carry over what an earlier run learned.

## 2. Owner personas: a dev server

```sh
npx vite dev --host 0.0.0.0 --port 8097 --strictPort > /tmp/dev-8097.log 2>&1 &
for i in $(seq 1 60); do curl -sf http://127.0.0.1:8097/ > /dev/null && break; sleep 2; done
npm run e2e:warmup -- http://127.0.0.1:8097/
```

One step of a persona (the profile persists; the next call without `goto`
reopens the page the persona was on):

```sh
UX_BASE=http://127.0.0.1:8097 node scripts/ux/drive.mjs dana3 \
  '[{"goto":"/"},{"wait":800}]'
UX_BASE=http://127.0.0.1:8097 node scripts/ux/drive.mjs dana3 \
  '[{"click":{"role":"button","name":"Explore the fictional sample"}},{"wait":800}]'
```

Marco uses a phone: put `{"viewport":"phone"}` first in every call
(390 by 844). Chromium comes from `npx playwright install chromium` once, or
`PLAYWRIGHT_BROWSERS_PATH` pointing at an existing download.

Actions, run in order: `goto` (a path on the server), `click` (`role`, `name`,
optional `exact`), `clickText`, `fill` (`label`, `value`), `fillPlaceholder`,
`select` (`label`, `option`), `check`, `press` (a key), `scroll` (pixels),
`wait` (milliseconds, at most 5000).

## 3. The CPA persona: the signed-in firm fixture

The fixture serves the compiled Vercel build in-process on
`http://localhost:8089` with an embedded disposable database (never a deployed
one), seeds Reyes & Park CPAs (Sam Reyes, owner; Jordan Lee, preparer) with
three client businesses, August and September monthly checks, one exception
(check #4417 at North Dental) and a report version Jordan locked and sent to
Sam for review. It stays up until SIGINT or SIGTERM.

```sh
npm run build
env -u DATABASE_URL PRECOG_CONTROL_E2E=1 node scripts/ux/cpa/serve-firm.mjs > /tmp/firm-8089.log 2>&1 &
for i in $(seq 1 60); do grep -q '"ready": true' /tmp/firm-8089.log && break; sleep 2; done
node scripts/ux/cpa/drive.mjs sam3 '[{"goto":"/"},{"wait":1000}]'
```

The fixture writes the sign-in cookies to `.tmp/ux/cpa/cookies.json`; the CPA
driver adds the one for `UX_AS` (`sam` by default, `jordan` for the preparer)
to its profile. It refuses to start with a `DATABASE_URL` set, which is why the
command unsets it. The build must be from the commit under test: a stale
`.vercel/output` tests the wrong code.

The CPA driver adds `hoverText`, `wheel` (`[dx, dy]`), `scrollToText`,
`clickIn` (`region: {role, name}` plus `role`, `name`, so a button inside one
client's card is unambiguous) and `snap` (`{"snap":{"label":"...", "chars":1200}}`,
a mid-run screenshot and text so a multi-step flow stays in one session).
`UX_PROMPT` is typed into a `prompt()` dialog, `UX_DISMISS=1` dismisses dialogs
instead of accepting them, and `UX_FIND=<regex>` prints only matching lines of
the visible text after the full dump.

## 4. Running a persona

Give the persona only its description and the tasks in the user's words from
the protocol, never Precog's vocabulary, never a screenshot from another
persona, never what changed since the last round. Drive one step per call and
read the output before choosing the next: the first click, dead ends, words the
persona did not understand, a wrong first click with recovery, and whether the
persona believes it succeeded all come from these outputs. Let Marco give up
after about two dead ends, as the protocol says. Record a failure as written;
never re-run a task until it passes.

Write one report per persona at `.tmp/ux/reports/<persona>.md` with, for every
task: the steps tried, the first click, dead ends, words not understood,
success or failure, any critical error (a wrong record kept, a false belief of
success, a lost entry), the ease rating of 7, and the screenshot paths. When a
round's findings are worth keeping, summarize them in the pull request that
answers them or under `docs/history/`, named with the date.

## 5. The verdict

Score each task across the personas who attempt it, exactly as the protocol
fixes it:

- **Pass:** every persona completes it unaided, no critical error, ease 5 or
  more of 7.
- **Fail:** any persona cannot complete it unaided, or makes a critical error.
- **Borderline:** completed, but with a wrong first click and recovery, or ease
  under 5. A redesign item, not a pass.

The overall answer "no training materials needed" needs every core task to
pass. **One failed core task means the answer is no.** A pass by agent
personas is necessary, not sufficient: agents read every word and know web
conventions, so the round finds problems and cannot prove their absence. Say
so in the report.

## 6. After the round

Stop the servers by PID (never `pkill -f`, which kills other sessions'
servers): the dev server is the `vite` process whose working directory is your
worktree, the fixture the `node` process running `serve-firm.mjs`.

```sh
for p in /proc/[0-9]*; do
  pid=${p#/proc/}; [ "$pid" = "$$" ] && continue
  [ "$(readlink "$p/cwd" 2>/dev/null)" = "<wt>" ] || continue
  tr '\0' ' ' < "$p/cmdline" 2>/dev/null | grep -q -E '^(\S*/)?(node|npm) .*(vite|serve-firm)' && echo "$pid"
done | xargs -r kill
```
