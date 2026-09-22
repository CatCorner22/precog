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
