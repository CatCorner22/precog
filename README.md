# Precog

**Internal controls and residual risk management for small businesses** — segregation-of-duties detection, a library of prosecuted cases showing what each gap has cost real businesses, knowledge continuity maps, scenario modeling, and an AI advisor grounded in your business profile and that case library.

Built for owner-operated teams (2–50 people): dental and medical offices, retail, professional services, restaurants, construction, auto dealerships and repair shops, nonprofits, and general small business.

| Module               | Path                         | Role                                                                                                        |
| -------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Residual engine      | `src/lib/precog/scoring/`    | Inherent × (1 − effectiveness) × staff modifiers (scenario rows credit effectiveness at 50%), action bands  |
| Tornado sensitivity  | `scoring/residual-engine.ts` | Highest-leverage control levers                                                                             |
| COSO heat map        | `coso.ts` + UI               | 5 components, 17 principles, deep links                                                                     |
| Precog scenarios     | `engine.ts`                  | Assumed days until found and $ loss; an own business has no crime policy until you enter one                |
| Knowledge SPOF map   | knowledge UI                 | Continuity / single points of failure                                                                       |
| Pioneer LLM coach    | `coach/`                     | Grok `grok-4.5` when `XAI_API_KEY` present; local pioneer fallback always                                   |
| Procedures library   | `procedures/library.ts` + UI | Recommended procedures per industry: steps, evidence to keep, and fallbacks (replaces the blueprint)        |
| Power map builder    | SoD UI                       | Interactive staff-to-duty map, 20+ common job templates, live assignment sandbox, and conflict explanations |
| Assessment snapshots | `snapshots.ts` + UI          | Private, versioned practice records with model/corpus provenance                                            |

## Fast setup from your HR or payroll system

You can set up the whole team in one paste instead of one person at a time.
In onboarding, open "Paste your team from Workday, SAP, Oracle, or your
payroll export"; in the team register, use "Paste roster" or "Import CSV".

Adaptive setup asks how money moves, applies answers to the live preview and
saved profile, and lists the duties and controls changed alongside its remaining assumptions.

The importer reads the worker exports these systems produce, header row
included, and a plain list with one person per line as `Name, Title`:

| System                                     | Columns it reads                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Workday worker report or Excel export      | Worker (with or without the id in parentheses), Employee ID, Business Title, Job Profile, Hire Date, Cost Center |
| SAP SuccessFactors Employee Central        | Person ID External, User ID, First Name, Last Name, Job Title, Position, Department, Employment Status           |
| Oracle HCM Cloud worker extract            | Person Number, Display Name, Job Name, Position Name, Department Name, Assignment Status, Hire Date              |
| ADP Workforce Now                          | Payroll Name, Position ID, Position Description, Home Department, Position Status (A, L, T), Hire Date           |
| Gusto, Paychex, QuickBooks Payroll, Paycom | Employee Name or First Name and Last Name, Job Title or Position, Department, Status, Hire Date or Start Date    |
| BambooHR, Rippling, Paylocity              | Employee # or Employee Number or Employee Id, Preferred Name (ignored beside First and Last Name), Cost Center 1 |
| Square, Homebase, 7shifts, Toast           | Given name and Family name, Team member ID, Job title (over Role), Roles, Departments, Locations, Job, Active    |
| Dentrix, Open Dental                       | Staff ID, Name, Position, Status; EmployeeNum, LName, FName, IsHidden                                            |
| A French export                            | Nom, Prénom, Poste, Statut, Date d'entrée, with day-first dates                                                  |

Comma, tab, semicolon and pipe delimiters are detected, and a Markdown table
pasted from a chat reads as well. The header may sit under a report title;
repeated header rows, Total, Count, Page and "Report generated" footer rows
(QuickBooks' "TOTAL, 9 employees" too), and a report's run stamp on a line of
its own ("Tuesday, Sep 23, 2026 09:14 AM GMT-04:00", "Accrual basis ...") are
skipped and reported. Direction-changing and invisible control characters
(a right-to-left override, zero-width spaces) are removed from every cell.
One import reads up to 250 rows, and the note says how many more were not
read. A "Last, First" name becomes "First Last", with a
generation suffix kept after it ("Diaz, Cal III" is "Cal Diaz III") and a
credential after a comma ("Cole, Ben, CPA" is "Ben Cole, CPA"); a credential
alone after the comma ("Roe, DDS") and a company name ("Acme Payroll, Inc.")
stay as written. A hire date becomes years of service, with a warning when it
is in the future; an inactive, terminated, deactivated, archived, deleted,
deceased or laid-off status keeps the person off the map, while someone on
leave (Leave, On Leave, LOA, FMLA, ADP's L, Oracle's "Inactive - Leave of
Absence" and "Suspended - ...", a furlough) stays on it with a note, and a
status word the importer does not know is reported and treated as active. A
termination or last-day date already past, in ISO or US form, marks the person
as having left when no status column says otherwise; beside an active status
it is reported and not kept. An Employment Type, Employee Type or Worker Type column describes
schedule or contract, so its codes ("F", "P", "T" for temporary) never take
anyone off the map; only a full word such as "Terminated" there does. A row
that repeats an earlier name and title is skipped and reported; when the rows
carry employee IDs the ID decides instead, so two employees with one name
stay two people, and one ID on two positions is one person holding the duties
of both. Someone listed with one title at two locations is one person at both.

In the team register, a pasted roster adds and updates people and removes
nobody; an imported CSV that leaves people out asks before removing them. A
row naming someone already on the team keeps that person, matched by
employee ID before the name, along with whatever the file has no column for
and the duties set for them when the title is unchanged. "Export CSV" writes
each person's employee ID and the duties the conflict checks read, so the
team's own export re-imports to the same people with the same duties.

A plain list also works, one person per line: "Name, Title", "Name - Title",
"Name<tab>Title", "Name | Title", "Name: Title" or "Name (Title)", with or
without list numbers or bullets. A line splits on a tab first, then " | ",
then ": ", then the comma, so "Ana Ruiz, Front Desk - Evenings" keeps its
title whole, unless the text before a dash is a "Last, First" name ("Smith,
John - Bookkeeper"). A title line above the list ("Staff List", "Team
Roster") is skipped and reported.

When a row has two title columns, duties are read from the standard
classification (Workday's Job Profile, Oracle's Job Name) before the free-text
or seat title (Business Title, Position Name), and from the other column when
the first is not in the catalog; an owner's title in any column seats the
owner. The role shown is the title the duties were read from.

Job titles are read through a catalog of about a hundred common small-business
titles (`src/lib/precog/onboarding/job-catalog.ts`): bookkeeper, office
manager, AP specialist, payroll administrator, front desk, cashier, server,
foreman, IT administrator, night auditor, service advisor, property manager,
development director, and so on, with the seniority and schedule words ignored.
A title that only names whom the job serves ("Owner's Assistant", "Office Manager -
reports to Owner") never takes the owner's seat, and a learner's title ("Accounting
Student") carries no money duty.
Each entry carries a one-sentence standard description of the job and a
reason for its starting duties, and the whole sheet can be read from the
onboarding step. With no roster to paste, "Add people by job title" creates
numbered placeholder rows for any title and count. The grid shows twelve money
duties as columns (taking payments, recording them, preparing deposits, reconciling the
bank, entering bills, setting up suppliers, releasing payments, spending on a company card,
entering and approving payroll, issuing refunds, and approving write-offs); any other duty a
title carries (reviewing and coding the card statement, approving expense claims, system
administration, and so on) appears
as a tag on the row that the owner can remove, so nothing a title carries is hidden, and
"Add a duty" on each row adds any other duty the rulebook defines. Pasting or adding
people keeps the Owner row and its ticks until the owner names it or the paste brings its
own owner, and finishing with a row that has duties but no name asks for the name. Someone the roster
shows on leave is recorded as out today in Who knows what when onboarding finishes. Each title carries the money duties it typically holds in a business
of two to fifty people, so every person lands with duties ticked and the
duty-conflict findings appear at once. Where a title corresponds to one
occupation in the U.S. Bureau of Labor Statistics Standard Occupational
Classification (SOC 2018), the entry records the code. Workday, SAP, and
Oracle publish no job-description list; each customer builds its own, so the
catalog covers the titles that fill those systems in a small business rather
than any vendor's list. The duties are a starting point the owner corrects,
never a fact about the business, and the app says so at the point of use.

## What you get

| Capability              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start here**          | One screen: two headline figures, a "Today" card on who is out right now (sick or on leave), what that stops, who covers it and whether the hand-off is logged, leave starting within a week, and debriefs waiting; then the top three actions, each with a button to the screen that fixes it. Where one person controls too much, what that exact gap has cost other businesses (prosecuted cases with government sources), how those cases came to light, the continuity figures and every case cited sit under a closed "Why we say this"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **How Precog scores**   | What is still exposed (residual risk), the coverage check (COSO) and number patterns, each backed by the cases behind it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Weekly action plan**  | Ranked next steps for controls, continuity, and documentation debt, including critical gaps that need a procedure written down or located. It has no screen of its own: it ranks the next steps in the printed report and the shared map                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **SoD detector**        | Finds incompatible duty combinations (cash + recon, vendor + pay, company card + its statement review or expense approval, etc.) and shows the prosecuted case that proves each one matters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Process map builder** | Interactive value stream with risks, controls, ideas, and lean waste. **Build mode** lets you add/edit/delete your own processes, assign owners and controls, drag to arrange or auto-arrange by stage, record how each process runs and where its procedure lives, and export/import the map as JSON or CSV — every edit re-scores residual risk live                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Who knows what**      | Continuity planner: list the duties, tasks and know-how the business runs on, mark who can do each (several people per item, several items per person), see single points of failure and who the business leans on, check what stops if someone is out tomorrow (including several people on overlapping leave), record planned leave (who, first and last day) so the planner shows what stops during each upcoming absence and who is left — the weekly plan, printed report and Pioneer warn ahead with lead time and a hand-off deadline, overlapping leave is flagged — press "Out today" the morning someone calls in sick to get today's cover sheet on the spot (what stops, who steps in, where the written procedure lives, one-click hand-off) with "Still out tomorrow" / "Back" to extend or end it (the weekly plan, Pioneer and report speak of it as unexpected cover, not leave), and once anyone is back a debrief asks whether the stand-in can now run each covered entry alone (one click promotes them, confirmed today, and closes the hand-off; "Not yet" logs it as a cross-training step); when someone gives notice, record their last working day — they stay on the team and count as cover until then, while a hand-over checklist lists every entry only they can run alone with the successor to train, what still needs writing down or a recorded location, and processes needing a new owner, each step loggable as a decision due no later than the last day; the weekly plan, Pioneer, printed report and the Start-here "Today" strip count down to it, and once the date passes "Mark as left" takes them out of the coverage figures while keeping the record in the history — record where each written procedure lives, follow a ranked cross-training plan and a "Write it down" list of documentation debt (items with nothing written, or written but with no recorded location, critical and single-owner first — each step, like each cross-training and absence-check step, can be logged as a decision with a 30-day review), and import/export the whole register as a spreadsheet. The printed report adds one contingency card per person whose absence stops work and a follow-through section listing open, completed and slipped continuity steps |
| **Scenarios**           | Assumed timelines and losses you can adjust, shown next to the real cases involving the same duty conflicts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Decision journal**    | Document accept / remediate / monitor / insure with review dates; each entry snapshots scores when logged and again at review (then-vs-now), including register coverage and documentation state for decisions logged from the continuity planner; if a cross-training decision closed as done later loses its stand-in, the journal and Start here flag it as slipped with one-click reopen. Slips are step-aware: documentation slips apply to write-it-down steps, while coverage slips apply to cross-training and hand-off steps. Closing a register step as done is register-aware: if the register does not yet show the outcome, the journal offers "Done — Chris can now do it alone" / "Done — it's written down at …", which updates and re-confirms the register entry as it closes ("Done anyway" closes without touching it). Open register steps also feed back into advice: the weekly plan, printed report and Pioneer report a step already logged as "In progress: Chris on PMS admin — review 12 Oct" (or "Review overdue: can Chris run it alone yet?" once the date passes) instead of recommending it again                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Pioneer advisor**     | Tool-grounded AI brief (Grok when configured; local fallback always) that cites the prosecuted cases matching your open gaps. Its continuity context includes documentation gaps so Pioneer can advise on writing or locating procedures alongside cross-training                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Printed report**      | Findings, recommended controls, and the cases cited with publisher and URL, for an accountant, lender, or insurer. The continuity section reports weighted documentation debt and its top write/locate actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Cloud sync**          | Sign in to persist your business profile across devices; Sessions in the account menu signs out the other sessions or every session, and lists where the account is signed in within a day of signing in (a session ends seven days after it was last refreshed, at most once a day while in use)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Cloud saves carry a per-business revision, so edits made in another tab or device are
identified before they can overwrite local work. The app asks whether to load the remote
version or keep the local version and overwrite it. The revision check and the write are one
statement server-side (`src/lib/precog/business-store.ts`), so two clients racing on the same
revision cannot both succeed. Businesses are keyed per user (`0010_businesses_per_user_key.sql`),
so two accounts that both hold the legacy `biz_default` id no longer collide. Both migrations run
automatically through the existing migration runner. The same prompt appears when you sign in on a device that already holds edits to the
business your account has, and work done signed-out under a separate business is added to
the account rather than replaced. Switching businesses trusts the local copy only when it
was built on the revision the server still holds. A pending save is flushed when the tab is
hidden or closed, and if the browser refuses local storage (private mode, quota) the header
badge says so instead of the page failing. The open tab is part of the URL (`/?tab=map`),
so refresh, back, and shared links keep the view.

### If a control fails

The “If a control fails” view in What could happen compares a safeguard or control as recorded today with the same item switched off, or switched on when it is missing. It reuses Precog’s scenario, residual-risk and duty-conflict engines and shows related processes and real cases. This is a what-if only; it does not change or save the business profile.

## Control evidence log

On the Firm page, signed-in users can record a monthly check with its scope,
reported performer, method, evidence references and conclusion. The first
release covers bank-statement review, cleared-check images, payroll headcount,
and vendor changes. References are pointers to restricted records, not uploaded
or automatically verified documents. When you are signed in, a Done or Exception
on the monthly review also adds one entry per check per month to this log: dated
the day you record the result, method “inquiry”, with your note (or the month,
when the note is empty) as the reference. A Done entry awaits review; an Exception
entry needs correction by the monthly due date. The log takes the first Done or
Exception for each check and month and refuses a later one; the monthly review
keeps every result. Monthly notes recorded before this release are not copied
into the log.

The recording account cannot approve its own work. Firm preparers can record
work and corrections; a separate firm owner or reviewer records review
conclusions with an independence attestation. The log does not prove actual
permissions, competence, evidence authenticity or operating effectiveness.
Exceptions need an owner and date, corrections require a later reperformance
before a no-exception conclusion, and reopening appends history instead of
erasing the earlier conclusion. No risk score changes as a result of logging.

Migration `0026_control_execution_log.sql` adds separate account/business-owned
storage. Account exports include owned logs, hard deletion cascades, and profile
or snapshot restoration cannot replace the history. Apply through the approved
release process before enabling the new code in a deployed environment.
See `docs/CONTROL_EVIDENCE_WORKFLOW.md` for boundaries and test instructions.

## Firm workspace

`/firm` is for an advisor (a CPA or bookkeeping firm) who runs the assessment
for several client businesses. It keeps the firm's own business: its people,
its clients, report versions, billing and the QuickBooks link. It also holds
Value proof and History (assessment snapshots) for the open business, which
the home page's Advanced menu links to. The Monthly review is a tab on each
business's own home page.

- **People at the firm**: the owner invites preparers and reviewers by email;
  the invitee joins with a Google sign-in or a confirmed email-and-password
  account under the invited address; members see the firm's clients and their
  saves reach the same records; a removed member's clients move to the owner's
  account; the owner can hand the firm to a member; only the owner deletes or
  restores a client.
- **Clients**: each client carries its engagement marks (started, map
  completed, report sent, open and accepted findings) and, on its Engagement
  block, the engagement itself: scope, period, preparer, reviewer and status.
  An ended engagement is read-only for the firm's members until the firm
  owner reopens it. "Download engagement archive" saves one HTML file built
  in the browser: the engagement, the monthly review log and every locked
  version's stored figures, each version printed as it was locked.
- **Client invitations**: a business owner invites their accountant's firm
  from "Your accountant" on Start here; the firm owner accepts at
  `/join/client/<token>`, and the business joins the firm's client list while
  staying the owner's. Either side ends the access ("End the firm's access",
  "Hand back to its owner"); the firm then loses the business and the
  versions it locked, and the owner keeps them.
- **Monthly review log** (the Monthly review tab): five checks per client per month (open the bank
  statement, read the cleared-check images, compare payroll to who still
  works there, review new vendors, read the company card statement line by
  line), each recorded as done, exception or skipped. The card statement
  check applies from October 2026; earlier months keep their four results. The log is append-only: a later result is a new row.
- **Report versions**: a sent report is a locked version with the profile as
  it was, the preparer, and the reviewer who reviewed it for issuance, with
  the firm's letterhead and the engagement's scope and period frozen into
  each version; a reviewed version can be shared by link. The preparer asks
  for review ("Ask for review": the engagement's reviewer, else the firm
  owner); a reviewer reviews it for issuance or returns it with a note
  ("Return to preparer"), and the preparer locks a new version. The weekly
  digest counts the versions awaiting each recipient's review.
- **Activity log**: who did what to the firm's file (named events, with each
  person's name as it was), insert-only in the database; the firm owner
  downloads it in Export data. Each entry is purged after the firm's
  retention period (7 to 15 years, 7 unless the firm owner picks another on
  the Firm page), which also keeps a deleted client that holds a locked
  version, unless its owner shared it with the firm.
- **Billing**: the fixed assessment and the Firm plan through Stripe
  Checkout when Stripe is configured: three tiers by client businesses
  (Starter 1–5, Practice 6–20, Firm 21–50), each monthly or yearly at ten
  months' price, paid by card or US bank account (ACH). A firm invoiced net 30
  is linked to its Stripe customer with `npm run link:stripe-customer` or on
  `/operator`. Without Stripe the firm records its stage by hand.
- **QuickBooks link** (read-only): reads the connected company's vendors and
  employees and compares them with the people on the duty map. An active
  employee-list record is not evidence that payroll paid that person; payment
  status stays "not checked" and the review asks for the covered period's
  payroll register. The response field `leftButStillPaid` retains its legacy
  name for existing clients, but contains only active employee-list records
  matching people marked left on the map.
- **Reminders**: a weekly email digest to advisors, off until the account
  turns it on, with a stop link in every digest, and a note to each client
  owner about what is due, sent by the scheduled job; each account can turn
  either off.

## Core loop

1. **Pick an industry** on first visit — loads a full demo template
2. **Map your business** — Process map → Build: replace demo processes with your own
3. **Score** residual risk from your team size and control posture
4. **Prioritize** with the weekly action plan, priority stack, and SoD matrix
5. **Brief** with Pioneer (user-initiated)
6. **Decide** — remediate, compensate, monitor, or accept residual on purpose

## Evidence library

Every loss figure in the app resolves to one of two things: a prosecuted case in `src/lib/precog/evidence/cases.ts`, or a published study in `src/lib/precog/evidence/benchmarks.ts`. Each case record carries the facts the source states (how it worked, the control gap, the loss, how long it ran, how it came to light, and, where stated, how long the person had served), the segregation-of-duties rules it demonstrates, the controls that would plausibly have caught it, and a direct link to the U.S. Attorney's Office or other government release. Where a source does not state a fact, the record says "unknown" rather than guess.

The tests in `src/lib/precog/evidence/` (`evidence.test.ts`, `provenance.test.ts`) check the library's invariants: every rule has at least one real case behind it, every citation is an https URL, every case is tied to a rule, every guidance chunk states its basis, and every stated tenure figure has its source in the record's text. They run with `npm test`.

The 0–100 scores elsewhere in the app are this app's own indices, and scenario figures are assumptions written into the scenario; the app says so wherever it shows one.

### Scoring weights and sensitivity

Residual scoring uses the inspectable, versioned tables in
`src/lib/precog/scoring/weights.ts`. The "What is still exposed" (Residual) tab shows the
current action band first, the weight descriptions, band cutoffs, and a deterministic
±20% weight-sensitivity range so you can see which conclusions are stable before acting.
A written, findable procedure lowers a know-how item's residual score; the scoring version is now
`precog-residual-v1.6.0`, so earlier journal snapshots are not directly comparable.
[docs/SCORING_1.6.md](docs/SCORING_1.6.md) lists what 1.6.0 changed, with each sample's
figures before and after.

## Develop, operate and verify

```bash
npm install
npm run dev          # live preview on port 8080
npm run build        # compile; on a production deploy, also apply migrations
npm run typecheck
npm run lint
npm test             # vitest: unit, domain and PGLite store tests, plus the scripts' own tests
npm run db:migrate   # apply pending migrations to DATABASE_URL now
```

Browser suites drive a running server (`npm run dev` for the first four) and
need Chromium once: `npx playwright install --with-deps chromium`.

```bash
npm run e2e:warmup        # wait until Vite has finished discovering dependencies
npm run e2e               # map builder: add a process, keyboard shortcuts, CSV import and undo
npm run e2e:enhancements  # insurance confirmation, map undo/redo, exception-first setup
npm run e2e:tabs          # every tab of every industry demo, plus /report, /login, /privacy,
                          # /terms, /welcome, /pricing, /firm, a bad /share and /share/report
                          # link and /join/client/not-a-real-token; fails on any page error
npm run e2e:safety        # signed sessions against the compiled build (see "Continuous integration")
npm run e2e:save-safety   # edits survive failed saves, on the compiled build (same setup)
```

Before asking for a merge, run `npm run verify`. It runs the format check,
typecheck, lint, unit tests, build and bundle budget in that order, and stops
at the first failure. `AGENTS.project.md` holds the repository rules.

`scripts/README.md` lists every script and the CI job that runs it.
`docs/OPERATIONS.md` holds the deploy, backup, monitoring and production
settings; `docs/SECURITY.md` says what Precog does to protect data and who
processes it; `docs/ACCOUNT_DATA_MODEL.md` describes what an account owns.

### Environment

`.env.example` names every variable the app reads, grouped by feature, with
what each one enables and what happens when it is empty: the database and
sign-in (required in production), the public app URL, the assistants and
their daily ceilings, the scheduled job (`CRON_SECRET`), reminder email
(Resend, with `RESEND_WEBHOOK_SECRET` for its bounce and complaint webhook,
so a bouncing or complaining address is not emailed again), billing
(Stripe, with a price id per tier and interval), the QuickBooks link, the
operator page (`PRECOG_OPERATOR_IDS`), error reporting (Sentry or a webhook)
and hosting outside Vercel. `scripts/deploy-config.test.mjs` fails
when the code reads a variable the file does not name.

### Database migrations

`migrations/*.sql` is the only schema source. `npm run build` runs
`scripts/migrate.mjs --only-on-production`: preview deploys, CI and local
builds leave the database alone, and a production deploy applies pending
files, refuses to finish without `DATABASE_URL`, a `BETTER_AUTH_SECRET` of 32
or more characters and an https `BETTER_AUTH_URL`, or with
`VITE_AUTH_ENABLED=false`, and warns in the build log when Google and X
sign-in lack their client and about each optional feature that is half
configured.
Support: the production build also refuses to finish without `SUPPORT_EMAIL`,
the mailbox shown as the Support link in the footer and on the Privacy and
Terms pages, and while `src/lib/precog/legal/operator.ts` still holds a
bracketed placeholder (legal name, address, governing law, the auth broker's
operator and the xAI data-policy link).
`npm run db:migrate` applies pending files on demand. The ledger
(`scripts/migrate-core.mjs`) applies each file once under an advisory lock;
`migrations/renamed.json` maps renumbered files to their old names so an older
database moves its ledger rows instead of re-applying. The live preview's
PGLite applies the same files at startup.

### Scheduled job

`vercel.json` calls `/api/cron/digest` every Monday at 13:00 UTC with
`CRON_SECRET` as a bearer token. The run emails the weekly reminders, purges
businesses deleted more than 30 days ago (a firm's client that holds a locked
report version, unless its owner shared it with the firm, waits for the firm's
retention period), model-call records older than 13 months, activity-log
entries past their firm's retention period, and share view and failed
passcode-guess logs past their retention, re-reads QuickBooks connections
older than 28 days, emails the firm owner once per QuickBooks problem, and
counts the week's first-time milestones.
The digest, QuickBooks and alert stages each stop at a deadline inside the
300 seconds; the answer then says `partial: true` and the next run picks up
the rest. Without `CRON_SECRET` every run is refused and none of
this happens; a production build warns about it. The function may run for 300
seconds; other functions 60 (`vite.config.ts`, checked by `check:functions`
after each build).

### Continuous integration

`.github/workflows/ci.yml` runs five jobs on every pull request and every push
to `main`; the release gate passes only when the other four pass.

- **Typecheck, lint, test, build**: typecheck, lint, `npm test`, formatting,
  the production dependency audit, the build, its bundle budget
  (`check:bundle`), its security headers (`check:headers`) and its function
  time limits (`check:functions`). Each check runs even when an earlier one
  fails, so one run reports every problem.
- **Migrations against real Postgres**: applies every migration twice, then
  `test:postgres:migrations` (two simultaneous runners, lock timeout, rollback
  and retry), `test:postgres:quota` (the daily model budget under 64 parallel
  requests), `test:postgres:lifecycle` (the business lifecycle on up to
  eight connections), `test:postgres:evidence` (control evidence on
  concurrent connections) and `test:postgres:races` (every other
  `*.postgres.test.ts`: account deletion, Firm billing order, membership,
  plan limits and share revocation on concurrent connections).
- **Builder end-to-end smoke**: the dev server, then `e2e:warmup`, `e2e`,
  `e2e:enhancements` and `e2e:tabs`.
- **Authenticated compiled-server safety**: the production build served by
  `scripts/serve-built-test.mjs` against a disposable `precog_safety_e2e`
  database; `e2e:safety` signs in two real Better Auth test sessions and checks
  account boundaries (see `docs/ACCOUNT_DATA_MODEL.md`), `e2e:save-safety`
  checks that edits survive a failed account load, a save meeting a newer
  release, a refused business list and full browser storage, then
  `e2e:evidence` runs the control evidence workflow and `e2e:tabs` walks every
  tab on the compiled build. To run it locally, set
  `PRECOG_AUTH_TEST=1`, `DATABASE_URL` to a local `precog_safety_e2e`
  database, `BETTER_AUTH_URL=http://localhost:8080` and a 32-character
  `BETTER_AUTH_SECRET`, then `npm run db:migrate`, `npm run build`,
  `node scripts/serve-built-test.mjs`, `npm run e2e:safety` and
  `npm run e2e:save-safety`.
- **Release gate**: requires the four jobs above.

A newer push to a pull request cancels its older run; pushes to `main` never
cancel each other. Actions are pinned to commits, and `.github/dependabot.yml`
keeps them and the npm packages current (minor and patch versions only).
A successful production deploy is tagged `deploy-<utc time>-<12-char sha>` by
`.github/workflows/tag-deploy.yml`; the suffix is the release id in error
reports (`docs/OPERATIONS.md`, "Release tags").

### Pinned dependencies

The project runs on Node 22 (`engines` in `package.json`; CI reads `.nvmrc`, and the
quota check needs `--experimental-strip-types`, Node 22.6 or later). Both
version pins came with the app template: `nitro` is pinned to a beta because
Nitro 3 has no stable release yet, and `overrides` holds `nf3` (Nitro's file
tracer) at exactly 0.3.17 although Nitro accepts any 0.3.x from 0.3.17. Try
removing the override on the next Nitro upgrade.

### How the app behaves

Grok calls require a signed-in user and are rate-limited to 10/min per user, 120/min per process, and 30/min per IP for any LLM call. Logged-out users get the deterministic local brief. Grok calls time out after 20 seconds and fall back locally. The limiters are in-process memory: on serverless hosting each instance counts separately, so treat them as cost control, not abuse control; put a platform-level limit (Vercel Firewall, Cloudflare) in front for the latter. Pioneer now accepts only a strict JSON selection of complete rules-authored statement IDs from Grok. The application renders their original action and rationale, preserves the full rules brief and warnings, and rejects free-form prose, unknown IDs, or extra fields. Matching a number is not proof of its meaning. This deliberately replaces free-form model rewriting; it does not establish that the underlying rule or business record is correct. Other model-assisted features retain their separate validation paths. See `docs/CONTROL_ACCURACY_2026-09-29.md` for scope and limitations.

Team CSV imports use the columns `name`, `role`, `tenure_years`, `active`, and `entitlements`. With an imported team, active headcount, known-tenure averages, and segregation health are derived from the team's duties; the segregation slider remains available as an explicit manual override. Re-importing matches rows to the current team by name (case and punctuation ignored), so who-knows-what assignments and process ownership carry over; anyone missing from the file is removed and the import notes what left with them.

The process map (How work flows) has a **Spreadsheet** panel in Build mode that exports the processes as CSV with the columns `process`, `stage`, `description`, `owners`, `depends on`, `controls`, `cadence`, `systems`, `documented`, `procedure location`, `inputs`, `outputs` (lists separated by `;`; an item that contains `;` or `|` is wrapped in double quotes), and imports the same shape back. Rows are matched to existing processes by name, so a matched row keeps its id, risks, ideas and evidence and only the columns present in the file change; new names become new processes, and a checkbox on the preview removes processes the file no longer lists. Owners, dependencies and controls are matched by name as well, and anything that does not resolve is reported per row before you apply. Each process also carries a **Continuity record** (how often it runs, the systems it lives in, whether a written procedure exists and where), which the map health score counts under "Written down" and Pioneer reads through `get_process_records` when asked who could cover a process. In Build mode the arrow keys step between processes (left/right by stage, up/down within a stage), `F` frames the selection with its risks and controls, `Enter` jumps to the name field, `Shift+A` re-arranges every process into its stage lane, and `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo.

The continuity register (Who knows what) imports and exports a spreadsheet with the columns `item`, `kind` (duty / task / know-how), `criticality` (critical / important / nice-to-have), `documented`, `procedure location` (where the written procedure lives — drive path, binder, link), `last confirmed` (re-confirm items after 90 days), `description`, followed by one column per active team member holding that person's level: `expert`, `can do`, `learning`, `aware`, or blank, then a `precog id` column. Rows match existing items by that id, or by name when a file has no id, and keep their id and process links, so two items whose names differ only in punctuation or case stay apart. An import into your own register changes only the items the file names; the rest keep their marks; columns for people not on the active team are skipped and reported. "Blank template" downloads the grid with the current team as columns.
Pioneer and the Start here also surface the confirmed-recently figure once you enter your own register. Re-confirmation is organised as a check-in per person: the "Confirm it's still true" card groups stale items by who holds them, so one conversation covers everything the register says that person can do (still does it / level changed / no longer), with a separate list for stale items nobody on the active team holds. The weekly action plan, printed report and Pioneer (`get_register_checkins`) advise in the same terms — "check in with Maya: 5 entries, 2 nobody else can run alone" — rather than item by item, and Start here names the next person to sit down with. When a check-in takes someone off an item or drops them below "can do it alone", a "What this check-in changed" card lists every item whose coverage got worse, who is left, and the cross-training move that repairs it, loggable as a decision.
Share links can hide people's names while keeping roles, optionally require a passcode, and record a small view log for the owner.

Pages that need no sign-in: `/welcome` (the landing page a first-time visitor with no business is sent to), `/pricing` (the Assessment and the Firm plan, with what free includes), `/login`, `/privacy`, `/terms`, `/share/<token>` (a shared map), `/share/report/<token>` (a shared locked report version) and `/join/client/<token>` (a business owner's invitation to a firm; it names the business before sign-in, and the firm owner signs in to accept). `/operator` is the page of Precog's operator: it answers as an unknown page to anyone whose user id is not in `PRECOG_OPERATOR_IDS` (see `docs/OPERATIONS.md`, "Operator").

## Demo data

Eight industry templates ship with demo processes, people, knowledge graphs, controls, and scenarios:

- **Dental** — Ridgeview Family Dental (default)
- **Retail** — Harbor Lane Boutique
- **Restaurant** — Ember & Oak Kitchen
- **Professional services** — Northgate Advisory Group
- **Construction** — Summit Ridge Builders
- **Auto dealership / repair shop** — Millbrook Auto & Service
- **Nonprofit** — Riverbend Community Alliance
- **General SMB** — Main Street Business Co.

Switch industry in **Business profile** to load the full template (process map, SoD, scenarios, dual-release defaults). A business belongs to one industry: once you have entered your own team, register, leave or processes, the switch spells out what it would discard and offers to keep the business as it is and add the new industry as a second business (the header switcher moves between them) instead of replacing it.

Educational tool only — not actuarial, legal, or forensic advice. The cases describe other organizations, not yours, and are prosecuted cases, so they skew large and late. Never scores people as fraudulent; targets are control gaps and residual exposures.

## Product strategy

See [`docs/COMMERCIAL_ASSESSMENT.md`](docs/COMMERCIAL_ASSESSMENT.md) for the competitive landscape, market wedge, avoided-cost measurement framework, commercialization requirements, and explicit go/no-go gates.
