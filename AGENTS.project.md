# Precog repository rules

These rules govern every change to this repository, by any person or tool
(Claude Code, Cursor, Codex, Devin, Grok or another). `AGENTS.md` tells every
agent to follow this file; the Grok sandbox guidance in `AGENTS.md` still
applies to running the live preview.

Precog shows a small business, and the CPA who advises it, where one person
can move or hide money alone (duty conflicts), what stops when someone is
away, and what to check each month. Owners and CPAs rely on its figures, so a
change that makes a figure wrong is a defect even when every test passes.

## Done means verified

1. `npm run verify` passes. It runs, in order: `format:check`, `typecheck`,
   `lint`, `test`, `build` and `check:bundle`.
2. The branch contains the newest `main` when it is verified. Two changes can
   merge cleanly as text and still fail to compile or pass together, and this
   has broken `main` several times.
3. CI's "Release gate" check is green on the pull request's latest commit.

## Branches and pull requests

1. Start each task on a new branch from the current `main`.
2. Before asking for a merge, merge the newest `main` into the branch, run
   `npm run verify` again and wait for CI on the result.
3. Agents never merge. Only the owner merges a pull request.
4. Keep a pull request to about 400 changed lines where the task allows, and
   to one purpose.
5. Fill in the pull request template (`.github/pull_request_template.md`).

## Database migrations

1. Never edit a migration file that is on `main`. Add a new file with the next
   unused number (`migrations/00NN_name.sql`).
2. Migrations only add. Do not drop or rename a column or table in the same
   release as the code that stops using it, because the old code keeps running
   against the new schema for some minutes during a deploy.

## Scores and figures

1. A change that moves any score, index or count updates every test that pins
   that figure in the same commit, and the commit message says which figures
   moved and why.
2. Raise the bundle budget (`scripts/check-bundle-size.mjs`) only on purpose,
   with the reason and date recorded in that file.

## When `main` breaks

Revert the breaking merge first and fix it second. If the breaking merge added
a migration, ask the owner before reverting, and repair it with a new
migration rather than by editing the old one.

## Wording in the product

- Call the product "Precog", never "the app".
- Write "for example", never "e.g.".
- Do not write "should". Say what happens or what to do.
- Use "stand-in" for a person who covers for someone; "backup" means only a
  data backup.
- "Sign in" is the verb and "sign-in" the noun.
- The one warning for an action that cannot be reversed is "You cannot undo
  this."
- Plain mode uses plain words, for example "duty conflict" and "bank
  reconciliation". Tactical mode keeps its accounting terms on purpose.

## Files and settings to leave alone

- Keep `CreatedWithGrokBanner` mounted in `src/routes/__root.tsx`.
- Do not create a `.env` file.
- Do not add a React route at `/auth/popup`.
- Do not rewrite `src/lib/auth/server.ts`.
