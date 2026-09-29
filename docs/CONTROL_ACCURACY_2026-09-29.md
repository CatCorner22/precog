# Control-judgment accuracy repair

Baseline: `a58685fb83f987cb87bd5edd2325ac9b4a0ec500`. Proposed through PR #146.

## Reviewer independence

Ownership no longer grants independence in the monthly-review planner or in the derived bank-reconciliation flag. The planner prefers an active person whose recorded duties do not overlap the work being checked. Payroll master changes count as payroll preparation; payment and bank-activity duties are considered when checking a bank review.

The planner explicitly distinguishes separate recorded duties, self-review, and independence not established. Title-based suggestions and an empty team cannot establish independence. Even a non-overlapping recorded reviewer still needs actual permissions and competence checked. A reported “Done” result remains a report, not verified operating evidence.

This change does not implement transaction-level reviewer attribution or replace the wider ownership-based prioritization policy in the duty-conflict engine. Some owner-held conflicts still carry the earlier model's weighting. Those policy assumptions require further review, not an audit conclusion.

## Scoring semantics: version 1.4

Free-text compensating-control descriptions receive no effectiveness credit. Adding or duplicating descriptions cannot lower the control's modeled residual. Notes remain visible, with an explanation that their design and operation need verification.

Accepting residual risk is a governance decision, not a mitigation. It no longer lowers a duty-conflict score or its contribution to segregation pressure. A separately recorded bill approver retains explicit design credit; a note count cannot supply that credit.

Inherent detection difficulty no longer changes when segregation changes. Segregation acts through modeled effectiveness rather than reducing inherent risk as well. The sample fixtures are deliberately recalculated and pinned under the new scoring version, with behavioral regressions separate from the literal figures. Existing historical snapshots are not rewritten.

**Limits:** remaining weights, staffing adjustments, manual flags, and design credits are application-selected assumptions. This is not a calibrated loss probability or tested operating-effectiveness model. A structured evidence-backed control lifecycle is still needed; the conservative stopgap is to award no credit to descriptions alone.

## Pioneer model boundary

The previous number-membership diagnostic cannot determine what a number means. A detection percentage is not a business-specific fraud probability; a case loss is not an insurance payout. The old diagnostic remains available for tests/diagnostics, but it does not authorize Pioneer narrative.

Pioneer now sends the owner's question and a bounded set of complete rules-authored statements, warnings, and evidence references to the model. The response must contain only `version: 1` and one to three known, distinct statement IDs. The application rejects prose, unknown IDs, extra fields, malformed JSON, and oversized output. It renders the selected statements itself, including their full action and rationale, in the rules engine's order. All warnings and the complete original rules brief remain. Rejected output is not copied into warning text or logs.

This deliberately removes unrestricted model rewriting from Pioneer. It is a constrained-output boundary, not a semantic truth detector, and it does not prove the correctness of source records or authored rules. Other model-assisted features have separate validation paths and are not certified by this change. No training job or external model call is required by the regression tests; model responses are fixtures.

The response allowance is 256 tokens instead of 2,200 for this selection call. That is a configuration reduction, not a measured latency or dollar-saving claim. Invalid model responses still consume any properly reserved request budget.

## Shared critical guidance

`src/lib/precog/controls/critical-guidance.ts` supplies the preventive supplier-payment verification and settlement-reconciliation language to the blueprint, procedure library, and retrieval guidance.

- Verify a changed payment destination with a previously known, authorized supplier contact before changing the record or paying. Never rely on a contact supplied in the change request.
- Obtain a separate authorized review before using the changed destination. Later monitoring complements, and does not replace, the preventive check.
- Reconcile gross receipts through fees, refunds, chargebacks, reserves, and timing differences to actual settlements. Investigate unexplained differences rather than assuming every net deposit equals gross receipts.

The source supports the principle; the specific approval, evidence, and monitoring workflow is this application's proposed design, not a universal legal requirement.

## Source basis and applicability

Reviewed September 29, 2026:

- FBI, **Business Email Compromise**, “Protect yourself”: independent contact and verification of payment/account changes. https://www.fbi.gov/how-we-can-help-you/common-frauds-and-scams/business-email-compromise
- PCAOB, **AS 2201**, paragraphs 42–45: distinguish control design from operating effectiveness and assess the evidence. These are professional audit concepts used as a reference, not a statement that every small business is subject to PCAOB auditing requirements. https://pcaobus.org/oversight/standards/auditing-standards/details/AS2201

## Acceptance and release

Regression coverage checks owner self-review, separate/provisional reviewers, inactive staff, empty teams, unearned note/acceptance credit, stable inherent risk, malicious or unsupported model prose, strict selection parsing, full warning preservation, consistent supplier verification, and settlement adjustments. Static-rendered monthly-review tests verify the user-visible qualifications. The existing browser and authenticated compiled-server CI jobs remain required by the CI release gate.

The PR and accompanying session evidence record actual commands and outcomes. Do not treat a written test plan as a completed test. Browser tests use isolated fixtures, not production; model tests do not establish a live provider's success rate.

No new database migration, dependency, production deployment, account-security change, or merge is part of this repair. The temporary read-only validation workspace workflow is removed from the final source tree. Older exported reports and snapshots retain their original provenance; comparisons must respect scoring versions.

## Remaining work

Evidence-backed control instances and execution records, actual permissions reconciliation, full owner-override risk policy, a revised portfolio summary, integration completeness indicators, broader coverage/endorsement modeling, hierarchical process editing, observed setup-speed targets, and live branch-protection enforcement remain distinct work. Nothing here marks those requirements complete.
