# Precog Commercial Assessment

**Assessment date:** 2026-09-19
**Update:** 2026-10-04 — the scorecard rows for evidence workflow, integrations, and multi-entity administration are refreshed below to what has shipped since (control evidence log, QuickBooks sync, firm workspace).
**Update:** 2026-10-06 — product scope. Precog is for any small business. Industry templates are content packs on one engine. The paid motion is a firm that serves many unlike clients. The 19 September dental-only verdict is superseded. The segment table, competitive frame, opportunities, build list, pricing, and conclusion below follow that scope. Competitor links from 19 September stay as research notes, not as the market the company is limited to.
**Verdict:** a horizontal control-design product for small businesses, sold mainly through firms. Not yet a category leader.

## Executive judgment

Precog serves owner-operated businesses of about 2 to 50 people in any line of work the product already templates: dental and medical offices, retail, professional services, restaurants, construction, auto dealerships and repair shops, nonprofits, and a general small business. The job is the same in each. Who can move or hide money alone, what stops when that person is away, and what gets checked each month.

The strongest offer is not a separate product per industry, and it is not an AI risk score. It is one responsibility, conflict, and evidence system. Industry packs change job titles, the prosecuted cases, and the monthly checklist. Bookkeepers and CPAs reuse that system across a mixed client list.

The present product is differentiated in design depth: it can model people, powers, conflicts, continuity gaps, proposed hires, safe reassignments, snapshots, and governance reports. It is not yet commercially defensible on outcome proof. QuickBooks read-only sync, the control-evidence log, and the firm workspace have shipped. The map is still mostly what a person entered. It does not yet prove that modeled assignments match live permissions, and evidence requests with due dates are still open.

The likely outcome by segment:

| Segment | Commercial attractiveness | Why |
| --- | ---: | --- |
| Owner-operated business, about 2–10 people, any industry | Medium as a free start; low as a paid plan alone | Real conflicts exist. Willingness to pay, and time to maintain a model, are limited. The free plan is how an owner starts. |
| Growing business, about 10–50 people, one or several locations | High | Enough people that duties can split, and usually no enterprise GRC team. |
| Bookkeepers, CPAs, and fractional CFOs with mixed clients | Very high | One firm repeats the same review across unlike clients. This is the paid product. |
| Multi-location operators, any industry | High | The same workflow, more sites. Not a separate company. |
| Large enterprises | Low for now | They require SSO, SCIM, procurement, and assurance Precog does not have. |
| Insurers and lenders | Later | Interest is real. Proof, data rights, and the sales cycle are not. |

Industry is a pack, not a segment of the company. A dental office and a restaurant are different checklists on the same engine.

## Competitive landscape

Competitors divide into adjacent categories. None of them is "the small-business control map."

### What small businesses already pay for

Accounting systems (QuickBooks first), payroll (Gusto, ADP, and the like), the bank, and the bookkeeper's spreadsheet. Their advantage is that they hold the transactions and the relationship. Precog should read them and not replace them. QuickBooks read-only sync has shipped. Payroll and access files import. A practice-management system, a POS, or a job-cost tool is a pack-level connector, built only when customers in that pack cannot finish the review without it.

### Industry analytics

Dental Intelligence, Practice by Numbers, Jarvis, and the analytics inside Denticon or CareStack are neighbors of the dental pack. Restaurant, retail, and construction tools play the same role in their packs. They answer what happened and how performance compares. Precog answers who can cause or conceal it, what evidence should exist, and how to change who does the work. Do not compete on their dashboards, and do not let one industry's vendors define the company.

### Clinical and other transaction AI

Overjet, Pearl, and revenue-cycle tools are not substitutes. Precog does not read radiographs, post claims, or run eligibility. If a pack later consumes an exception file from a system like that, the file is evidence routed to an owner. It is not a second product.

### Enterprise SoD, identity governance, and GRC

Pathlock, SafePaaS, Fastpath, SAP GRC, Oracle Risk Management, AuditBoard, and Workiva have connectors, policy engines, certification campaigns, evidence retention, and audit credibility. They are expensive, ERP-worded, and a poor fit for a 15-person business. Precog is easier to understand. It still falls short on connector coverage, an audit log the application role cannot rewrite, approval workflow, control testing, identity lifecycle enforcement, SSO/SCIM, and third-party assurance.

### Services and substitutes

The real competitors are the spreadsheet, the owner's memory, the bookkeeper, the CPA, a fraud examiner after a loss, a managed IT provider, and the insurer's checklist. They are already trusted and already budgeted. Precog has to make those people faster and more consistent. It does not replace their judgment.

## Current product scorecard

| Capability | Current position | Commercial requirement |
| --- | --- | --- |
| Shared duty model and industry packs | Strong early asset | One rulebook for cash, payables, payroll, refunds, and inventory. Packs change titles, cases, and checklists. Validate with operators and accountants from more than one pack. |
| Conflict detection | Good prototype | Measure precision and recall on real files from more than one pack. Support a policy change that names which packs it applies to. |
| Visual map and matrix | Differentiated | Validate usability on real teams, from a handful of people up to about 200. |
| Continuity and absence modeling | Differentiated | Add designated backups, effective dates, and drill evidence. |
| Resolution planning | Promising | Add constraints for location, license, capacity, employment, and system access. |
| Snapshots and exports | Useful | Approvals, retention, comparison, and a history that survives a later edit. |
| Knowledge and operating blueprint | Useful | Editorial governance and dated source provenance for every pack, not one industry. |
| Actual-vs-modeled validation | Partial (Oct 2026) | QuickBooks drift and access reconciliation exist. Still no proof the map matches live permissions. Measure the next gain on payroll or access exports. |
| Evidence workflow | Shipped (Oct 2026) | Control execution log, monthly-review bridge, preparer/reviewer split (`docs/CONTROL_EVIDENCE_WORKFLOW.md`). Remaining: evidence requests with due dates and approval history. |
| Integrations | Partial (Oct 2026) | QuickBooks read-only, payroll/access CSV, HR roster import. An industry system is a later pack connector, not the platform requirement. |
| Multi-entity administration | Shipped for firms (Oct 2026) | Firm workspace: clients, members, invites, billing, report versions (`/firm`). A group with many sites of its own still needs inherited policy and local exceptions. |
| Security and assurance | Early | Named operator, multi-factor sign-in for firm owners, an audit log the app role cannot rewrite, recovery, and a SOC 2 path when a buyer requires it. No business associate agreement. Protected health information is prohibited for every customer. |
| Outcome proof | Missing | Required before any claim that a loss was avoided. |

## Best market opportunities

### 1. The firm that serves unlike clients

Start with bookkeepers, CPAs, and fractional CFOs whose clients are not all in one industry. Give them the industry packs, a client list, evidence requests, review notes, a report they can send, and a monthly cycle. This buyer already owns the cadence. One deployment covers many templates. That is the marketplace, if one is earned: density among firms, not a separate Precog per industry.

### 2. The monthly review

Evidence requests, due dates, a reviewer who did not prepare the work, and a locked version. This is what makes a firm come back. A residual score does not.

### 3. Access certification for a small team

Recurring confirmation of who can release a payment, change a vendor, export a list, or run payroll, with a leaver check. Feed it from QuickBooks and from a payroll or access file. This turns a one-time map into a workflow.

### 4. A fixed-scope assessment when the business changes

A sale, a new location, a new bookkeeper, or a suspected loss. Deliver the map, the conflicts, the continuity gaps, and a dated remediation list. Any industry. The event has a budget. It should convert to the monthly Firm plan, not become a consulting practice.

### 5. Insurers and lenders

Only after observed results exist. Not the first channel.

## Proving the value of avoided cost

Do not claim that a year without a recorded fraud was savings. Use a layered model.

### Layer 1: directly observed value

- Hours to finish the map, the bank review, the snapshot, and the questions an outsider asked.
- Time from an employee's last day to removing the access the map still shows.
- Time from a conflict to a recorded decision.
- Duplicate payments, unsupported refunds, stale credits, missed deposits, payroll exceptions, and access anomalies actually found, with amounts.
- Advisor hours spent, and how fast a report went out.

### Layer 2: leading indicators

- High-risk duties with a named owner and a trained backup.
- Critical conflicts eliminated, dual-controlled, or formally accepted. Accepted stays visible.
- Privileged access confirmed on time.
- Leavers removed inside the target interval, once a connector can show it.
- In-scope checks with a complete record.
- Median age of open exceptions.
- Share of imported access that matches the approved map.

### Layer 3: modeled avoided loss

Present this as an estimate:

`expected loss avoided = exposure × baseline event probability × estimated control risk reduction`

Show a low, a base, and a high. Source every input. Never collapse the range into one official number. Keep fraud, cyber, revenue leakage, interruption, and compliance separate. A case from the library is about another business.

### Layer 4: causal evidence

Only after enough customers exist: stepped rollout across sites, comparison with sites not yet on Precog, and matched comparisons by size, industry pack, and transaction volume. Pre-register the measures.

The credible claim until then is: the review took fewer hours, and these gaps were closed or accepted. Not: Precog prevented a stated dollar loss.

## Success metrics

### Product activation

- First usable map: under 60 minutes with an advisor, under one business day self-serve.
- At least 80% of high-risk duties assigned in the first session.
- At least one report or recorded decision in week one.

### Ongoing use

- Second monthly cycle completed by more than 60% of paying firms.
- At least 70% of critical items closed or decided inside the agreed interval.
- Control owners back in the product during the month, above 50% where the firm assigned them work.

### The map

- Critical open conflicts down at least 50% within 90 days, counting accepted risk as still open.
- High-risk duties with a backup up at least 30 percentage points.
- Evidence complete for at least 90% of in-scope checks.
- A measured drop in review hours.

### Commercial

- Firm pilot-to-paid conversion above 40%.
- Net revenue retention above 105% from added clients, not from a higher score.
- Gross retention above 90% for firms.
- Payback under 12 months.
- Implementation effort under 25% of first-year fees once packs are reused.

## What must be built

### Next 90 days

1. Interview at least 20 buyers: bookkeepers, CPAs, fractional CFOs, and owners, covering at least three industry packs.
2. Run five paid assessments on real staff and access data, using at least three different templates among them.
3. Measure false-positive rate, time to map, whether findings were accepted, and whether the report was sent.
4. Ship evidence requests with due dates, comments, and approval history. The firm workspace itself has shipped.
5. Write the rule for a rule change: source, packs affected, editor, approver, effective date. Do not add conflict rules without that record.
6. Close the trust gaps that apply to every customer: the legal name and address on the terms, multi-factor sign-in for anyone who can lock a report or connect QuickBooks, and an activity log the application's database role cannot rewrite. Do not store protected health information. Do not offer a business associate agreement.

### Next 6–12 months

1. Deepen QuickBooks and one payroll or access source used across packs. Measure what share of rows map without a person. Add a pack-specific connector only after customers in that pack are blocked without it.
2. Reconcile approved duties to the export, and leave unmatched rows in a queue.
3. Add certification campaigns and leaver alerts.
4. Import exception lists: new vendors, bank-detail changes, refunds, payroll changes, bulk exports.
5. Print a value note from observed hours and closed gaps. Keep modeled loss in a separate section.
6. Let a multi-site business inherit a policy and record a local exception.

## Pricing hypotheses to test

- Firm plan: price by active client businesses, as the Starter, Practice, and Firm tiers already do. Publish every tier. "Write to Support" is not a price.
- Assessment: a fixed fee for one client that can convert to the Firm plan.
- The single-business plan stays free. It is the start, not the revenue plan.
- Do not price as a percentage of hypothetical savings.
- Do not add a cheap paid tier whose only customer is a one-person shop. Support will cost more than the fee.

## Go / no-go gates

Continue if, after five paid design partners in at least three industry packs:

- Three or more commit to another monthly cycle.
- A credible map is finished in under one business day.
- At least half of critical findings are judged valid and actionable.
- The customer can point to hours saved or a gap closed that is worth the annual fee.
- At least one firm puts three paying clients on Precog, and those clients are not all the same template.

If every paying user is in one pack, keep the other packs as templates and maintain the pack people pay for. Do not rewrite the company as that industry, and do not claim the horizontal product is proven.

Treat it as an internal tool rather than a company if buyers praise the report and will not maintain it, no firm will own the second cycle, or every sale needs custom integration.

## Honest conclusion

The concept is commercially plausible as the control map and monthly review for small businesses, sold through firms that serve many of them. The application is still a **decision-support product**, not a system of record and not continuous monitoring.

The decisive question is not whether another industry template can be added. It can. The decisive question is whether a firm will keep the map aligned with people, access, and evidence for clients that do not share an industry, and will finish a second month. The next investment is that discovery, evidence due dates, the firm workspace, and the accounting and payroll connections small businesses already have. Not another score, and not a single-industry rewrite.

## Competitor/source verification note

Validate competitor claims before anything public. Pages useful for the dental pack, checked as category context on 2026-09-19 and not as Precog's market boundary:

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

The 19 September pass used category positioning because outbound access to those pages was blocked in the review environment. It does not assert feature-by-feature parity.
