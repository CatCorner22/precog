# Account and business data safety

This change builds on PR #109. It does not deploy the application or change live branch protections.

## Browser workspaces

Authenticated data is stored under `precog.workspace.v2:account:<encoded verified id>:`. Guest data uses a different namespace. Profiles, portfolios, onboarding drafts, value-proof data, and power-map baselines use the same account boundary. Authentication loading is not interpreted as a guest session. An account transition remounts the workspace and invalidates prior requests and queued saves.

Older, unscoped browser records cannot be reliably assigned to a person. They remain unassigned and can be explicitly exported through **Local recovery and guest work**. They are not automatically uploaded to whoever signs in next. Completed work in the new guest namespace can be explicitly copied into the signed-in account's local portfolio under new business identifiers. Original guest work is retained; choosing a copied business reviews and synchronizes it.

On explicit sign-out, the active workspace first attempts to flush. If that fails, the user can cancel or export a recovery copy. Successfully acknowledged, content-identical active/portfolio copies are removed after sign-out. Unacknowledged records, unfinished drafts, and ancillary records without verified cloud copies are retained in their original account namespace. Storage namespacing is not encryption and does not protect against someone inspecting the same browser profile with developer tools. A blocked or exhausted browser store cannot guarantee recovery after closing the page.

A cross-tab identity signal contains no credentials or business data. Other open tabs stop rendering the prior workspace until reloaded. Each server operation checks the expected account against the verified session; profile save/delete additionally require the expectation in their validated input. Server authorization bypasses Better Auth's display-cookie cache to recheck revoked sessions. No client-supplied identifier grants authorization.

## Transactional business lifecycle

Creation, updates, history, and active pointers use one reserved PostgreSQL connection and a transaction. PGLite uses its transaction API. Independent pool queries are never treated as a transaction. An owner-row lock serializes lifecycle changes and enforces the per-owner active-business limit. Shared-business membership is rechecked inside the transaction.

A missing record plus an old base revision is a conflict, not a new business. Soft deletion retains the existing 30-day restoration window. Deletion and restoration each advance the revision, so a pre-deletion device cannot overwrite a restored business without reloading. Deletion removes the corresponding active pointers in the same transaction.

Additive migration `0023_business_deletion_markers.sql` preserves a minimal deletion marker after substantive business content is purged. Markers contain identity references and deletion time, not the former business profile. They prevent a null-revision client from recreating a previously deleted identifier. Explicit restoration removes the marker while advancing the live revision. Markers are removed by account deletion through a foreign key cascade.

Active pointers identify both the business and its owning account. Legacy full-profile fallback remains supported only for genuinely unmigrated profiles, never a modern id-only pointer or a known deletion.

## Release and compatibility

Apply migration 0023 in the approved release process before relying on these store functions. Database/application changes should be released together; an older client without the required account expectation must reload rather than making an unguarded save. Do not roll back to a client or server that silently upserts deleted records. Keep additive schema objects when rolling forward to a corrected application build.

Back up and rehearse production recovery separately. No production database or deployment is changed by the tests. Actual repository protections and deployment authorizations remain separate from the CI Release gate.

## Verification

Unit tests cover storage isolation, immutable account namespaces, exact-content cleanup, queue cancellation/serialization, account guards, and reserved-connection rollback. The same lifecycle suite runs against PGLite and against a disposable PostgreSQL schema with up to eight connections, including simultaneous updates, creation limits, save/delete races, injected failures, sharing revocation, retention, and purge markers.

The `Authenticated compiled-server safety` CI job uses the normal Vercel production build and a local HTTP adapter around its emitted handler. It has a dedicated `precog_safety_e2e` database and two genuine Better Auth signed test sessions. No production-accessible login bypass or test route is added. It exercises browser edit/save/reload, same-browser account switching, cross-tab logout, delayed wrong-account requests, and delete/stale-save behavior. Seeded sessions verify session/authorization handling; they do not verify an external identity provider's OAuth redirect flow or a live Vercel deployment.

The Release gate requires this job alongside existing type/lint/test/build, migrations, and demo browser journeys. Passing these checks does not constitute completion of the full insurance/hierarchical-mapping/observed-usability plan.
