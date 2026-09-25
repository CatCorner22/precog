# Launch readiness review

**Date:** 2026-09-22
**Head reviewed:** `main` at the merge of PR #80, plus the evidence commits on PR #81.
**Method:** five parallel read-only reviewers (architecture and performance; security and data protection; product and UX; tests, CI and operations; domain content), each working from the same brief, followed by a stress test I ran myself against a production build. Every finding below carries a file and line so you can check it. The stress-test figures are my own measurements.

## 1. Verdict

The product has a real, defensible core: a duty-conflict engine, a continuity engine, and a library of 50 prosecuted cases tied to the specific arrangement an owner has. No peer sells that combination to a small-business owner at a small-business price. It is not ready to sell yet. Eight gates stand between the current build and a commercial launch. None is large. Together they are about three to four weeks of focused work for one engineer plus copy and legal review.

The gates, in the order to do them:

| #   | Gate                                                                                                                                                                                                                                                                                           | Why it blocks a sale                                                                                                 | Effort                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | An owner cannot enter their own business from onboarding; the only path loads a fictional demo                                                                                                                                                                                                 | The first five minutes never reach the buyer's own team                                                              | 3 days                   |
| 2   | No privacy policy, terms, data-handling statement (local, synced, sent to the AI model), support contact, account deletion, or full export                                                                                                                                                     | You store employee names and control weaknesses; a CPA will ask; regulators can                                      | 2 days plus legal review |
| 3   | Numbers presented as facts that are the app's own assumptions: "carrier credit applied", 5 percent-of-revenue exposure arithmetic, ACFE medians used as multipliers on author-written losses, Value proof showing a negative return on default inputs, "p50" labels on hand-written day counts | The product's promise is that every number is sourced or labelled; these break it in front of the professional buyer | 2 days                   |
| 4   | Share-link passcode brute force is limited only in per-instance memory, and four-character passcodes are allowed                                                                                                                                                                               | A leaked link with a PIN exposes staff names and control gaps                                                        | 1 day                    |
| 5   | A production deploy with a missing database URL or auth secret starts silently on an in-memory database with a random secret, and the built bundle then crashes on the missing PGLite assets                                                                                                   | Every request fails with an unrelated error; data written before a cold start vanishes                               | Half a day               |
| 6   | No error reporting, no server failure logging, no health endpoint                                                                                                                                                                                                                              | You will learn about breakage from support email                                                                     | 1 day                    |
| 7   | Operating blueprint is hard-coded to dental; dual-release sample exceptions carry no "sample" badge                                                                                                                                                                                            | A restaurant owner or their CPA concludes the whole product is generic                                               | 1 day                    |
| 8   | Performance cliff between 35 and 60 people on the continuity register; every keystroke serialises the whole profile                                                                                                                                                                            | A 40-person group or an advisor with several clients hits a frozen tab                                               | 2 days                   |

## 2. Peers and positioning

Prices below come from the vendors' own pages or from third-party pricing summaries found during this review, and are marked as such. Quote-based enterprise pricing is unverifiable; the ranges are third-party estimates.

| Category                                  | Examples                                                                       | Price signal                                                                                               | What they do that Precog does not                                                                      | What Precog does that they do not                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Dental embezzlement services              | Prosperident                                                                   | "First Look" $1,500 flat; risk questionnaire $139; advisory engagements scoped per practice (vendor pages) | Investigate an actual theft; 35 years of dental-specific casework and reputation                       | Continuous self-service model of who holds what, continuity, case-matched recommendations, at a monthly price; every industry, not only dental |
| Enterprise segregation-of-duties tools    | Pathlock, Fastpath, SafePaaS                                                   | Quote-based; third-party estimates of $150 per user per month or $300k to $700k per year                   | Live connectors into ERP and identity systems; certification campaigns; audit-grade evidence retention | Plain-language model a small owner can build in an hour; prosecuted-case grounding; continuity planning                                        |
| Governance, risk and compliance platforms | AuditBoard, Diligent One                                                       | Third-party estimates $40k to $200k per year, no self-service tier                                         | Full audit workflow, controls testing, SOX support                                                     | Everything above, at a price a 12-person business can pay                                                                                      |
| Payment-approval tools                    | Bill.com, Ramp, Melio                                                          | Free to about $45 per user per month; Bill.com offers dual control on vendor bank changes                  | Enforce the control at the point of payment                                                            | Show which controls matter for this team and what happened to businesses like it; Precog should recommend these tools by name                  |
| Procedure and cross-training tools        | Trainual, Whale                                                                | Trainual about $249 to $399 per month plus $1,000 setup; Whale $99 to $299 per month, free to five users   | Store and assign written procedures, quizzes, completion tracking                                      | Decide which procedures matter because a named person is the only holder; Precog should link out to them for the writing                       |
| Business-continuity software              | Quantivate, Riskonnect, Castellan                                              | Enterprise, quote-based                                                                                    | Enterprise crisis management and impact analysis                                                       | Key-person continuity for a small team with a "who is out today" cover sheet                                                                   |
| Dental analytics                          | Dental Intelligence, Practice by Numbers (see `docs/COMMERCIAL_ASSESSMENT.md`) | Subscription per practice                                                                                  | Live practice-management data and benchmarks                                                           | Who can cause or conceal a loss, and what evidence should exist                                                                                |
| Substitutes                               | CPA checklists, QuickBooks bank feeds and audit log, insurer questionnaires    | Free or bundled                                                                                            | Already trusted and budgeted                                                                           | Consistency, a living model, and the case library; Precog must make the CPA faster, not replace them                                           |

**Where the gap is.** Between a $1,500 one-off investigation service and a $40,000-a-year enterprise platform there is no owner-facing product that answers, for one small team: who holds duties that let one person take and hide money, who cannot be absent, and what happened to businesses arranged the same way. Precog's case library and engines answer exactly that.

**Pricing suggestion (an assumption to test, not a finding).** An owner plan at $49 to $99 per month per business, an advisor plan at $199 to $399 per month covering ten client businesses with a branded report, and a one-off "assessment report" at $500 to $1,500 sold through CPAs. The advisor plan mirrors the Trainual and Whale bands that small-business buyers already accept, and the assessment undercuts Prosperident's First Look while covering every industry.

## 3. Stress test

### 3.1 Production HTTP throughput

Built with the Vercel preset and served locally through a Node adapter on one process. Vercel runs many function instances, so these are per-instance floors, not ceilings. Zero errors in every run.

| Route                       | Connections | Requests per second | Latency p50 | Latency p99 |
| --------------------------- | ----------- | ------------------- | ----------- | ----------- |
| `/` (server-rendered shell) | 50          | 743                 | 37 ms       | 83 ms       |
| `/report`                   | 50          | 1,113               | 41 ms       | 62 ms       |
| `/api/auth/get-session`     | 50          | 975                 | 44 ms       | 80 ms       |
| `/share/<token>`            | 50          | 1,104               | 41 ms       | 62 ms       |
| `/`                         | 200         | 951                 | 195 ms      | 258 ms      |

### 3.2 Production page load in a real browser

Cold load of the production build over the local adapter: time to first byte 272 ms, first contentful paint 376 ms, load event 2.6 s, 56 requests, 961 KB transferred. Ten visitors landing at once completed in 2.6 s total. Tab switches on the dental demo took 50 to 162 ms. No console or page errors.

### 3.3 Register size (the real limit)

Synthetic profiles loaded into the browser against the dev server (unminified, so absolute times are pessimistic; the shape of the curve is what matters). Zero errors at every size.

| Register                            | Reload | Dashboard tab | Who knows what          | What could happen | JS heap |
| ----------------------------------- | ------ | ------------- | ----------------------- | ----------------- | ------- |
| 20 people, 100 items, 134 relations | 1.6 s  | 0.8 s         | responsive              | responsive        | 99 MB   |
| 35 people, 200 items, 267 relations | 2.8 s  | 2.2 s         | responsive              | responsive        | 308 MB  |
| 60 people, 300 items, 400 relations | 7.5 s  | 6.5 s         | 9.0 s main-thread stall | 10.1 s            | 245 MB  |

The cliff sits between 35 and 60 people. The causes are known (`src/lib/precog/continuity/coverage.ts:353` runs a linear relation search inside a people-by-items loop for every report, and `src/components/precog/continuity-planner.tsx:777` renders one select element per person-by-item cell, about 18,000 at the largest size). The fix is a relation map built once per report and a virtualised grid. Until then, cap the register at 30 people and 150 items with a message, so no buyer meets the cliff.

### 3.4 Failure found during the test

A production build started without `DATABASE_URL` tries to bootstrap the in-memory PGLite fallback at import (`src/lib/db.ts`), cannot find `pglite.data` and `initdb.wasm` in the bundle, and the unhandled rejection kills the process. On Vercel every invocation would fail with a file-not-found error unrelated to the real cause. The build should refuse to complete in production without `DATABASE_URL` and `BETTER_AUTH_SECRET`, with a plain message.

## 4. Findings by area

Each item names the reviewer's evidence. P0 items are the launch gates above; P1 should follow within the first month; P2 is backlog.

### 4.1 Security and data protection

- **P0** Share passcode brute force: `SlidingWindowLimiter` is a per-process map keyed on the first `x-forwarded-for` entry (`src/lib/precog/builder/share-server.ts:68-198`, `src/lib/request-ip.server.ts:6`); four-character passcodes pass validation; synchronous scrypt blocks the event loop on every guess. Fix: persist attempts per token in Postgres with lockout, require eight or more characters, use asynchronous scrypt, read `x-real-ip` first.
- **P0** No account deletion, no full export, no privacy or terms route; `map_shares` and `map_share_views` rows are never purged (`src/lib/auth/gates.tsx`, `src/routes/`). Fix: a delete-account server function that cascades, an export-everything function, a 90-day purge of view logs, `/privacy` and `/terms` linked from the login page and a footer.
- **P1** Prompt injection: staff names, notes and decision text are embedded verbatim in model prompts (`src/lib/precog/llm/agent-loop.ts:1013`, `builder/suggest-server.ts:75`, `review-server.ts:32`). Output is rendered as text, so the impact is misleading advice. Fix: delimit user text and state in the system prompt that it is data.
- **P1** Model cost caps are per minute, per instance, with no daily ceiling (`src/lib/precog/llm/guard.server.ts:23`, `rate-limit.ts:52`). Fix: a persisted daily counter per user and a global daily ceiling.
- **P1** No HTTP security headers (no `vercel.json`, no route rules). Fix: `Content-Security-Policy: frame-ancestors 'self'`, `Referrer-Policy`, `X-Content-Type-Options`, HSTS.
- **P2** Error messages forwarded verbatim (`coach/pioneer-server.ts:115`); no per-user cap on business count or live shares; share loader distinguishes missing, revoked and expired; two high-severity build-time dependency advisories that `npm audit fix` resolves.
- Verified sound: every server function that touches user data applies `authMiddleware` and scopes by the verified user id; SQL is parameterised; no secret reaches the client bundle; session cookies are `__Host-`, Secure and Lax; share tokens carry 144 bits of entropy; passcodes are scrypt-hashed with a salt and compared in constant time; the shared preview client secret is server-only.

### 4.2 Operations, tests and CI

- **P0** No error reporting, no structured server logging, no health endpoint; the model call's failures are swallowed (`src/lib/precog/llm/agent-loop.ts:1101`). Fix: an error-reporting SDK on client and server, `console.error` in every server-function catch, `/api/health` running `select 1`, an external uptime check.
- **P0** Production environment guard (see 3.4). Fix: fail `scripts/migrate.mjs` when `VERCEL_ENV=production` and either variable is missing; ship a `.env.example`.
- **P1** Hard deletes with no revision history or restore (`src/lib/precog/business-store.ts:196`). Fix: confirm Neon point-in-time recovery of seven days or more; add a history table written on update and delete; add whole-profile export and import.
- **P1** Migrations run inside the build with no rollback; duplicate numeric prefixes (`0002`, `0003`, `0004`). Fix: renumber, keep migrations additive, document rollback as redeploy plus forward fix.
- **P1** Client crash handling: the root error component has no reload, no "clear local data", no reporting; a crash in the provider blanks the app (`src/lib/error-component.tsx`, `src/routes/__root.tsx`).
- **P1** Ten highest-value missing tests (sign-in merge both branches, debounced save and flush, save conflict without pointer write, schema forward-compatibility, snapshot limits, share loader matrix, model fallback and grounding, migration failure mid-file, route smoke per industry with corrupt storage). About three days.
- **P1** CI additions: `prettier --check`, migrations against a real Postgres service twice, `npm audit --omit=dev --audit-level=high`, end-to-end against the built output, a bundle budget, and Vercel "require checks" on the production branch. Note: both codex pull requests this week merged with every conflict hunk kept twice, which broke `main`; required checks would have stopped both.
- **P2** No release tags, changelog or feature flags; session expiry mid-session shows an error badge with no re-sign-in prompt.

### 4.3 Product and user experience

- **P0** Onboarding offers only "Load <industry> demo" (`src/components/precog/industry-onboarding.tsx:98`); "Enter your own team" lands on the process-map view headed "Vision systems online / Risk Predator" (`process-map.tsx:937-969`). Fix: onboarding asks business name, industry, headcount and who does eight core duties, and lands on Start here with the owner's own names; the demo becomes a secondary link.
- **P0** Value proof shows "Net observed value -$3,640, ROI -30%" on first open from default assumptions (`value-proof-center.tsx:120-140`, `src/lib/precog/value-case.ts`). Fix: empty state until the owner enters one observation; never compute a return from defaults.
- **P0** Operating blueprint is dental-only under every industry (`operating-blueprint.tsx:39`, `src/lib/precog/operating-blueprint.ts:22`). Sample dual-release exceptions load without a "sample" badge (`src/lib/precog/controls/dual-release.ts:317`).
- **P1** Fifteen tabs, twelve of them views of the same six inputs. Proposed six: Overview; My business (the input surface); Duty conflicts; If someone is out; What it could cost; Advisor and reports. One tab per owner question, inputs separated from outputs, framework views behind "Advanced".
- **P1** Jargon on owner screens despite Plain mode: "residual", "SoD", "COSO", "SPOF", "CoR", "p50", "entitlement", and the film-themed copy ("Risk Predator", "T-1000", "WHITE HOT", "RULES OF ENGAGEMENT") in `src/routes/index.tsx:521-795`, `sod-panel.tsx:69`, `process-map.tsx:946-1349`, `threat.tsx`. A CPA audience reads the theme as unserious. Fix: extend the plain-language switch to body copy; retire the theme or confine it to Tactical mode.
- **P1** Mobile at 390 px: Dashboard and process map force horizontal scroll; the save-state badge is hidden on phones (`index.tsx:434-455`).
- **P1** The printed report needs a cover block (business, preparer, date, scope and limitations up front), a two-page executive version, cases moved to an appendix, and page breaks (`control-report.tsx`).
- **P1** Accessibility: the tab strip is fifteen plain buttons with no tablist role or arrow-key navigation and no skip link (`index.tsx:213-221, 462-491`); Escape on the onboarding dialog silently loads the dental demo.
- **P1** The login page states no value proposition and no price.

### 4.4 Domain content (what a CPA or fraud examiner will challenge)

- **P0** Invented insurer discounts presented as carrier facts: "Typical carrier credit" defaults of 3 to 8 percent and "carrier credit applied" strings (`src/lib/precog/scoring/dynamic-variables.ts:75-94, 386-424`, `cascade-panel.tsx:38`). Crime policies are underwritten case by case. Fix: default to zero, label "credit from your own quote".
- **P0** ACFE medians used as multipliers on author-written base losses, then printed beside the result (`src/lib/precog/engine.ts:101-204`, `templates/shared-controls.ts:118-186`). Fix: remove the multiplier; show ACFE figures only in a separate reference box with page citations.
- **P0** "5 percent of revenue" applied to one business as an exposure estimate (`src/lib/precog/evidence/benchmarks.ts:94-105`). ACFE presents it as an opinion of aggregate loss. Fix: delete the arithmetic.
- **P0** Value proof default probability and exposure printed in the memo as if measured (`src/lib/precog/value-case.ts:17-27`).
- **P1** Benchmark figures duplicated in two files and attributed to the 2026 ACFE report without page references; add page and figure numbers and a test that both files agree.
- **P1** Family-matrix false positives in a three-person office: every cashier is flagged for "take payment plus prepare deposit", and the owner is flagged for approving write-offs while administering the system (`src/lib/precog/sod/detect.ts:258-263, 416`). Fix: drop same-family custody pairing, suppress family findings when a named rule already covers the person, exempt the owner-as-administrator pattern.
- **P1** `segregationHealth` floors at 5 of 100 for every demo, so it cannot show improvement (`detect.ts:551-558`).
- **P1** Missing conflict rules a CPA expects: payroll master-file change versus payroll run; journal entry versus bank reconciliation; post payments plus post adjustments (the lapping cover); inventory receive, adjust and count; access provisioning versus access approval; sign checks plus reconcile. `rule-vendor-approve-pay` should be high severity.
- **P1** Dental vocabulary in every industry's rule labels and role templates ("patient refunds", "PMS admin", "export PHI") (`conflict-rules.ts`, `detect.ts:108-171`). Only five industry templates exist; construction, trades, nonprofit and medical are case tags without processes or roles.
- **P1** Control catalogue gaps: ACH debit block or filter, check-stock custody, void and credit-memo approval, vendor master change log, monthly close checklist, budget-to-actual review, payroll-tax remittance verification, multi-factor authentication on banking, same-day access removal, petty-cash count, crime-insurance review.
- **P1** "Cases this control would have stopped" is the author's assessment, and 35 of 50 cases record detection as unknown; say "in our assessment" and show the unknown share.
- **P1** Percentile labels on hand-written day counts ("p50 90d") imply a distribution (`scenario-runner.tsx:186`, `scenario-compare.tsx:422`); Benford and round-number tests run on price-list data, which the method excludes (`stats/forensic-suite.ts:40-118`).
- **P1** Two corpus chunks over-reach under a "cited" badge (COSO does not prescribe review cadences or written residual-risk acceptance); split them into practice chunks. "Audit-ready evidence" and "bonded" appear where "documented" and "insured under a fidelity bond" are accurate.
- **P1** Template realism: restaurant head server prepares the deposit and there is no cash-tip or sales-tax process; retail bookkeeper creates vendors, releases payment and approves write-offs; professional-services trust accounting cannot be modelled; the general template has no journal-entry process; all non-dental fraud statistics are identical.

### 4.5 Architecture and performance

Measured first-load client JavaScript: about 900 KB raw, 275 KB gzipped across 53 files; all client JavaScript 2.0 MB raw, 610 KB gzipped. Database drivers do not reach the client. Thirteen of fifteen tabs are lazy-loaded.

- **P0** Every keystroke serialises the whole profile to localStorage and re-parses the whole portfolio (`src/lib/precog/practice-context.tsx:414-441, 870-888`). Fix: move the local save into the existing debounce; key the business list on a version counter.
- **P0** Register scaling (see 3.3).
- **P1** One context re-renders 29 components and the same engines run four to five times per edit (`practice-context.tsx:986-1073`, `routes/index.tsx:387-430`, `weekly-action-plan-data.ts:159`, `start-here.tsx:105`). Fix: split state and actions contexts; one memoised derived-data hook.
- **P1** The entry chunk carries all five industry templates and the dual-release engine; the 131 KB case library loads on first paint. Fix: dynamic import per industry; a case-library hook backed by `import()`; group the 35 icon micro-chunks.
- **P1** The app renders twice at boot, once against the default profile (`routes/index.tsx:145-149`). Fix: gate on hydrated and ready.
- **P1** Serverless database pools: two unbounded pools per instance (`src/lib/db.ts:94`, `src/lib/auth/server.ts:142`). Fix: one shared pool, `max: 3`, the pooled Neon host.
- **P1** List endpoints select whole JSON blobs to compute a count (`profile-server.ts:181-189`, `snapshots.ts:151-157`); the save path writes the profile twice; snapshots cap at 128 KB while profiles allow 2 MB and drop the register fields (`snapshots.ts:14, 104-121`).

## 5. Upgrades that would make the product sell

Ordered by expected effect on a CPA or owner deciding to pay.

1. **Own-team onboarding in ten minutes.** Name, industry, headcount, and a grid of eight duties by person. Start here then reads with the owner's names and three prosecuted cases that match their arrangement. This is the gate and the demo.
2. **Actual-versus-modelled import.** Read-only import of vendors, employees and user lists from QuickBooks Online and Xero (both have public APIs) to check the model against reality. The existing commercial assessment ranks this the top missing capability; it is also the single strongest reason an advisor would pay monthly instead of once.
3. **The owner's twenty minutes a month.** A checklist generated from the register: open the bank statement, read cleared-check images, compare payroll to headcount, review card lines. Each item links to the case that shows why. Evidence capture (a checkbox with a date) becomes the audit trail the existing assessment says is missing.
4. **Advisor workspace.** The business switcher already exists. Add a firm name on the report, a client list with last-review dates, and review-date reminders by email. This is the $199 to $399 plan.
5. **Insurer-ready packet.** Crime-policy applications ask the questions this app already answers (dual control, reconciliation independence, background checks). A one-click packet with the owner's answers and the register behind them is a concrete reason to subscribe before renewal.
6. **Per-industry blueprints and vocabulary.** Finish the four industries that exist only as case tags, and replace dental terms in the rule labels.
7. **Public case pages.** Each of the 50 cases as a public page ("what happened, what would have caught it") is honest marketing and search traffic; the library is already written.
8. **Named tool recommendations.** Where the app recommends dual release or written procedures, name Bill.com dual control, Ramp approvals, Trainual or Whale. Owners want the next click.

## 6. What I did not do

- I did not run the load test on Vercel itself; the figures are from one local Node process serving the Vercel build.
- I did not verify the 2026 ACFE report figures against the report; the site is not reachable from this environment. The domain reviewer flagged that they differ from the 2024 edition.
- I did not measure real users. Everything in the product section is a reviewer's judgement of the first-run path, backed by screenshots under `screenshots/review-*.png`.
