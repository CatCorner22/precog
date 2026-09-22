# Repository review

Reviewed: 2026-09-22

## Fresh assessment

Precog has evolved from a dashboard prototype into a credible control-design
workbench. Its strongest assets are the dental-specific responsibility ontology,
the deterministic SoD and continuity engines, the four-category control-action
catalog, assessment snapshots, and the separation of observed value from modeled
avoided loss. The code is generally modular below the UI layer, and authenticated
snapshot queries are parameterized and scoped to the verified user.

The product is not yet a production control system. Most operating evidence,
assignments, and value records remain browser-local until a user deliberately
saves a snapshot. There is no actual-versus-approved access feed, recurring
certification campaign, immutable activity history, evidence request workflow,
or multi-practice advisor tenancy. The current UI can therefore support an
assessment, workshop, or advisory engagement, but it cannot yet substantiate
that controls operated continuously.

## Bugs corrected during this review

1. **Malformed nested profile data could enter scoring.** Profile normalization
   previously shallow-merged `staff` and `riskVariables`. A malformed import or
   stored snapshot could therefore replace numeric or Boolean fields with strings,
   out-of-range values, or non-finite numbers. Normalization now type-checks every
   staff field, clamps numeric values, and applies the risk-variable catalog's
   published bounds before data reaches analysis.
2. **A corrupt browser value could break snapshot comparison.** Snapshot save
   already ignored malformed browser state, but comparison parsed three storage
   values without a local error boundary. Comparison now removes the corrupt key
   and falls back to normalized defaults instead of failing the whole action.
3. **Regression coverage now exercises hostile nested profile values.** The
   domain suite verifies fallback behavior, numeric caps, and Boolean preservation.

## Prioritized findings

### P0 — required before relying on the product as a system of record

1. **Normalize the complete dual-release policy at the trust boundary.** Rules
   and exceptions are currently merged after only container-level checks. Add an
   allow-listed normalizer for channels, actions, thresholds, roles, dates, and
   approver IDs; reject duplicate exception IDs and impossible date ranges.
2. **Make snapshot quotas concurrency-safe.** The current count-then-insert flow
   can exceed 50 records under simultaneous requests. Enforce the limit inside a
   transaction with a per-user lock, or replace the hard quota with deterministic
   oldest-record retention.
3. **Persist governed working state continuously.** Local storage is neither an
   audit log nor a multi-device source of truth. Store draft and accepted Power
   Map baselines, value evidence, reviewer decisions, and change history on the
   server with optimistic concurrency and actor/timestamp metadata.
4. **Add immutable audit events.** Snapshot creation and deletion, assignment
   baseline acceptance, imports, remediation application, and evidence verification
   need append-only events. Destructive operations should retain tombstone metadata.

### P1 — commercial workflow and evidence

1. **Add control-owner workflows.** Introduce evidence requests, due dates,
   preparer and reviewer roles, conclusions, exceptions, remediation owners, and
   approval history. A catalog says what could be done; customers pay for proof
   that the selected control actually operated.
2. **Add actual-versus-approved access reconciliation.** Start with CSV imports
   for PMS, banking, payroll, accounting, and identity systems before building
   direct connectors. Map imported permissions to the entitlement ontology and
   explicitly queue unmatched permissions for review.
3. **Add recurring certifications.** Support quarterly campaigns, scoped reviewer
   assignments, reminders, attestations, delegation, escalation, and comparison
   with the prior certification.
4. **Add multi-practice advisor tenancy.** Advisors need portfolios, reusable
   templates, location rollups, inherited policies, client isolation, and a clear
   switch between advisor and client roles.
5. **Version the ontology separately from application releases.** Entitlements,
   conflict rules, control measures, and job templates need effective dates,
   editorial approval, change notes, and migration behavior for saved models.

### P2 — usability, accessibility, and engineering quality

1. **Split oversized components.** `power-map-builder.tsx`,
   `assessment-snapshots.tsx`, and the home route combine state orchestration,
   storage, exports, and dense presentation. Extract feature hooks and focused
   panels before adding more workflows.
2. **Replace custom tab buttons with route state or URL search state.** Refreshing
   or sharing the app currently loses the selected workspace and investigation
   context. Deep-linkable tabs would also improve browser history and support.
3. **Create real browser acceptance tests.** Cover keyboard navigation, map/matrix
   switching, assignment preview and undo, snapshot restore and comparison,
   corrupted local state, narrow viewports, reduced motion, and accessible names.
4. **Add error and performance observability.** Capture anonymized feature errors,
   server-function latency, database failures, optional AI cost/latency, and large
   model render times without logging patient or practice-sensitive content.
5. **Virtualize large matrices.** The responsibility and control-action tables
   render every visible cell. Virtualization or progressive disclosure will be
   needed once customers add many people, locations, or custom duties.

## Recommended delivery sequence

1. Dual-release normalization, concurrency-safe snapshot writes, and audit events.
2. Server-backed drafts plus evidence/reviewer workflow.
3. CSV access reconciliation and quarterly certifications.
4. Multi-practice advisor portfolio and reusable policy templates.
5. Browser accessibility suite, deep-linkable workspaces, and component splits.
6. Direct connectors only after CSV pilots establish the permission mappings and
   recurring workflow customers will pay to maintain.

## Success criteria for the next release

- A malformed import cannot place an invalid value into any scoring or approval
  engine.
- Every accepted assignment change identifies actor, reviewer, time, rationale,
  and resulting SoD/continuity movement.
- A reviewer can request, receive, conclude on, and retain evidence for a selected
  control without leaving Precog.
- A prior certification can be compared with the current one, including access
  additions, removals, unresolved exceptions, and overdue remediation.
- The core signed-in journey passes automated keyboard, accessibility, restore,
  and authorization-isolation tests.
  Reviewed: 2026-09-18

## Executive assessment

Precog Pioneer has a broad and coherent decision-support domain: residual-risk
scoring, segregation-of-duties checks, scenario analysis, COSO mapping,
knowledge continuity, and a tool-grounded coaching layer. The main product risk
was not missing functionality but release integrity. The checked-in home route
was a one-line artifact reference, the new threat-scoring module imported from
the wrong directory level, and the restart script launched from the parent
workspace. Together those defects prevented a clean typecheck/build and could
leave the preview unavailable after a restart. They are repaired in the review
commit.

## Findings and actions

### P0 — release blockers (fixed)

- Restored the complete command-center route in place of the invalid artifact
  marker, including all existing navigation and analysis panels.
- Corrected the threat assessment's local module paths so its types and runtime
  dependencies resolve.
- Reused `DEFAULT_RISK_VARIABLES` for the optional threat-scoring fallback. This
  prevents the fallback from silently omitting newly added model variables.
- Corrected `startup.sh` to run from this repository rather than its parent.
- Removed the remaining lint error in the Bayesian lever update without changing
  its calculation.

### P1 — quality and maintainability (recommended next)

1. **Add automated domain tests.** The scoring and reasoning modules are pure
   TypeScript and are strong candidates for unit tests around score boundaries,
   scenario ranking, dual-release mitigation, and Bayesian updates. There is no
   test script today, so regressions are caught only by types/build or manual UI
   checks.
2. **Make lint warning-free.** Current warnings include unused imports/values, a
   missing React hook dependency in `sod-panel.tsx`, and mixed component/helper
   exports in `practice-context.tsx`. The hook dependency deserves priority
   because stale memoized output can become a functional bug.
3. **Split the command center.** `src/routes/index.tsx` is more than 500 lines and
   eagerly imports every major panel. Route-level or tab-level lazy loading would
   reduce the initial JavaScript payload and make individual features easier to
   maintain.
4. **Define browser acceptance checks.** Add a small Playwright suite for the
   command center, threat route, tab switching, and critical deep links. Keep the
   existing smoke helper as a fast visual check.

### P2 — product hardening

1. **Persist decisions and practice state per authenticated user.** The current
   experience is useful as a local demo, but durable server-backed records are
   needed for real multi-device use and auditability. Every query should remain
   scoped by the verified authenticated user.
2. **Add model provenance to reports.** Exportable assessments should include
   model/version identifiers, input timestamps, assumptions, and explicit
   educational-use caveats so a past decision can be reproduced.
3. **Improve accessibility QA.** Run keyboard-only and automated accessibility
   checks across the dense tabs and tactical threat view, with special attention
   to focus visibility, chart alternatives, contrast, and reduced motion.
4. **Add observability around optional AI calls.** Track latency, failures,
   token/cost ceilings, and fallback activation without logging practice-sensitive
   content.

## Suggested delivery sequence

1. Unit tests for the pure scoring engines and the SoD memoization fix.
2. Browser acceptance tests for the two routes and deep-link workflow.
3. Lazy-load the heaviest command-center panels and measure bundle changes.
4. Design authenticated persistence and an auditable assessment snapshot schema.

## Verification baseline

The repaired baseline passes TypeScript validation, ESLint with warnings only,
the production build, database migration handling when no production database is
configured, an HTTP health check, and startup-script idempotency. The remaining
bundle-size warnings and lint warnings are tracked above rather than hidden.

## Follow-up implementation

The first recommended tranche is now implemented:

- Added executable domain checks for priority boundaries, score invariants,
  authoritative knowledge retrieval, source URL hygiene, and the threat-model
  fallback.
- Cleared the ESLint warning backlog, including the SoD memo dependency.
- Lazy-loaded the feature-heavy command-center tabs so the production client
  emits separate panel chunks rather than one monolithic route chunk.
- Expanded the internal-control corpus with COSO effectiveness criteria, GAO
  documentation and remediation discipline, logical-access lifecycle controls,
  HIPAA security risk analysis, out-of-band vendor-change verification, patient
  refunds, tested recovery, and incident response. Authoritative summaries now
  carry clickable primary-source links where available.

Authenticated, versioned assessment snapshots and explicit model/corpus
provenance are now implemented. The next tranche remains control-testing
evidence, remediation workflow, and automated browser accessibility/acceptance
coverage.

The retry pass also closed three control-domain gaps—payroll master-file
changes, system change management, and management override—and strengthened the
domain suite to verify corpus ID uniqueness, targeted retrieval across core
control topics, and score bounds under extreme inputs.

The product now also includes a ten-process target operating blueprint with
standard, leading, optimal, and compensating-fallback patterns plus expected
evidence and cadence. The SoD workspace includes an interactive staff power map
and assignment builder so users can visually test custody, authorization,
recording, reconciliation, and master-data combinations before adopting them.

The power-map workbench now defines 25+ concrete powers across those five duty
families, supplies 20 common internal and outsourced job templates, supports
modeled hires, preserves manual node layouts, filters/searches assignments, and
provides a conflict-only view with plain-language explanations and acceptable
fallback controls.
