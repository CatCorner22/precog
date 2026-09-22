# Precog Commercial Assessment

**Assessment date:** 2026-09-19  
**Verdict:** promising vertical workflow product, but not yet a stand-alone category winner.

## Executive judgment

Precog is not a bad commercial idea. It addresses a real gap between dental-practice analytics, which explain operational performance, and enterprise governance tools, which are too expensive and abstract for most dental groups. The strongest product is not “AI risk software for every dentist.” It is a **dental-specific responsibility, control, and evidence system for growing groups and their advisors**.

The present product is differentiated in design depth: it can model people, powers, conflicts, continuity gaps, proposed hires, safe reassignments, snapshots, and governance reports. It is not yet commercially defensible because it relies primarily on manually maintained models, has no production-system connectors, cannot prove that modeled assignments match actual access, and does not yet operate an ongoing evidence/review workflow.

The likely outcome by segment:

| Segment | Commercial attractiveness | Why |
|---|---:|---|
| Solo and two-provider practices | Low | Low willingness to pay, few people to segregate, owner attention is the real constraint. |
| 3–10 location groups | High | Enough complexity and loss exposure, but usually no enterprise GRC team. |
| 10–50 location DSOs | High | Central finance/IT, acquisitions, turnover, and payer complexity create repeatable need. |
| Very large DSOs | Medium | Strong need, but enterprise IAM/GRC, procurement, security, and integration requirements are much higher. |
| Dental CPAs, fractional CFOs, compliance and transaction advisors | Very high wedge | One advisor can reuse the system across many clients and already owns the review cadence. |
| Insurers and lenders | Long-term option | Strong interest in loss prevention, but proof, data rights, and sales cycles are difficult. |

## Competitive landscape

Competitors divide into adjacent categories rather than one direct equivalent.

### Dental analytics and practice intelligence

Examples include Dental Intelligence, Practice by Numbers, Jarvis Analytics, and analytics embedded in cloud practice-management platforms such as Denticon and CareStack. These products have important advantages:

- Direct practice-management and revenue data.
- Established daily workflows and executive dashboards.
- Benchmarks, coaching, scheduling, case acceptance, and collections analytics.
- Existing distribution and recognizable brands.

Precog falls short on live integrations, operational benchmarking, automated exception feeds, and time-to-value. Precog's opportunity is that conventional analytics generally answer **what happened and how performance compares**, while Precog can answer **who can cause or conceal it, what evidence should exist, and how to redesign the operating model**.

### Dental AI, revenue cycle, and eligibility

Examples include Overjet and Pearl for clinical intelligence, and specialized eligibility, claims, payment, and revenue-cycle vendors. Their advantages are transaction-level automation and immediately measurable labor or revenue outcomes. Precog should not compete on radiograph interpretation, claim creation, eligibility, or generic RCM automation. It should consume exceptions from these systems and connect them to ownership, review, and evidence.

### Enterprise SoD, identity governance, and GRC

Examples include Pathlock, SafePaaS, Fastpath, SAP GRC, Oracle Risk Management, AuditBoard, and Workiva. Their advantages include connectors, policy engines, certification campaigns, workflow, evidence retention, and enterprise audit credibility. Their weaknesses in this market are cost, implementation burden, ERP-centric terminology, and limited dental operating context.

Precog is more understandable and operationally specific, but currently falls short on connector coverage, immutable audit trails, approval workflow, control testing, identity lifecycle enforcement, SSO/SCIM, enterprise reporting, and third-party assurance.

### Services and substitutes

The most important competitors may be spreadsheets, office-manager knowledge, dental CPAs, consultants, fraud examiners, managed IT providers, and insurance checklists. They are flexible, trusted, and already budgeted. Precog must make those professionals faster and more consistent rather than positioning itself as their replacement.

## Current product scorecard

| Capability | Current position | Commercial requirement |
|---|---|---|
| Dental-specific duty ontology | Strong early asset | Expand and validate with operators, CPAs, billers, and investigators. |
| Conflict detection | Good prototype | Measure precision/recall and support configurable policy packs. |
| Visual map and matrix | Differentiated | Validate usability on real 20–200-person organizations. |
| Continuity and absence modeling | Differentiated | Add designated backups, effective dates, and drill evidence. |
| Resolution planning | Promising | Add constraints for location, license, capacity, employment, and system access. |
| Snapshots and exports | Useful | Add approvals, signatures, retention, comparison, and audit history. |
| Knowledge and operating blueprint | Useful | Establish expert editorial governance and dated source provenance. |
| Actual-vs-modeled validation | Missing | Highest priority: ingest real users, roles, transactions, and logs. |
| Evidence workflow | Missing | Assign tests, request evidence, record reviewer conclusion, remediate exceptions. |
| Integrations | Missing | PMS, accounting, banking/payment, payroll, identity, ticketing, and HRIS. |
| Multi-entity administration | Missing | Required for groups, advisors, and scalable revenue. |
| Security/compliance assurance | Early | Tenant controls, audit logs, encryption, recovery, SOC 2 path, BAA posture. |
| Outcome proof | Missing | Required to sell an avoided-loss product to executives. |

## Best market opportunities

### 1. Advisor operating system

Start with dental CPAs, fractional CFOs, compliance consultants, and operational advisors. Give them reusable templates, client portfolios, evidence requests, review notes, branded reports, and annual/quarterly recertification. This channel has the clearest buyer, repeated usage, and lowest requirement for fully automated integrations on day one.

### 2. Acquisition and integration readiness

Package a fixed-scope pre-close/post-close assessment for DSOs and dental investors: responsibility map, access inventory, cash/AP/payroll conflict review, continuity gaps, 100-day remediation plan, and signed management acceptance. The event creates urgency and a concrete budget.

### 3. Multi-location access certification

Build recurring campaigns for managers to certify staff access by location and system, with independent review of privileged access, terminated users, bulk exports, refunds, adjustments, and payment release. This converts a static assessment into a recurring workflow.

### 4. Control evidence and exception orchestration

Ingest exception reports rather than attempting to replace practice systems: refunds, adjustments, write-offs, new vendors, bank-detail changes, payroll exceptions, access changes, exports, and audit logs. Route each exception to the correct owner and reviewer defined in the Power Map.

### 5. Insurance and lender risk programs

Only after outcome evidence exists, test premium credits, deductible incentives, underwriting questionnaires, or covenant monitoring. This could create strong distribution, but it should not be the initial dependency.

## Proving the value of avoided cost

Do not claim that every year without fraud or failure was “savings.” Executives will reject that logic. Use a layered value model.

### Layer 1: directly observed value

Track outcomes that do not require proving a counterfactual:

- Hours to complete access certification, bank review, snapshot preparation, and audit support.
- Time from employee termination to account removal.
- Time from conflict discovery to approved remediation.
- Number and dollar value of duplicate payments, unsupported refunds, stale credits, missed deposits, payroll exceptions, and access anomalies identified.
- Audit adjustments, recovered amounts, denied claims recovered, and avoided vendor overpayments.
- External advisor hours and audit-request turnaround.

### Layer 2: leading risk indicators

Use operational measures that demonstrate the control environment changed:

- Percentage of high-risk powers with a named owner and trained backup.
- Percentage of critical conflicts eliminated, dual-controlled, or formally accepted.
- Percentage of privileged accounts certified on time.
- Percentage of leavers disabled within the target SLA.
- Percentage of high-risk transactions with complete approval and evidence.
- Restore-test pass rate and time to recovery.
- Median age of unresolved exceptions.
- Concentration of high-risk powers by person and location.
- Model-to-system agreement: percentage of actual access matching approved assignments.

### Layer 3: modeled avoided loss

Present this explicitly as an estimate, not realized savings:

`expected loss avoided = exposure × baseline event probability × estimated control risk reduction`

Show low/base/high assumptions, source every input, and never collapse the range into a single authoritative number. Separate fraud, cyber/privacy, revenue leakage, business interruption, and compliance scenarios because their frequencies and severities differ.

### Layer 4: causal evidence

Build stronger evidence over time using:

- Stepped-wedge rollouts across locations.
- Difference-in-differences between adopting and not-yet-adopting locations.
- Pre/post trends with seasonality and practice growth controls.
- Matched comparisons by size, PMS, payer mix, and transaction volume.
- Insurer claims, audit adjustments, write-off/refund exceptions, and access incidents as outcomes.

The commercially credible claim is initially “we reduced review labor and closed measurable control gaps,” not “we prevented $X of fraud.”

## Success metrics

### Product activation

- Time to first complete responsibility map: target under 60 minutes with an advisor, under one business day self-serve.
- At least 80% of high-risk duties assigned and reviewed in the first session.
- At least one snapshot, report, or approved remediation created in week one.

### Ongoing engagement

- Quarterly certification completion above 85%.
- Monthly active usage among control owners above 50%.
- At least 70% of critical exceptions closed within SLA.
- More than 60% of customers returning for a second review cycle.

### Risk and operations

- Critical unresolved conflicts reduced by at least 50% within 90 days.
- High-risk duties with backup coverage increased by at least 30 percentage points.
- Terminated-user removal within 24 hours above 95% once connectors exist.
- Evidence completeness above 90% for in-scope controls.
- Measurable reduction in exception aging and review labor.

### Commercial

- Advisor pilot-to-paid conversion above 40%.
- Net revenue retention above 105% through added locations/clients.
- Gross retention above 90% for group customers.
- Customer acquisition payback below 12 months.
- Implementation services below 25% of first-year contract value after templates mature.

## What must be built for commercial success

### Next 90 days

1. Interview at least 20 buyers across dental CPAs, fractional CFOs, 3–50-location groups, and fraud/compliance specialists.
2. Run five paid design-partner assessments using real organizational and access data.
3. Measure false-positive rate, time to map, remediation acceptance, and report usefulness.
4. Add multi-practice/advisor workspaces, review assignments, evidence requests, due dates, comments, and approval history.
5. Establish an editorial board and versioning policy for the duty ontology and conflict rulebook.
6. Define security architecture and a credible SOC 2/BAA roadmap before storing production PHI or extensive access data.

### Next 6–12 months

1. Integrate with one or two widely used PMS platforms, one accounting platform, and one identity source.
2. Reconcile approved duties to actual user/role exports.
3. Add recurring certification campaigns and leaver/access-change alerts.
4. Add transaction exception imports for refunds, write-offs, vendors, payments, payroll, and bulk exports.
5. Produce customer-level value reports using observed labor, recoveries, exceptions, and control changes.
6. Support multi-location policy inheritance with documented local exceptions.

## Pricing hypotheses to test

- Advisor: platform fee plus per active client/practice.
- Dental group: base subscription plus per location, with implementation separate.
- Transaction/acquisition assessment: fixed project fee that converts to recurring monitoring.
- Avoid percentage-of-“savings” pricing until recoveries are directly attributable and auditable.

Do not begin with a low-priced solo-practice self-serve plan. Support costs and education needs are likely to overwhelm revenue.

## Go / no-go gates

Continue commercially if, after five paid design partners:

- Three or more renew or commit to a recurring review cycle.
- Users complete a credible initial model in under one business day.
- At least half of surfaced critical findings are judged valid and actionable; the target should rise materially with tuning.
- Customers can identify either direct recovered value, material labor savings, or approved risk remediation worth the annual price.
- At least one advisor wants to deploy the product across multiple clients.

Treat it as a strong personal/internal project rather than a venture-scale company if buyers praise the reports but will not maintain the model, no channel partner will own the recurring workflow, or every sale requires bespoke consulting and custom integrations.

## Honest conclusion

The concept is commercially plausible as a focused vertical product, especially through advisors and mid-market dental groups. The present application demonstrates unusually rich thinking about responsibility design, but it is still a **decision-support prototype**, not a system of record or continuous control platform.

The decisive question is not whether the map can become more sophisticated. It can. The decisive question is whether a recurring buyer will keep the map synchronized with actual people, access, evidence, and transactions. The next investment should therefore favor customer discovery, evidence workflow, multi-tenant advisor operations, and one real integration over additional analytical breadth.

## Competitor/source verification note

Current competitor claims should be validated directly before external publication. Relevant official discovery pages include:

- [Dental Intelligence](https://www.dentalintel.com/)
- [Practice by Numbers](https://www.practicenumbers.com/)
- [Jarvis Analytics](https://www.jarvisanalytics.com/)
- [Planet DDS / Denticon](https://www.planetdds.com/)
- [CareStack](https://carestack.com/)
- [Overjet](https://www.overjet.com/)
- [Pearl](https://www.hellopearl.com/)
- [Pathlock](https://pathlock.com/)
- [SafePaaS](https://www.safepaas.com/)
- [AuditBoard](https://www.auditboard.com/)
- [Workiva](https://www.workiva.com/)

The assessment above uses category-level positioning rather than feature-by-feature claims because outbound access to those pages was blocked in the review environment on 2026-09-19.
