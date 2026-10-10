#!/bin/bash
# SessionStart hook for Claude Code on the web (.claude/settings.json).
#
# Starts the local Postgres cluster when it exists and is down, and prints one
# line saying whether node_modules is present and whether Postgres answers, so
# a session knows before its first command whether `npm test` can run and
# whether the Postgres suites (npm run test:postgres) have a database.
#
# Idempotent, finishes in under 10 seconds (every wait is capped), never fails
# the session (it always exits 0), and runs only inside a Claude Code web
# session: hooks never run in a Vercel build, and the CLAUDE_CODE_REMOTE guard
# keeps it from touching a developer's own machine.
set -u

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
modules="missing"
if [ -d "$root/node_modules" ]; then
  modules="present"
fi

postgres="not installed"
if command -v pg_isready >/dev/null 2>&1; then
  if pg_isready -q -h localhost -p 5432 -t 2 2>/dev/null; then
    postgres="up"
  elif command -v pg_lsclusters >/dev/null 2>&1 && pg_lsclusters -h 2>/dev/null | grep -q '^16[[:space:]]*main'; then
    timeout 6 pg_ctlcluster 16 main start >/dev/null 2>&1 || true
    if pg_isready -q -h localhost -p 5432 -t 2 2>/dev/null; then
      postgres="started"
    else
      postgres="down (pg_ctlcluster 16 main start did not bring it up)"
    fi
  else
    postgres="no cluster"
  fi
fi

echo "Precog session: node_modules $modules; Postgres $postgres (localhost:5432)."
exit 0
