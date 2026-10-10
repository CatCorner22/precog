# Precog intuitiveness evaluation — protocol

Recorded 2026-10-07 00:05 UTC, before any persona walkthrough ran. Build under test: `main` at 6cc922f, dev server, signed out (owner personas) and a signed-in fixture (CPA persona).

## Claim under test

"A first-time small-business owner, with no accounting or internal-controls training, can complete Precog's core tasks unaided — no tutorial, no help article, no person — and a first-time CPA can do the same for the firm tasks."

Negation the exercise must be able to return: "Some core task fails, or succeeds only with outside knowledge, often enough that Precog needs training materials."

## Thresholds (fixed now)

Per task, across the personas who attempt it:

- **Pass (no training needed for this task):** every persona completes it unaided, no critical error, ease rating 5 or more of 7.
- **Fail (training or redesign needed):** any persona cannot complete it unaided, or makes a critical error (believes they did something they did not, or records something wrong without noticing).
- **Borderline:** completed, but with a wrong first click and recovery, or an ease rating under 5. Counts as a redesign item, not a pass.

Overall verdict "no training materials needed" requires every core task to pass. One failed core task means the answer is no.

A critical error is defined in advance as: a wrong record kept (for example, a check recorded under the wrong month or the wrong person marked as left), a false belief of success, or a lost entry.

## Personas (hard cases included on purpose)

1. **Dana** — owns a 12-person dental office, laptop, careful reader, no accounting training; her CPA told her to "look at who handles the money".
2. **Marco** — owns a restaurant, 25 staff, phone only (390×844), impatient, skims, gives up after about two dead ends.
3. **Priya** — executive director of a small nonprofit; the board treasurer asked her to "check our controls".
4. **Sam** — CPA at a small firm with small-business clients; first time on Precog's firm workspace (signed-in fixture).

## Tasks (in the user's words; no Precog vocabulary is given to personas)

Owner tasks:

- **O1 First look:** from the first screen only, say what Precog is for and what to click first.
- **O2 Sample:** in the sample business, find the single biggest problem and what the owner is told to do first.
- **O3 Own setup:** set up your own business with yourself plus three named people and what each does with money.
- **O4 Own top risk:** in your business, find the riskiest arrangement and the recommended change.
- **O5 Monthly checks:** record last month's bank-statement check as done, and the vendor check as a problem with a note.
- **O6 Waiting items:** find out whether anything waits on you and open one.
- **O7 Leaver:** record that one of your people left, and find what access to remove.
- **O8 Report:** get a report you can send to your accountant.
- **O9 Cost:** find what a fake-employee payroll scheme could cost you, and say what the figure means.
- **O10 Procedure:** get written steps for the bank reconciliation that you could hand to someone.

CPA tasks:

- **C1** Say which client needs you first and why.
- **C2** Review a client's report version and sign it off, or return it with a note.
- **C3** Find which clients have not finished last month's checks.
- **C4** Get the client list into a spreadsheet.

## Declared constraints (and their effect)

- **The personas are AI agents, not people.** They read every word, know web conventions, and know more vocabulary than a typical owner. Effect: the exercise finds problems; it cannot prove their absence. A pass here is necessary, not sufficient. Only the real-user test in the final report can support the claim.
- **Dev server, not production.** Effect: speed and sign-in differ; layout and wording are the same.
- **Owner personas are signed out.** Precog works signed out; signing in is outside the tasks.
- **The CPA fixture is seeded data.** Effect: real firms have more clients and history.

## What this exercise cannot prove

That real owners and CPAs need no training. It can only show where they would, at a minimum.

## Recording plan

For every task: the steps tried, the first click, dead ends, words the persona did not understand, success or failure, critical errors, the ease rating, and screenshots. Failures are recorded as written, never re-run until they pass.

## Addendum: round 2 (recorded 2026-10-07 17:10 UTC, before any round-2 walkthrough ran)

Build under test: branch claude/stoic-lovelace-payzni (PR #237) at 90331f8, dev server (owner personas, http://127.0.0.1:8097) and the signed-in firm fixture on the compiled build of the same commit (CPA persona, http://localhost:8089).

Unchanged from round 1: the claim, the negation, the thresholds, the critical-error definition, the four personas and the fourteen tasks, word for word. Round-1 results are not re-scored.

Added constraints and their effect:

- The personas are new agent runs with fresh browser profiles (dana2, marco2, priya2, sam2). They are told nothing about what changed between rounds and are not shown round-1 reports. Effect: they cannot look for the fixes; they can still share round-1 personas' general tendencies, so an improvement here is evidence only that the specific failures no longer reproduce for agent readers.
- The person who built the fixes also wrote the persona prompts. Effect: wording of tasks is copied unchanged from round 1 to limit steering.
- The verdict stays the one fixed above: one failed core task means "training materials still needed". Borderline tasks are listed as redesign items.

## Addendum: round 3 (recorded 2026-10-07 18:54 UTC, before any round-3 walkthrough ran)

Build under test: branch claude/stoic-lovelace-payzni-w3b-int at 0e832ca (the repair of main in PR #242 plus the wave-3b fixes F1 to F5 that answer round 2), dev server http://127.0.0.1:8097 for the owner personas and the signed-in firm fixture on the compiled build of the same tree for the CPA persona, http://localhost:8089.

Unchanged: the claim, the negation, the thresholds, the critical-error definition, the four personas and the fourteen tasks, word for word; the task details given to each persona (business names, people and duties) are the same as in round 2. Rounds 1 and 2 are not re-scored.

Constraints, as in round 2: new agent runs with fresh browser profiles (dana3, marco3, priya3, sam3), told nothing about what changed and shown no earlier report. Round 3 tests the fixes to round 2's failures with the same kind of reader, so a pass here shows only that those failures no longer reproduce for agent readers; the real-user test remains the only test of the claim.
