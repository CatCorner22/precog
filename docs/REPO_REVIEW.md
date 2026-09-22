# Repository review

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
