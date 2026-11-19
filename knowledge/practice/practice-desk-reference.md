# [00] Practice desk — Living reference

_Version 0.1 · Owner: Practice operations lead · Scope: Generic operating reference for a multi-location general dental practice: functions, SOPs, controls, metrics, prioritization. Not legal advice; Tennessee/federal rules live in the Compliance desk._
_Refresh: run `scripts/refresh_reference.py knowledge/practice/practice-desk-reference.md --stale-days 90` after edits._

## [01] Attack sheet

- Name an accountable role, evidence artifact, and metric for every function. §10
- Verify a reported issue before scoring it; keep the evidence with the register. §70
- Run the four rubric gates before the additive score. §30
- Gate findings receive a 7-day interim control and a 30-day permanent fix. §30
- Give every critical task a tested backup at a different location. §50
- Review training expiry monthly and act before a credential or competency lapses. §50
- Report patient-survey denominators and actual return measures separately. §60
- Assign a control owner and cadence; policies without evidence are not operating controls. §10
- Keep Tennessee and federal legal interpretation in the Compliance desk. §00

## [02] Contents

<!-- toc:start -->
- [00 Practice desk — Living reference](#00-practice-desk--living-reference)
- [01 Attack sheet](#01-attack-sheet)
- [03 How to read this file](#03-how-to-read-this-file)
- [10 Governance and ownership](#10-governance-and-ownership)
  - [10.01 Risks — Risks have a named accountable owner](#1001-risks--risks-have-a-named-accountable-owner)
  - [10.02 SOPs — Governance work follows a written review procedure](#1002-sops--governance-work-follows-a-written-review-procedure)
  - [10.03 Controls — Governance controls have an owner and cadence](#1003-controls--governance-controls-have-an-owner-and-cadence)
  - [10.04 Metrics — Governance review is measured against the source target](#1004-metrics--governance-review-is-measured-against-the-source-target)
- [11 Doctor clinical services](#11-doctor-clinical-services)
  - [11.01 Risks — Clinical risks are reviewed through records and role checks](#1101-risks--clinical-risks-are-reviewed-through-records-and-role-checks)
  - [11.02 SOPs — Clinical work follows approved SOPs](#1102-sops--clinical-work-follows-approved-sops)
  - [11.03 Controls — Clinical controls verify roles and sample records](#1103-controls--clinical-controls-verify-roles-and-sample-records)
  - [11.04 Metrics — Clinical measures use the source targets](#1104-metrics--clinical-measures-use-the-source-targets)
- [12 Hygiene and periodontal services](#12-hygiene-and-periodontal-services)
  - [12.01 Risks — Recall gaps and production swings are visible](#1201-risks--recall-gaps-and-production-swings-are-visible)
  - [12.02 SOPs — Hygiene work follows recall and periodontal SOPs](#1202-sops--hygiene-work-follows-recall-and-periodontal-sops)
  - [12.03 Controls — Recall controls have a weekly owner review](#1203-controls--recall-controls-have-a-weekly-owner-review)
  - [12.04 Metrics — Hygiene measures use source targets and denominators](#1204-metrics--hygiene-measures-use-source-targets-and-denominators)
- [13 Dental assisting](#13-dental-assisting)
  - [13.01 Risks — Assignment and delegation risks are visible](#1301-risks--assignment-and-delegation-risks-are-visible)
  - [13.02 SOPs — Assisting follows a delegation matrix and turnover SOP](#1302-sops--assisting-follows-a-delegation-matrix-and-turnover-sop)
  - [13.03 Controls — Assignment controls are checked before work begins](#1303-controls--assignment-controls-are-checked-before-work-begins)
  - [13.04 Metrics — Assisting measures include a zero-event target](#1304-metrics--assisting-measures-include-a-zero-event-target)
- [14 Sterilization and infection prevention](#14-sterilization-and-infection-prevention)
  - [14.01 Risks — Monitoring gaps and failed-cycle response are tracked](#1401-risks--monitoring-gaps-and-failed-cycle-response-are-tracked)
  - [14.02 SOPs — Reprocessing follows written SOPs](#1402-sops--reprocessing-follows-written-sops)
  - [14.03 Controls — Monitoring controls are reviewed weekly](#1403-controls--monitoring-controls-are-reviewed-weekly)
  - [14.04 Metrics — Sterilization measures include the source target](#1404-metrics--sterilization-measures-include-the-source-target)
- [15 In-house laboratory and milling](#15-in-house-laboratory-and-milling)
  - [15.01 Risks — Laboratory hazards and equipment condition are monitored](#1501-risks--laboratory-hazards-and-equipment-condition-are-monitored)
  - [15.02 SOPs — Laboratory tasks follow safety and maintenance SOPs](#1502-sops--laboratory-tasks-follow-safety-and-maintenance-sops)
  - [15.03 Controls — Laboratory controls have daily and scheduled checks](#1503-controls--laboratory-controls-have-daily-and-scheduled-checks)
  - [15.04 Metrics — Laboratory measures verify current records](#1504-metrics--laboratory-measures-verify-current-records)
- [16 Imaging and radiology](#16-imaging-and-radiology)
  - [16.01 Risks — Unit status and inspection gaps are visible](#1601-risks--unit-status-and-inspection-gaps-are-visible)
  - [16.02 SOPs — Imaging follows radiography and quality-control SOPs](#1602-sops--imaging-follows-radiography-and-quality-control-sops)
  - [16.03 Controls — Imaging controls are reviewed on a recurring schedule](#1603-controls--imaging-controls-are-reviewed-on-a-recurring-schedule)
  - [16.04 Metrics — Imaging measures track complete unit records](#1604-metrics--imaging-measures-track-complete-unit-records)
- [17 Front office and patient administration](#17-front-office-and-patient-administration)
  - [17.01 Risks — Access, schedule, and records risks are tracked](#1701-risks--access-schedule-and-records-risks-are-tracked)
  - [17.02 SOPs — Front-office work follows scheduling and release SOPs](#1702-sops--front-office-work-follows-scheduling-and-release-sops)
  - [17.03 Controls — Front-office controls have daily queue review](#1703-controls--front-office-controls-have-daily-queue-review)
  - [17.04 Metrics — Front-office measures use source targets](#1704-metrics--front-office-measures-use-source-targets)
- [18 Revenue cycle and billing](#18-revenue-cycle-and-billing)
  - [18.01 Risks — Billing exceptions and aging are visible](#1801-risks--billing-exceptions-and-aging-are-visible)
  - [18.02 SOPs — Revenue work follows claims and estimate SOPs](#1802-sops--revenue-work-follows-claims-and-estimate-sops)
  - [18.03 Controls — Revenue controls separate preparation and review](#1803-controls--revenue-controls-separate-preparation-and-review)
  - [18.04 Metrics — Revenue measures use source targets](#1804-metrics--revenue-measures-use-source-targets)
- [19 Finance and accounting](#19-finance-and-accounting)
  - [19.01 Risks — Money movement and reconciliation risks are reviewed](#1901-risks--money-movement-and-reconciliation-risks-are-reviewed)
  - [19.02 SOPs — Finance follows daily reconciliation and close SOPs](#1902-sops--finance-follows-daily-reconciliation-and-close-sops)
  - [19.03 Controls — Reconciliation controls use independent review](#1903-controls--reconciliation-controls-use-independent-review)
  - [19.04 Metrics — Finance measures track completed review](#1904-metrics--finance-measures-track-completed-review)
- [20 Human resources](#20-human-resources)
  - [20.01 Risks — Staffing and onboarding failures are visible](#2001-risks--staffing-and-onboarding-failures-are-visible)
  - [20.02 SOPs — People processes follow standard SOPs](#2002-sops--people-processes-follow-standard-sops)
  - [20.03 Controls — HR controls are reviewed monthly](#2003-controls--hr-controls-are-reviewed-monthly)
  - [20.04 Metrics — HR measures follow the source](#2004-metrics--hr-measures-follow-the-source)
- [21 Compliance and quality](#21-compliance-and-quality)
  - [21.01 Risks — Ownership and stale operating rules are tracked](#2101-risks--ownership-and-stale-operating-rules-are-tracked)
  - [21.02 SOPs — Quality review follows a recurring SOP](#2102-sops--quality-review-follows-a-recurring-sop)
  - [21.03 Controls — Quality controls are owned and dated](#2103-controls--quality-controls-are-owned-and-dated)
  - [21.04 Metrics — Quality measures use the source target](#2104-metrics--quality-measures-use-the-source-target)
- [22 IT and data security operations](#22-it-and-data-security-operations)
  - [22.01 Risks — System, access, and recovery risks are visible](#2201-risks--system-access-and-recovery-risks-are-visible)
  - [22.02 SOPs — IT operations follow backup and incident SOPs](#2202-sops--it-operations-follow-backup-and-incident-sops)
  - [22.03 Controls — IT controls are tested on schedule](#2203-controls--it-controls-are-tested-on-schedule)
  - [22.04 Metrics — IT measures use the source targets](#2204-metrics--it-measures-use-the-source-targets)
- [23 Marketing and patient relations](#23-marketing-and-patient-relations)
  - [23.01 Risks — Communication and reputation risks are reviewed](#2301-risks--communication-and-reputation-risks-are-reviewed)
  - [23.02 SOPs — Marketing follows a documented review SOP](#2302-sops--marketing-follows-a-documented-review-sop)
  - [23.03 Controls — Marketing controls are checked before publication](#2303-controls--marketing-controls-are-checked-before-publication)
  - [23.04 Metrics — Marketing measures use source indicators](#2304-metrics--marketing-measures-use-source-indicators)
- [24 Facilities and safety](#24-facilities-and-safety)
  - [24.01 Risks — Facility, equipment, and waste risks are visible](#2401-risks--facility-equipment-and-waste-risks-are-visible)
  - [24.02 SOPs — Facilities follow maintenance and waste SOPs](#2402-sops--facilities-follow-maintenance-and-waste-sops)
  - [24.03 Controls — Facilities controls have daily and monthly checks](#2403-controls--facilities-controls-have-daily-and-monthly-checks)
  - [24.04 Metrics — Facility measures use source targets](#2404-metrics--facility-measures-use-source-targets)
- [25 Purchasing and inventory](#25-purchasing-and-inventory)
  - [25.01 Risks — Stock and vendor exceptions are tracked](#2501-risks--stock-and-vendor-exceptions-are-tracked)
  - [25.02 SOPs — Purchasing follows inventory and vendor SOPs](#2502-sops--purchasing-follows-inventory-and-vendor-sops)
  - [25.03 Controls — Inventory controls include a weekly count](#2503-controls--inventory-controls-include-a-weekly-count)
  - [25.04 Metrics — Inventory measures use source targets](#2504-metrics--inventory-measures-use-source-targets)
- [26 Continuity and cross-training](#26-continuity-and-cross-training)
  - [26.01 Risks — Single-person dependencies are identified](#2601-risks--single-person-dependencies-are-identified)
  - [26.02 SOPs — Continuity work follows tested runbooks](#2602-sops--continuity-work-follows-tested-runbooks)
  - [26.03 Controls — Continuity controls are exercised quarterly](#2603-controls--continuity-controls-are-exercised-quarterly)
  - [26.04 Metrics — Continuity measures use the source target](#2604-metrics--continuity-measures-use-the-source-target)
- [30 Prioritization](#30-prioritization)
  - [30.01 Four gates precede any additive score](#3001-four-gates-precede-any-additive-score)
  - [30.02 Findings without a gate use the six-factor formula](#3002-findings-without-a-gate-use-the-six-factor-formula)
  - [30.03 Tier bands set remediation timing](#3003-tier-bands-set-remediation-timing)
- [40 SOP index](#40-sop-index)
  - [40.01 Operating SOPs are indexed by process](#4001-operating-sops-are-indexed-by-process)
- [50 Training and cross-training](#50-training-and-cross-training)
  - [50.01 Recurring tasks have measurable standards](#5001-recurring-tasks-have-measurable-standards)
  - [50.02 Critical work has two-deep coverage](#5002-critical-work-has-two-deep-coverage)
  - [50.03 Backup skills are exercised on a schedule](#5003-backup-skills-are-exercised-on-a-schedule)
  - [50.04 Training records identify due work](#5004-training-records-identify-due-work)
- [60 Patient experience and retention](#60-patient-experience-and-retention)
  - [60.01 Patient feedback is collected neutrally](#6001-patient-feedback-is-collected-neutrally)
  - [60.02 Survey items measure separate domains](#6002-survey-items-measure-separate-domains)
  - [60.03 Generic patient survey items](#6003-generic-patient-survey-items)
  - [60.04 Service recovery closes the loop](#6004-service-recovery-closes-the-loop)
- [70 Baseline audit and turnaround](#70-baseline-audit-and-turnaround)
  - [70.01 Baseline findings are evidence-linked](#7001-baseline-findings-are-evidence-linked)
  - [70.02 Audit gaps move through a controlled workflow](#7002-audit-gaps-move-through-a-controlled-workflow)
  - [70.03 Turnaround phases separate containment and sustainment](#7003-turnaround-phases-separate-containment-and-sustainment)
- [80 Glossary](#80-glossary)
- [85 Changelog](#85-changelog)
- [90 Sources](#90-sources)
- [91 Cite index](#91-cite-index)
- [92 Index](#92-index)
- [99 Health](#99-health)
<!-- toc:end -->

## [03] How to read this file

- Section IDs are stable; use `§ID` links instead of page position.
- Short citations point to the sources ledger in §90.
- `Rule`, `Elements`, `Test / steps`, `Examples`, `Policy / why`, and `Open`
  labels identify the same fields throughout.
- Metrics are source targets or local-baseline measures, not guarantees.
- Legal duties belong in the Compliance desk, not this operating reference.

## [10] Governance and ownership

### [10.01] Risks — Risks have a named accountable owner
{{index: governance ownership | accountability; review cadence}}
**Rule.** Track absentee ownership and missed review cadence as operating risks. [S1 at F1]
**Elements.** Named function owner, review calendar, decision record.
**Test / steps.** Check the weekly review record and open decisions.
**Open.** Local role assignments and evidence locations.
Last verified: 2026-11-19

### [10.02] SOPs — Governance work follows a written review procedure
{{index: owner review | board calendar}}
**Rule.** Use the Friday review and owner calendar as the governance SOPs. [S1 at F1]
**Test / steps.** Record the agenda, decisions, assigned owners, and due dates.
Last verified: 2026-11-19

### [10.03] Controls — Governance controls have an owner and cadence
{{index: weekly governance control | owner dentist}}
**Rule.** The owner dentist leads the weekly review; the operations manager prepares the evidence packet. [S1 at F1; S3 at Governance]
**Test / steps.** Reconcile the calendar to signed review records each week.
Last verified: 2026-11-19

### [10.04] Metrics — Governance review is measured against the source target
{{index: governance review streak | weekly review}}
**Rule.** Track at least 45 of 52 weekly reviews held in a year. [S1 at F1]
**Test / steps.** Use the dated review calendar and signed packet.
Last verified: 2026-11-19

## [11] Doctor clinical services

### [11.01] Risks — Clinical risks are reviewed through records and role checks
{{index: clinical records | credentialed practice; prescribing workflow}}
**Rule.** Monitor incomplete records, role mismatch, and breakdowns in clinical workflows. [S1 at F2]
**Elements.** Chart completeness, role assignment, follow-up evidence.
**Test / steps.** Sample charts and compare scheduled work with role records.
**Open.** Clinical criteria remain with the responsible clinician.
Last verified: 2026-11-19

### [11.02] SOPs — Clinical work follows approved SOPs
{{index: clinical SOP | charting; sedation; prescribing}}
**Rule.** Maintain charting, sedation, and prescribing SOPs for the services offered. [S1 at F2; S3 at Clinical assessment; S3 at Sedation]
**Test / steps.** Review procedures quarterly and after a material guideline or workflow change.
Last verified: 2026-11-19

### [11.03] Controls — Clinical controls verify roles and sample records
{{index: clinical control | chart audit}}
**Rule.** The clinical director verifies role readiness before assignment and reviews a monthly chart sample. [S1 at F2; S3 at Clinical assessment]
**Test / steps.** Retain credential-to-assignment checks, chart sample, and corrective actions.
Last verified: 2026-11-19

### [11.04] Metrics — Clinical measures use the source targets
{{index: clinical quality measure | CSMD check rate}}
**Rule.** Target a chart-audit pass rate of at least 95% and a 100% CSMD-check rate. [S1 at F2]
**Test / steps.** Report denominator, period, exceptions, and source record.
Last verified: 2026-11-19

## [12] Hygiene and periodontal services

### [12.01] Risks — Recall gaps and production swings are visible
{{index: hygiene recall | periodontal services}}
**Rule.** Track broken recall and material changes in periodontal-service activity. [S1 at F3]
**Test / steps.** Review overdue-patient worklists and service mix by period.
Last verified: 2026-11-19

### [12.02] SOPs — Hygiene work follows recall and periodontal SOPs
{{index: recall workflow | reactivation; periodontal protocol}}
**Rule.** Use documented recall/reactivation and periodontal protocols. [S1 at F3; S3 at Patient access]
**Test / steps.** Record accepted follow-up, deferral, and patient preference.
Last verified: 2026-11-19

### [12.03] Controls — Recall controls have a weekly owner review
{{index: hygiene control | overdue recall}}
**Rule.** The hygiene lead reviews overdue recall weekly and assigns next actions. [S1 at F3; S3 at Patient experience]
**Test / steps.** Retain the dated worklist and disposition.
Last verified: 2026-11-19

### [12.04] Metrics — Hygiene measures use source targets and denominators
{{index: recall effectiveness | hygiene production mix}}
**Rule.** Target recall effectiveness of at least 80% and monitor periodontal share of hygiene production. [S1 at F3]
**Test / steps.** State cohort, period, numerator, denominator, and any local target.
Last verified: 2026-11-19

## [13] Dental assisting

### [13.01] Risks — Assignment and delegation risks are visible
{{index: assistant duties | room turnover; delegated work}}
**Rule.** Track role mismatch and duty drift as clinical-operating risks. [S1 at F4]
**Test / steps.** Review role assignments, training evidence, and observations.
Last verified: 2026-11-19

### [13.02] SOPs — Assisting follows a delegation matrix and turnover SOP
{{index: assisting SOP | room turnover checklist}}
**Rule.** Maintain a role-to-task matrix and a room-turnover checklist. [S1 at F4; S3 at Infection prevention]
**Test / steps.** Review the checklist when the procedure or room setup changes.
Last verified: 2026-11-19

### [13.03] Controls — Assignment controls are checked before work begins
{{index: assisting control | pre-assignment check}}
**Rule.** The clinical lead verifies task assignment and current competency before work begins. [S1 at F4; S4 at Performance standards]
**Test / steps.** Keep a dated assignment check and observed competency evidence.
Last verified: 2026-11-19

### [13.04] Metrics — Assisting measures include a zero-event target
{{index: uncertified-duty events | role competency}}
**Rule.** Target zero uncertified-duty events. [S1 at F4]
**Test / steps.** Log exceptions, review causes, and assign corrective action.
Last verified: 2026-11-19

## [14] Sterilization and infection prevention

### [14.01] Risks — Monitoring gaps and failed-cycle response are tracked
{{index: sterilization monitoring | infection prevention; spore testing}}
**Rule.** Track missed monitoring and missing failure-response steps as operating risks. [S1 at F5]
**Test / steps.** Review monitoring records and any failed-test disposition.
Last verified: 2026-11-19

### [14.02] SOPs — Reprocessing follows written SOPs
{{index: reprocessing SOP | failed-test procedure}}
**Rule.** Maintain sterilization, failure-response, and infection-prevention procedures. [S1 at F5; S3 at Infection prevention]
**Test / steps.** Review the workflow after equipment, supply, or process changes.
Last verified: 2026-11-19

### [14.03] Controls — Monitoring controls are reviewed weekly
{{index: spore-log review | infection prevention control}}
**Rule.** The site infection-prevention coordinator reviews weekly monitoring and immediate failure containment. [S1 at F5; S3 at Infection prevention]
**Test / steps.** Retain the monitoring log, exceptions, and drill evidence.
Last verified: 2026-11-19

### [14.04] Metrics — Sterilization measures include the source target
{{index: weekly spore test target | failure drills}}
**Rule.** Target 52 of 52 weekly spore-test rounds and document failure drills. [S1 at F5]
**Test / steps.** Report completed rounds and failed-result disposition.
Last verified: 2026-11-19

## [15] In-house laboratory and milling

### [15.01] Risks — Laboratory hazards and equipment condition are monitored
{{index: laboratory safety | milling; lathe}}
**Rule.** Track dust exposure, shared material, and unguarded-equipment risks. [S1 at F6]
**Test / steps.** Use the safety checklist and maintenance records.
Last verified: 2026-11-19

### [15.02] SOPs — Laboratory tasks follow safety and maintenance SOPs
{{index: laboratory SOP | lathe sanitation; mill maintenance}}
**Rule.** Maintain laboratory safety, lathe sanitation, and milling-maintenance procedures. [S1 at F6; S3 at Facilities]
**Test / steps.** Review after equipment or material changes.
Last verified: 2026-11-19

### [15.03] Controls — Laboratory controls have daily and scheduled checks
{{index: laboratory control | daily safety checklist}}
**Rule.** The laboratory lead completes the safety check daily and the equipment log on schedule. [S1 at F6]
**Test / steps.** Retain signed checklists and maintenance evidence.
Last verified: 2026-11-19

### [15.04] Metrics — Laboratory measures verify current records
{{index: laboratory metric | current mill log}}
**Rule.** Keep the daily safety checklist complete and the mill log current. [S1 at F6]
**Test / steps.** Review completion streaks and unresolved equipment exceptions.
Last verified: 2026-11-19

## [16] Imaging and radiology

### [16.01] Risks — Unit status and inspection gaps are visible
{{index: imaging units | radiology inspections}}
**Rule.** Track unit registration status and inspection currency. [S1 at F7]
**Test / steps.** Reconcile the equipment register to current inspection evidence.
Last verified: 2026-11-19

### [16.02] SOPs — Imaging follows radiography and quality-control SOPs
{{index: radiography SOP | image quality}}
**Rule.** Maintain radiography procedures and a quality-assurance log. [S1 at F7; S3 at Radiography]
**Test / steps.** Review the procedure after a unit, operator, or workflow change.
Last verified: 2026-11-19

### [16.03] Controls — Imaging controls are reviewed on a recurring schedule
{{index: radiology control | unit register}}
**Rule.** The radiation-safety role checks operator readiness and reconciles unit records quarterly. [S1 at F7; S3 at Radiography]
**Test / steps.** Retain the unit register, inspection record, and exception disposition.
Last verified: 2026-11-19

### [16.04] Metrics — Imaging measures track complete unit records
{{index: registered imaging units | current inspections}}
**Rule.** Target 100% of units registered and inspections current. [S1 at F7]
**Test / steps.** Report the unit count, current count, and open exceptions.
Last verified: 2026-11-19

## [17] Front office and patient administration

### [17.01] Risks — Access, schedule, and records risks are tracked
{{index: patient access | appointment templates; records requests}}
**Rule.** Track schedule instability, missed visits, and delayed records work. [S1 at F8]
**Test / steps.** Review schedule fill, unconfirmed visits, and the request queue.
Last verified: 2026-11-19

### [17.02] SOPs — Front-office work follows scheduling and release SOPs
{{index: front-office SOP | records release; scheduling}}
**Rule.** Maintain scheduling and records-release procedures. [S1 at F8; S3 at Patient access; S3 at Records]
**Test / steps.** Log requests on receipt, assign an owner, and close with evidence.
Last verified: 2026-11-19

### [17.03] Controls — Front-office controls have daily queue review
{{index: front-office control | daily schedule review}}
**Rule.** The front-office lead reviews schedule readiness daily and the records queue weekly. [S1 at F8; S3 at Patient access]
**Test / steps.** Retain timestamps, owner, due date, and completed disposition.
Last verified: 2026-11-19

### [17.04] Metrics — Front-office measures use source targets
{{index: schedule fill | records turnaround}}
**Rule.** Target at least 85% template fill and an internal records-request target of 10 business days. [S1 at F8; S3 at Patient access]
**Test / steps.** Report counts, time period, and exceptions; legal deadlines remain in the Compliance desk.
Last verified: 2026-11-19

## [18] Revenue cycle and billing

### [18.01] Risks — Billing exceptions and aging are visible
{{index: revenue cycle | billing adjustments; aged receivables}}
**Rule.** Track adjustment exceptions, estimate completion, and aged receivables. [S1 at F9]
**Test / steps.** Review worklists, approvals, and aging by period.
Last verified: 2026-11-19

### [18.02] SOPs — Revenue work follows claims and estimate SOPs
{{index: claims workflow | good faith estimate; adjustment policy}}
**Rule.** Maintain claims, estimate, and adjustment procedures. [S1 at F9; S3 at Revenue cycle]
**Test / steps.** Review payer-specific workflows and approval evidence monthly.
Last verified: 2026-11-19

### [18.03] Controls — Revenue controls separate preparation and review
{{index: revenue control | daily close; weekly aging review}}
**Rule.** The revenue-cycle lead reviews daily close exceptions and weekly aging; an independent role approves adjustments. [S1 at F9; S3 at Revenue cycle]
**Test / steps.** Retain close records, approval samples, and assigned follow-up.
Last verified: 2026-11-19

### [18.04] Metrics — Revenue measures use source targets
{{index: net collections | aged AR; estimate log}}
**Rule.** Target net collection of at least 98%, AR over 90 days below 12%, and a 100% estimate log. [S1 at F9]
**Test / steps.** State calculation, period, exclusions, and underlying report.
Last verified: 2026-11-19

## [19] Finance and accounting

### [19.01] Risks — Money movement and reconciliation risks are reviewed
{{index: finance controls | deposit reconciliation; payroll exposure}}
**Rule.** Track single-person money workflows and unexplained reconciliation exceptions. [S1 at F10]
**Test / steps.** Trace a transaction from initiation through independent review.
Last verified: 2026-11-19

### [19.02] SOPs — Finance follows daily reconciliation and close SOPs
{{index: finance SOP | month-end close}}
**Rule.** Maintain daily reconciliation and a month-end close checklist. [S1 at F10; S3 at Revenue cycle]
**Test / steps.** Assign each close task, due date, reviewer, and artifact.
Last verified: 2026-11-19

### [19.03] Controls — Reconciliation controls use independent review
{{index: finance control | owner sign-off}}
**Rule.** The finance lead reconciles daily; the owner reviews the summary weekly. [S1 at F10; S4 at Performance standards]
**Test / steps.** Preserve the reconciliation streak and signed exception disposition.
Last verified: 2026-11-19

### [19.04] Metrics — Finance measures track completed review
{{index: reconciliation streak | weekly sign-off}}
**Rule.** Track the daily reconciliation streak and weekly owner sign-off. [S1 at F10]
**Test / steps.** Report missed days and the date each exception was resolved.
Last verified: 2026-11-19

## [20] Human resources

### [20.01] Risks — Staffing and onboarding failures are visible
{{index: human resources | onboarding; staff turnover}}
**Rule.** Track incomplete onboarding, training, timekeeping, and separation work. [S1 at F11]
**Test / steps.** Review role files, training records, and open exceptions.
Last verified: 2026-11-19

### [20.02] SOPs — People processes follow standard SOPs
{{index: HR SOP | corrective action; separation checklist}}
**Rule.** Maintain 30/60/90-day onboarding, corrective-action, and exit procedures. [S1 at F11; S3 at Hiring and separation]
**Test / steps.** Review the procedure monthly and after a material workflow change.
Last verified: 2026-11-19

### [20.03] Controls — HR controls are reviewed monthly
{{index: HR control | training tracker}}
**Rule.** The HR lead checks the training tracker monthly and assigns each gap to a role owner. [S1 at F11; S4 at Training tracker]
**Test / steps.** Keep due dates, evidence links, and closure records.
Last verified: 2026-11-19

### [20.04] Metrics — HR measures follow the source
{{index: training tracker status | turnover trend}}
**Rule.** Keep the training tracker green and review the turnover trend. [S1 at F11]
**Test / steps.** Define the reporting period and explain changes in the cohort.
Last verified: 2026-11-19

## [21] Compliance and quality

### [21.01] Risks — Ownership and stale operating rules are tracked
{{index: compliance operations | quality register}}
**Rule.** Assign an owner to the rules watch, audit calendar, and risk register. [S1 at F12]
**Test / steps.** Identify a responsible role and an evidence location for each item.
**Open.** Legal interpretation and rule text remain with the Compliance desk.
Last verified: 2026-11-19

### [21.02] SOPs — Quality review follows a recurring SOP
{{index: compliance SOP | rules refresh; rubric sweep}}
**Rule.** Schedule a quarterly reference refresh and a monthly prioritization sweep. [S1 at F12]
**Test / steps.** Record the reviewed version, findings, and assigned actions.
Last verified: 2026-11-19

### [21.03] Controls — Quality controls are owned and dated
{{index: register review | stale rule review}}
**Rule.** The named compliance officer reviews the register monthly and escalates unresolved items to the operations lead. [S1 at F12]
**Test / steps.** Preserve dated review evidence and due dates.
Last verified: 2026-11-19

### [21.04] Metrics — Quality measures use the source target
{{index: stale operating items | monthly register}}
**Rule.** Target a monthly register review and zero stale operating rules. [S1 at F12]
**Test / steps.** Report open and overdue items separately.
Last verified: 2026-11-19

## [22] IT and data security operations

### [22.01] Risks — System, access, and recovery risks are visible
{{index: IT operations | backups; access review}}
**Rule.** Track missing risk review, unpatched systems, and incomplete vendor records as operating risks. [S1 at F13]
**Test / steps.** Review the current risk register, access list, and vendor inventory.
**Open.** Security and privacy obligations remain with the Compliance desk.
Last verified: 2026-11-19

### [22.02] SOPs — IT operations follow backup and incident SOPs
{{index: IT SOP | restore test; incident response}}
**Rule.** Maintain backup/restore, access-review, and incident-response procedures. [S1 at F13; S3 at Records and downtime]
**Test / steps.** Review after a material system, vendor, or workflow change.
Last verified: 2026-11-19

### [22.03] Controls — IT controls are tested on schedule
{{index: IT control | annual risk review; quarterly restore}}
**Rule.** The internal system owner coordinates an annual risk review and quarterly restore test with the IT vendor. [S1 at F13; S3 at Records and downtime]
**Test / steps.** Retain test results, remediation, and vendor agreement records.
Last verified: 2026-11-19

### [22.04] Metrics — IT measures use the source targets
{{index: business associate agreements | recovery testing}}
**Rule.** Target an annual risk analysis, quarterly restore tests, and 100% BAA coverage. [S1 at F13]
**Test / steps.** Report tested systems, current records, and exceptions.
Last verified: 2026-11-19

## [23] Marketing and patient relations

### [23.01] Risks — Communication and reputation risks are reviewed
{{index: marketing controls | patient relations; review requests}}
**Rule.** Track inaccurate advertising, conflicted incentives, and selective review practices. [S1 at F14]
**Test / steps.** Review public-facing material and related approvals.
Last verified: 2026-11-19

### [23.02] SOPs — Marketing follows a documented review SOP
{{index: advertising review | publication approval}}
**Rule.** Maintain an advertising-review procedure for staff and outside vendors. [S1 at F14; S3 at Patient experience]
**Test / steps.** Record the content, reviewer, approval date, and publication location.
Last verified: 2026-11-19

### [23.03] Controls — Marketing controls are checked before publication
{{index: marketing control | website review}}
**Rule.** The owner or delegated reviewer approves public material before release and checks site configuration quarterly. [S1 at F14]
**Test / steps.** Retain approvals and a dated site review.
Last verified: 2026-11-19

### [23.04] Metrics — Marketing measures use source indicators
{{index: advertising sign-off | tracker-free site}}
**Rule.** Track documented ad sign-offs and the source target of a tracker-free site. [S1 at F14]
**Test / steps.** Report review completion and unresolved site exceptions.
Last verified: 2026-11-19

## [24] Facilities and safety

### [24.01] Risks — Facility, equipment, and waste risks are visible
{{index: facilities operations | equipment maintenance; waste records}}
**Rule.** Track missed maintenance, incomplete shipment records, and failed safety checks. [S1 at F15]
**Test / steps.** Review the asset calendar, waste file, and safety-walk exceptions.
Last verified: 2026-11-19

### [24.02] SOPs — Facilities follow maintenance and waste SOPs
{{index: facilities SOP | preventive maintenance; safety walk}}
**Rule.** Maintain a preventive-maintenance calendar, waste procedure, and safety-walk checklist. [S1 at F15; S3 at Facilities]
**Test / steps.** Review after an asset, vendor, or site change.
Last verified: 2026-11-19

### [24.03] Controls — Facilities controls have daily and monthly checks
{{index: facility control | daily opening; monthly vendor review}}
**Rule.** The operations manager completes daily opening checks and reviews maintenance and waste records monthly. [S1 at F15; S3 at Facilities]
**Test / steps.** Keep checklist completion and exception closure evidence.
Last verified: 2026-11-19

### [24.04] Metrics — Facility measures use source targets
{{index: preventive maintenance completion | filed manifests}}
**Rule.** Target 100% preventive-maintenance completion and filed shipment records. [S1 at F15]
**Test / steps.** Report scheduled versus completed work and missing evidence.
Last verified: 2026-11-19

## [25] Purchasing and inventory

### [25.01] Risks — Stock and vendor exceptions are tracked
{{index: inventory management | expired supplies; vendor setup}}
**Rule.** Track expired-in-use items, stockouts, and unverified vendor changes. [S1 at F16]
**Test / steps.** Review counts, expiry records, and vendor-change evidence.
Last verified: 2026-11-19

### [25.02] SOPs — Purchasing follows inventory and vendor SOPs
{{index: purchasing SOP | inventory count; vendor approval}}
**Rule.** Maintain inventory and vendor-setup procedures. [S1 at F16; S3 at Facilities]
**Test / steps.** Document who orders, receives, and pays for each purchase.
Last verified: 2026-11-19

### [25.03] Controls — Inventory controls include a weekly count
{{index: inventory control | cycle count; two-quote rule}}
**Rule.** The assigned buyer performs weekly counts; an independent role reviews monthly variances. [S1 at F16; S3 at Facilities]
**Test / steps.** Retain count sheets, variance resolution, and quote comparisons.
Last verified: 2026-11-19

### [25.04] Metrics — Inventory measures use source targets
{{index: expired-in-use items | supplier comparison}}
**Rule.** Target zero expired-in-use items and apply the source two-quote rule. [S1 at F16]
**Test / steps.** Report exceptions, disposition, and review date.
Last verified: 2026-11-19

## [26] Continuity and cross-training

### [26.01] Risks — Single-person dependencies are identified
{{index: continuity planning | single-person dependency}}
**Rule.** Track critical tasks that depend on one person's knowledge or access. [S1 at F17; S4 at Two-deep coverage]
**Test / steps.** Review the task-to-backup matrix and open gaps.
Last verified: 2026-11-19

### [26.02] SOPs — Continuity work follows tested runbooks
{{index: continuity SOP | break-glass; runbook}}
**Rule.** Maintain a two-deep matrix, controlled break-glass instructions, and task runbooks. [S1 at F17; S4 at Two-deep coverage]
**Test / steps.** Have a backup perform each critical task and record the test.
Last verified: 2026-11-19

### [26.03] Controls — Continuity controls are exercised quarterly
{{index: continuity control | backup rotation}}
**Rule.** The operations lead coordinates quarterly backup rotations and annual runbook tests. [S4 at Coverage mechanics]
**Test / steps.** Keep the date, backup role, performed task, and result.
Last verified: 2026-11-19

### [26.04] Metrics — Continuity measures use the source target
{{index: two-deep coverage | backup-tested date}}
**Rule.** Target two trained people for every critical task and complete scheduled rotation days. [S1 at F17; S4 at Two-deep coverage]
**Test / steps.** Count only backups who performed the task within the previous six months.
Last verified: 2026-11-19

## [30] Prioritization

### [30.01] Four gates precede any additive score
{{index: prioritization gates | personal liability; irreversible funds; operating ability; active incident}}
**Rule.** Test every finding for G1 personal statutory liability, G2 irreversible money out, G3 threat to the right or ability to operate, and G4 an active incident before scoring. [S2 at Stage 1]
**Elements.** G3 includes a license or permit lapse that can stop practice; G4 includes a current patient-safety incident.
**Test / steps.** A true gate bypasses routine scoring and receives a named owner, interim control within 7 calendar days, and permanent fix within 30 calendar days.
**Open.** Legal escalation and incident response stay with the responsible professional and the Compliance desk.
Last verified: 2026-11-19

### [30.02] Findings without a gate use the six-factor formula
{{index: risk scoring | impact; likelihood; detectability; recoverability; aggregation}}
**Rule.** Score = impact × likelihood + legal + detection + recoverability − validated compensating-control credit + aggregation. [S2 at Stage 2]
**Elements.** Impact and likelihood are 1–5; legal is 0/2/4/6; detection and recoverability are 0/2/3; credit is 0–3; aggregation is 0/2.
**Test / steps.** Grant credit only with an independent named actor, required cadence, and verifiable artifact; a paper policy alone earns no credit.
**Open.** Scores order work; they are not measured probabilities.
Last verified: 2026-11-19

### [30.03] Tier bands set remediation timing
{{index: remediation tiers | seven-day interim; thirty-day permanent fix}}
**Rule.** Tier 1 is any gate or score ≥30; Tier 2 is 20–29; Tier 3 is 10–19; Tier 4 is below 10. [S2 at Tier assignment]
**Elements.** Tier 1: interim control ≤7 calendar days and permanent fix ≤30; Tier 2: interim ≤30 days and fix ≤90; Tier 3: fix within two quarters and monitor monthly; Tier 4: annual review.
**Test / steps.** Record tier, evidence, named owner, deadline, and review cadence in the register.
Last verified: 2026-11-19

## [40] SOP index

### [40.01] Operating SOPs are indexed by process
{{index: SOP index | procedure library; process owner}}
**Rule.** Locate the current SOP by its process title and assigned owner. [S3]
**Elements.** Governance and compliance; patient access, intake, and scheduling; clinical assessment, treatment planning, and consent; sedation operations; radiography and CBCT; infection prevention and reprocessing; medication and emergency readiness; implant and surgical case management; records, HIPAA, cybersecurity, and downtime; revenue cycle and financial controls; hiring and separation; patient experience and service recovery; facilities, inventory, vendors, and waste; incidents and continuous improvement.
**Test / steps.** Use the process owner and revision record in the core SOP manual; keep local procedures in the approved document repository.
Last verified: 2026-11-19

## [50] Training and cross-training

### [50.01] Recurring tasks have measurable standards
{{index: task standards | quality bar; time bar; evidence}}
**Rule.** Describe each recurring task by action, quality bar, time bar, and evidence. [S4 at Standards of performance]
**Test / steps.** Train to the standard and retain observed competency and sign-off.
Last verified: 2026-11-19

### [50.02] Critical work has two-deep coverage
{{index: two-deep coverage | continuity; backup person}}
**Rule.** Every critical function is performable by at least two people at two different locations. [S4 at Two-deep rule]
**Elements.** A backup counts only after performing the function within the last six months.
**Test / steps.** Maintain a matrix of function, primary, backup, and last tested date.
Last verified: 2026-11-19

### [50.03] Backup skills are exercised on a schedule
{{index: backup rotation | cross-location practice}}
**Rule.** Rotate a backup at the coverage location quarterly and test each runbook annually. [S4 at Coverage mechanics]
**Test / steps.** Retain the day's task records and the runbook test result.
Last verified: 2026-11-19

### [50.04] Training records identify due work
{{index: training tracker | expiry alerts; competency record}}
**Rule.** Check the training tracker monthly and issue 60/30/7-day expiry alerts. [S4 at Tracking system]
**Test / steps.** Record requirement, role, completion date, due date, evidence, and status.
Last verified: 2026-11-19

## [60] Patient experience and retention

### [60.01] Patient feedback is collected neutrally
{{index: patient voice | neutral survey; response rate}}
**Rule.** Offer a neutral survey and report its denominator, response rate, period, and channel. [S6 at Survey administration]
**Test / steps.** Keep eligible, completed, partial, unreachable, and opted-out counts distinct.
Last verified: 2026-11-19

### [60.02] Survey items measure separate domains
{{index: patient survey | access; communication; comfort}}
**Rule.** Keep satisfaction, return intention, and recommendation measures separate. [S6 at Patient-facing instrument]
**Elements.** Q01–Q16 use a 1–5 agreement scale with N/A or do-not-know; Q17 may use 0–10; Q18 is open text.
**Test / steps.** Report each domain with valid n and suppress small cells that risk identification.
Last verified: 2026-11-19

### [60.03] Generic patient survey items
{{index: survey instrument | patient questionnaire}}
**Examples.** The following items are reproduced verbatim because they are generic:

1. Q01 — It was easy to schedule an appointment that met my needs.
2. Q02 — I knew what to expect before my visit, including forms, costs and arrival instructions.
3. Q03 — The wait before I was seen was reasonable.
4. Q04 — If the office ran late, someone explained the delay and my options.
5. Q05 — The team welcomed me and treated me with respect.
6. Q06 — The dentist or team member listened carefully to my concerns.
7. Q07 — My dental problem and what would happen next were explained clearly.
8. Q08 — I understood my treatment options, including the option to decline treatment.
9. Q09 — I understood the expected costs and what could change them.
10. Q10 — The team helped me feel comfortable and managed my pain or anxiety.
11. Q11 — I was treated with dignity and my privacy was protected.
12. Q12 — I left with clear aftercare instructions and knew whom to contact with questions.
13. Q13 — It was easy to get the follow-up, lab result, referral or next appointment I needed.
14. Q14 — The team gave me useful guidance for my own oral health and home care.
15. Q15 — Overall, I was satisfied with this visit.
16. Q16 — I intend to return to this practice for future dental care.
17. Q17 — I would recommend this practice to someone else.
18. Q18 — What is the one thing we could do to improve your next visit?

[S6 at Patient-facing instrument]
Last verified: 2026-11-19

### [60.04] Service recovery closes the loop
{{index: service recovery | patient complaint; actual retention}}
**Rule.** Assign an owner and due date, investigate neutrally, act, confirm resolution, and examine recurring causes. [S6 at Service recovery]
**Test / steps.** Compare stated return intention with actual recall, reactivation, and referral completion by cohort.
**Open.** Association in published studies does not guarantee a retention outcome.
Last verified: 2026-11-19

## [70] Baseline audit and turnaround

### [70.01] Baseline findings are evidence-linked
{{index: baseline audit | evidence request; verification}}
**Rule.** Verify each reported issue before scoring it and attach an evidence artifact or record why evidence is unavailable. [S5 at Ground rules]
**Test / steps.** Complete the source audit sequence over ten business days, using the evidence request list, role interviews, and documented walkthroughs.
Last verified: 2026-11-19

### [70.02] Audit gaps move through a controlled workflow
{{index: audit workflow | risk register; false alarm}}
**Rule.** Mark each audit item pass, fail, or not applicable; route verified failures to the register and close disproved hypotheses with evidence. [S5 at Scoring and escalation]
**Test / steps.** Deliver an evidence-linked worksheet, risk register, and concise leadership evidence pack.
Last verified: 2026-11-19

### [70.03] Turnaround phases separate containment and sustainment
{{index: turnaround phases | containment; sustainment}}
**Rule.** Sequence the plan as baseline, stop-the-bleeding, standards build-out, improvement, and sustainment. [S1 at Part B]
**Elements.** Phase 0: weeks 1–2; Phase 1: days 1–30; Phase 2: days 31–90; Phase 3: months 4–6; Phase 4: months 7–12.
**Test / steps.** Use the priority register and assign an owner, due date, interim measure, and evidence artifact to each action.
Last verified: 2026-11-19

## [80] Glossary

- **Two-deep coverage** (UF: tested backup, cross-training) — two capable people at
  different locations can perform a critical task; §50.02.
- **Risk register** (UF: remediation register) — dated evidence, score, tier,
  owner, due date, and action for an operating finding; §30.03.
- **Service recovery** (UF: complaint resolution) — assigned response, investigation,
  action, confirmation, and learning from repeat issues; §60.04.
- **Recall effectiveness** (UF: recall completion) — source metric for returning
  patients who complete the intended follow-up; §12.04.

## [85] Changelog

- 2026-11-19 v0.1 — created the generic functions, operations, prioritization,
  training, patient-experience, and audit reference.

## [90] Sources

- [S1] Blake Reagan research package, _Turnaround plan template_, 2026-11-12. Accessed 2026-11-19. Grade: C.
- [S2] Blake Reagan research package, _Prioritization rubric_, 2026-11-12. Accessed 2026-11-19. Grade: C.
- [S3] Blake Reagan research package, _Core SOP manual_, 2026-11-12. Accessed 2026-11-19. Grade: C.
- [S4] Blake Reagan research package, _Operations training and cross-training_, 2026-11-12. Accessed 2026-11-19. Grade: C.
- [S5] Blake Reagan research package, _Phase 0 baseline audit protocol_, 2026-11-12. Accessed 2026-11-19. Grade: C.
- [S6] Blake Reagan research package, _Patient survey and retention guide_, 2026-11-12. Accessed 2026-11-19. Grade: C.

## [91] Cite index

<!-- authorities:start -->
- [S1] Blake Reagan research package, _Turnaround plan template_, 2026-11-12 → §10.01, 10.02, 10.03, 10.04, 11.01, 11.02, 11.03, 11.04, 12.01, 12.02, 12.03, 12.04, 13.01, 13.02, 13.03, 13.04, 14.01, 14.02, 14.03, 14.04, 15.01, 15.02, 15.03, 15.04, 16.01, 16.02, 16.03, 16.04, 17.01, 17.02, 17.03, 17.04, 18.01, 18.02, 18.03, 18.04, 19.01, 19.02, 19.03, 19.04, 20.01, 20.02, 20.03, 20.04, 21.01, 21.02, 21.03, 21.04, 22.01, 22.02, 22.03, 22.04, 23.01, 23.02, 23.03, 23.04, 24.01, 24.02, 24.03, 24.04, 25.01, 25.02, 25.03, 25.04, 26.01, 26.02, 26.04, 70.03
- [S2] Blake Reagan research package, _Prioritization rubric_, 2026-11-12 → §30.01, 30.02, 30.03
- [S3] Blake Reagan research package, _Core SOP manual_, 2026-11-12 → §10.03, 11.02, 11.03, 12.02, 12.03, 13.02, 14.02, 14.03, 15.02, 16.02, 16.03, 17.02, 17.03, 17.04, 18.02, 18.03, 19.02, 20.02, 22.02, 22.03, 23.02, 24.02, 24.03, 25.02, 25.03, 40.01
- [S4] Blake Reagan research package, _Operations training and cross-training_, 2026-11-12 → §13.03, 19.03, 20.03, 26.01, 26.02, 26.03, 26.04, 50.01, 50.02, 50.03, 50.04
- [S5] Blake Reagan research package, _Phase 0 baseline audit protocol_, 2026-11-12 → §70.01, 70.02
- [S6] Blake Reagan research package, _Patient survey and retention guide_, 2026-11-12 → §60.01, 60.02, 60.03, 60.04
<!-- authorities:end -->

## [92] Index

<!-- index:start -->

**A**
- access — *see* patient survey
- access review — *see* IT operations
- accountability — *see* governance ownership
- active incident — *see* prioritization gates
- actual retention — *see* service recovery
- adjustment policy — *see* claims workflow
- **advertising review** — §23.02
- **advertising sign-off** — §23.04
- aged AR — *see* net collections
- aged receivables — *see* revenue cycle
- aggregation — *see* risk scoring
- annual risk review — *see* IT control
- appointment templates — *see* patient access
- **assistant duties** — §13.01
- **assisting control** — §13.03
- **assisting SOP** — §13.02
- **audit workflow** — §70.02

**B**
- backup person — *see* two-deep coverage
- **backup rotation** — §50.03
- backup-tested date — *see* two-deep coverage
- backups — *see* IT operations
- **baseline audit** — §70.01
- billing adjustments — *see* revenue cycle
- board calendar — *see* owner review
- break-glass — *see* continuity SOP
- **business associate agreements** — §22.04

**C**
- chart audit — *see* clinical control
- charting — *see* clinical SOP
- **claims workflow** — §18.02
- **clinical control** — §11.03
- **clinical quality measure** — §11.04
- **clinical records** — §11.01
- **clinical SOP** — §11.02
- comfort — *see* patient survey
- communication — *see* patient survey
- competency record — *see* training tracker
- **compliance operations** — §21.01
- **compliance SOP** — §21.02
- containment — *see* turnaround phases
- continuity — *see* two-deep coverage
- **continuity control** — §26.03
- **continuity planning** — §26.01
- **continuity SOP** — §26.02
- corrective action — *see* HR SOP
- credentialed practice — *see* clinical records
- cross-location practice — *see* backup rotation
- CSMD check rate — *see* clinical quality measure
- current inspections — *see* registered imaging units
- current mill log — *see* laboratory metric
- cycle count — *see* inventory control

**D**
- daily close — *see* revenue control
- daily opening — *see* facility control
- daily safety checklist — *see* laboratory control
- daily schedule review — *see* front-office control
- delegated work — *see* assistant duties
- deposit reconciliation — *see* finance controls
- detectability — *see* risk scoring

**E**
- equipment maintenance — *see* facilities operations
- estimate log — *see* net collections
- evidence — *see* task standards
- evidence request — *see* baseline audit
- expired supplies — *see* inventory management
- **expired-in-use items** — §25.04
- expiry alerts — *see* training tracker

**F**
- **facilities operations** — §24.01
- **facilities SOP** — §24.02
- **facility control** — §24.03
- failed-test procedure — *see* reprocessing SOP
- failure drills — *see* weekly spore test target
- false alarm — *see* audit workflow
- filed manifests — *see* preventive maintenance completion
- **finance control** — §19.03
- **finance controls** — §19.01
- **finance SOP** — §19.02
- **front-office control** — §17.03
- **front-office SOP** — §17.02

**G**
- good faith estimate — *see* claims workflow
- **governance ownership** — §10.01
- **governance review streak** — §10.04

**H**
- **HR control** — §20.03
- **HR SOP** — §20.02
- **human resources** — §20.01
- **hygiene control** — §12.03
- hygiene production mix — *see* recall effectiveness
- **hygiene recall** — §12.01

**I**
- image quality — *see* radiography SOP
- **imaging units** — §16.01
- impact — *see* risk scoring
- incident response — *see* IT SOP
- infection prevention — *see* sterilization monitoring
- infection prevention control — *see* spore-log review
- **inventory control** — §25.03
- inventory count — *see* purchasing SOP
- **inventory management** — §25.01
- irreversible funds — *see* prioritization gates
- **IT control** — §22.03
- **IT operations** — §22.01
- **IT SOP** — §22.02

**L**
- **laboratory control** — §15.03
- **laboratory metric** — §15.04
- **laboratory safety** — §15.01
- **laboratory SOP** — §15.02
- lathe — *see* laboratory safety
- lathe sanitation — *see* laboratory SOP
- likelihood — *see* risk scoring

**M**
- **marketing control** — §23.03
- **marketing controls** — §23.01
- mill maintenance — *see* laboratory SOP
- milling — *see* laboratory safety
- month-end close — *see* finance SOP
- monthly register — *see* stale operating items
- monthly vendor review — *see* facility control

**N**
- **net collections** — §18.04
- neutral survey — *see* patient voice

**O**
- onboarding — *see* human resources
- operating ability — *see* prioritization gates
- overdue recall — *see* hygiene control
- owner dentist — *see* weekly governance control
- **owner review** — §10.02
- owner sign-off — *see* finance control

**P**
- **patient access** — §17.01
- patient complaint — *see* service recovery
- patient questionnaire — *see* survey instrument
- patient relations — *see* marketing controls
- **patient survey** — §60.02
- **patient voice** — §60.01
- payroll exposure — *see* finance controls
- periodontal protocol — *see* recall workflow
- periodontal services — *see* hygiene recall
- personal liability — *see* prioritization gates
- pre-assignment check — *see* assisting control
- prescribing — *see* clinical SOP
- prescribing workflow — *see* clinical records
- preventive maintenance — *see* facilities SOP
- **preventive maintenance completion** — §24.04
- **prioritization gates** — §30.01
- procedure library — *see* SOP index
- process owner — *see* SOP index
- publication approval — *see* advertising review
- **purchasing SOP** — §25.02

**Q**
- quality bar — *see* task standards
- quality register — *see* compliance operations
- quarterly restore — *see* IT control

**R**
- **radiography SOP** — §16.02
- **radiology control** — §16.03
- radiology inspections — *see* imaging units
- reactivation — *see* recall workflow
- **recall effectiveness** — §12.04
- **recall workflow** — §12.02
- **reconciliation streak** — §19.04
- records release — *see* front-office SOP
- records requests — *see* patient access
- records turnaround — *see* schedule fill
- recoverability — *see* risk scoring
- recovery testing — *see* business associate agreements
- **register review** — §21.03
- **registered imaging units** — §16.04
- **remediation tiers** — §30.03
- **reprocessing SOP** — §14.02
- response rate — *see* patient voice
- restore test — *see* IT SOP
- **revenue control** — §18.03
- **revenue cycle** — §18.01
- review cadence — *see* governance ownership
- review requests — *see* marketing controls
- risk register — *see* audit workflow
- **risk scoring** — §30.02
- role competency — *see* uncertified-duty events
- room turnover — *see* assistant duties
- room turnover checklist — *see* assisting SOP
- rubric sweep — *see* compliance SOP
- rules refresh — *see* compliance SOP
- runbook — *see* continuity SOP

**S**
- safety walk — *see* facilities SOP
- **schedule fill** — §17.04
- scheduling — *see* front-office SOP
- sedation — *see* clinical SOP
- separation checklist — *see* HR SOP
- **service recovery** — §60.04
- seven-day interim — *see* remediation tiers
- single-person dependency — *see* continuity planning
- **SOP index** — §40.01
- spore testing — *see* sterilization monitoring
- **spore-log review** — §14.03
- staff turnover — *see* human resources
- **stale operating items** — §21.04
- stale rule review — *see* register review
- **sterilization monitoring** — §14.01
- supplier comparison — *see* expired-in-use items
- **survey instrument** — §60.03
- sustainment — *see* turnaround phases

**T**
- **task standards** — §50.01
- thirty-day permanent fix — *see* remediation tiers
- time bar — *see* task standards
- tracker-free site — *see* advertising sign-off
- **training tracker** — §50.04
- **training tracker status** — §20.04
- **turnaround phases** — §70.03
- turnover trend — *see* training tracker status
- **two-deep coverage** — §26.04, §50.02
- two-quote rule — *see* inventory control

**U**
- **uncertified-duty events** — §13.04
- unit register — *see* radiology control

**V**
- vendor approval — *see* purchasing SOP
- vendor setup — *see* inventory management
- verification — *see* baseline audit

**W**
- waste records — *see* facilities operations
- website review — *see* marketing control
- weekly aging review — *see* revenue control
- **weekly governance control** — §10.03
- weekly review — *see* governance review streak
- weekly sign-off — *see* reconciliation streak
- **weekly spore test target** — §14.04
<!-- index:end -->

## [99] Health

<!-- health:start -->
_Refreshed 2026-11-19: 115 sections, 6 sources, 82 index terms._
- No findings.
<!-- health:end -->
