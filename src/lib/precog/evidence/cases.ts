import type { CaseStudy } from "./types";

/**
 * Real U.S. federal prosecutions of occupational fraud against small
 * organizations.
 *
 * Selection criteria — a case earns a place here only if it shows all three:
 *   1. The victim was a small business, practice, or nonprofit, not a
 *      corporation with an internal audit department.
 *   2. The press release describes the *mechanism*, so the control gap is
 *      identifiable rather than guessed at.
 *   3. A dollar figure and, where possible, a duration are stated.
 *
 * Every record links to the charging office's own press release. Readers who
 * want to confirm a figure open the link; nothing here asks for trust.
 *
 * On detection route: federal press releases rarely state how a scheme was
 * caught, so most records carry `detection: "unknown"`. That gap is itself
 * informative and is why the benchmark layer carries the ACFE detection-route
 * distribution separately. Inventing a detection route to fill the field would
 * defeat the purpose of the library.
 *
 * On naming: defendants are named only where the source names them and the
 * case has resolved. The victim organization is named only where the source
 * names it. This library describes control failures, never character.
 */
export const CASE_LIBRARY: CaseStudy[] = [
  {
    id: "case-amk-hvac",
    title: "HVAC company office manager wrote 100+ checks to herself over two years",
    sector: "trades",
    schemes: ["check-tampering", "payroll"],
    howItWorked:
      "The office manager of AMK Heating and Cooling in Edwardsville, Illinois held both the company checkbook and the accounting software login. She wrote more than 100 checks payable to herself, forged the owner's signature, and coded the payments in the books as payroll and as loans from the company so the ledger balanced.",
    controlGap:
      "One person held check-writing custody and the accounting records, and no one outside that role reconciled the bank statement. A forged signature on a real company check clears the bank; only an independent look at the cleared-check images catches it.",
    lossUsd: 158658.41,
    lossIsFloor: false,
    durationMonths: 24,
    detection: "unknown",
    resolvedYear: 2025,
    sodRuleIds: ["rule-cash-rec", "rule-deposit-post"],
    wouldHaveCaughtIt: [
      "Owner opens the bank statement unopened and reviews cleared-check images before anyone else handles it",
      "Bank Positive Pay: the bank pays only checks on a list the owner uploads",
      "Payroll register reviewed against the payroll bank debit each cycle",
    ],
    source: {
      publisher: "U.S. Attorney's Office, Southern District of Illinois",
      url: "https://www.justice.gov/usao-sdil/pr/former-small-business-office-manager-sentenced-4-years-federal-prison-embezzlement",
      grade: "primary-document-reported",
    },
    caveat:
      "Restitution was ordered at $168,536.12, which exceeds the $158,658.41 embezzled because it also covers a separate credit-card identity theft against a coworker.",
  },
  {
    id: "case-boston-dental",
    title: "Dental practice office manager diverted 276 insurance checks over roughly five years",
    sector: "dental",
    schemes: ["receivables-diversion"],
    howItWorked:
      "The office manager of a Boston-area dental practice was responsible for tracking patient invoices, depositing insurance payments into the practice account, and recording those deposits in the books. She diverted at least 276 checks from insurers to herself and recorded the deposits as though they had been made.",
    controlGap:
      "Custody of incoming payments and the recording of those payments sat with the same person. When the person who opens the mail is also the person who says what arrived, the books will always agree with the deposit — because both are written by the same hand.",
    lossUsd: 348000,
    lossIsFloor: true,
    durationMonths: 72,
    detection: "unknown",
    resolvedYear: 2017,
    sodRuleIds: ["rule-cash-rec", "rule-custody-rec", "rule-deposit-post"],
    wouldHaveCaughtIt: [
      "Insurance remittances routed to a lockbox or to electronic funds transfer, so no employee handles a payable check",
      "Owner compares the practice-management system's insurance-payment report to the bank deposit total monthly",
      "Someone other than the depositor reconciles the bank account",
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Massachusetts",
      url: "https://www.justice.gov/usao-ma/pr/former-office-manager-boston-dental-practice-sentenced-bank-fraud-identity-theft-and-tax",
      grade: "primary-document-reported",
    },
    caveat:
      "The scheme ran from 2009 through December 2014. The figure is stated in the source as more than $348,000.",
  },
  {
    id: "case-houston-dental-shell",
    title: "Dental practice payments rerouted to a shell company, found only when the owner prepared to retire",
    sector: "dental",
    schemes: ["billing-shell-vendor", "receivables-diversion"],
    howItWorked:
      "The financial coordinator of a Houston dental practice formed a company named SGS Healthcare and directed practice revenue to it. Insurance checks written payable to the practice were deposited into accounts she controlled. The dentist had been in business 38 years. In July 2021 he began a detailed review of his own company accounts to prepare for retirement, and that review is what surfaced the scheme.",
    controlGap:
      "Nobody outside the role could see which entities the practice paid or received through, and no one independently confirmed that insurer payments landed in the practice's own account. The owner had not examined the accounts closely in years.",
    lossUsd: 243597,
    lossIsFloor: false,
    detection: "owner-review",
    resolvedYear: 2022,
    sodRuleIds: ["rule-vendor-create-pay", "rule-cash-rec"],
    wouldHaveCaughtIt: [
      "Owner reviews the list of new payees and vendors monthly — a five-minute report in any accounting package",
      "Bank alerts on new payees and on any account change",
      "Annual confirmation with major insurers of the remittance account on file",
    ],
    source: {
      publisher: "U.S. Attorney's Office, Southern District of Texas",
      url: "https://www.justice.gov/usao-sdtx/pr/local-woman-sentenced-embezzling-funds-dental-office",
      grade: "primary-document-reported",
    },
    caveat:
      "The $243,597 figure is the loss the practice's own outside auditor identified; the charged conduct is described as more than $200,000. Sentence was 41 months. This is the clearest case in the library for how these schemes usually end: not through a control, but because an owner finally looked. An owner who only looks at retirement is choosing a detection window measured in decades.",
  },
  {
    id: "case-stamford-dental-billing",
    title: "Dental office manager billed 37 insurers under a stolen provider identity",
    sector: "dental",
    schemes: ["billing-shell-vendor", "financial-statement"],
    howItWorked:
      "The office manager of a Stamford, Connecticut dental practice submitted claims to 37 private insurers for work attributed to a dentist whose identity she had taken. Insurers paid approximately $581,729 to the practice on those claims.",
    controlGap:
      "Claim submission authority sat with one person and no one verified that the rendering provider on a claim was a provider who actually worked that day. The practice bank account received the proceeds, which put the practice itself on the hook.",
    lossUsd: 581729,
    lossIsFloor: false,
    durationMonths: 48,
    detection: "bank-or-insurer",
    resolvedYear: 2019,
    sodRuleIds: ["rule-claims-writeoff", "rule-admin-writeoff"],
    wouldHaveCaughtIt: [
      "Monthly production-by-provider report compared against the actual schedule",
      "Provider credentialing list reviewed by the owner against claims submitted",
      "Any claim naming a provider not on the day's schedule flagged before submission",
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Connecticut",
      url: "https://www.justice.gov/usao-ct/pr/stamford-dental-office-manager-sentenced-prison-defrauding-insurance-companies",
      grade: "primary-document-reported",
    },
    caveat:
      "This case runs the other direction from embezzlement: the money flowed into the practice, and the practice carried the repayment and reputational exposure. Billing ran from 2005 to 2016; the $581,729 reflects insurer payments between 2011 and 2015.",
  },
  {
    id: "case-dennys-franchise-vendors",
    title: "Restaurant group operations director invented vendors and their email traffic",
    sector: "restaurant",
    schemes: ["billing-shell-vendor", "payroll"],
    howItWorked:
      "The Director of Operations for MI5, Inc., a Denny's franchisee running eight restaurants across Minnesota and Wisconsin, submitted payment requests for vendors that did not exist. She built out the deception: fake email accounts in the vendors' names and fabricated email threads in which she impersonated their staff. She received roughly $336,000 in vendor payments and about $20,000 in payroll issued under other people's identities.",
    controlGap:
      "The same role could add a vendor and approve payment to it. Supporting documentation was accepted at face value because it arrived by email from what looked like a vendor, and no one matched new vendors against an independent record such as a business registration or a W-9.",
    lossUsd: 356000,
    lossIsFloor: true,
    durationMonths: 63,
    detection: "unknown",
    resolvedYear: 2022,
    sodRuleIds: [
      "rule-vendor-create-pay",
      "rule-vendor-create-approve",
      "rule-vendor-approve-pay",
      "rule-payroll",
    ],
    wouldHaveCaughtIt: [
      "A second person approves every new vendor before its first payment, checking a W-9 and a real business address",
      "New-vendor report reviewed monthly by the owner",
      "No vendor paid to a bank account that matches an employee's",
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Minnesota",
      url: "https://www.justice.gov/usao-mn/pr/kenyon-bookkeeper-sentenced-more-9-years-prison-881000-employer-embezzlement-and-tax",
      grade: "primary-document-reported",
    },
    caveat:
      "The $356,000 recorded here is the sum of the two stated components — approximately $336,000 in bogus vendor payments plus approximately $20,000 in fraudulent payroll. The prosecution's overall figure for the embezzlement and tax scheme together is $881,000; the larger number includes tax offenses and is not a like-for-like measure of money taken from the employer. Scheme ran April 2014 to July 2019.",
  },
  {
    id: "case-hutchinson-controller",
    title: "Construction controller held every finance duty and took $2.06 million over six years",
    sector: "construction",
    schemes: ["check-tampering", "expense-reimbursement"],
    howItWorked:
      "The financial controller of a heavy civil construction company in Hutchinson, Minnesota was responsible for payroll, accounts receivable, accounts payable, the company credit cards, and the corporate bank accounts — the entire cash cycle. She cut checks that appeared on the books to settle company obligations, then directed the actual payments to her own credit card balances, tax bills, and personal expenses.",
    controlGap:
      "This is total concentration of the finance function in one role with no independent review at any point. Every check she wrote, she also recorded, reconciled, and reported on. There was no step in the cycle that another person touched.",
    lossUsd: 2061328.67,
    lossIsFloor: false,
    durationMonths: 77,
    detection: "unknown",
    resolvedYear: 2021,
    sodRuleIds: [
      "rule-cash-rec",
      "rule-custody-rec",
      "rule-deposit-post",
      "rule-vendor-create-pay",
      "rule-payroll",
      "rule-admin-pay",
    ],
    wouldHaveCaughtIt: [
      "Owner receives the bank statement directly and reviews cleared-check images and the credit-card statement before the controller sees them",
      "Any single duty moved out of the role — even just the bank reconciliation — breaks the cycle",
      "Dual signature or dual electronic release on payments above a set threshold",
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Minnesota",
      url: "https://www.justice.gov/usao-mn/pr/hutchinson-woman-sentenced-prison-embezzling-more-2-million-employer",
      grade: "primary-document-reported",
    },
    caveat: "Scheme ran August 2013 through December 2019.",
  },
  {
    id: "case-florida-construction-payroll",
    title: "Construction office manager of 27 years raised her own pay $1,000, then $2,000, a week",
    sector: "construction",
    schemes: ["payroll", "expense-reimbursement"],
    howItWorked:
      "The office manager of a family-owned Florida construction company paid her personal credit cards directly from company bank accounts from at least 2008. Beginning in 2013 she also altered her own payroll, starting at an extra $1,000 per week and escalating to $2,000 per week by the time the owner found it. The total taken was at least $700,000.",
    controlGap:
      "The person who processed payroll could change her own rate, and nobody outside the role compared the payroll register against what the owner believed people were paid. Twenty-seven years of tenure had been allowed to substitute for a control.",
    lossUsd: 700000,
    lossIsFloor: true,
    detection: "owner-review",
    sodRuleIds: ["rule-payroll", "rule-admin-pay"],
    wouldHaveCaughtIt: [
      "Owner approves the payroll register every cycle — a one-page list of names and amounts",
      "Anyone's own pay rate change requires a second person's approval, without exception for the person who runs payroll",
      "Company credit card statements opened and reviewed by the owner",
    ],
    source: {
      publisher: "U.S. Attorney's Office, Middle District of Florida",
      url: "https://www.justice.gov/usao-mdfl/pr/long-time-employee-local-construction-firm-sentenced-prison-embezzlement",
      grade: "primary-document-reported",
    },
    caveat:
      "The source describes the credit-card payments as dating back to at least 2008 without giving an end date, so no duration is recorded. The escalation pattern — starting small, growing when nothing happens — is the part worth noticing.",
  },
  {
    id: "case-attleboro-expense-padding",
    title: "Office manager added $268,046 in expense reimbursements to her own paychecks",
    sector: "professional-services",
    schemes: ["expense-reimbursement", "payroll"],
    howItWorked:
      "Over roughly five years, the office manager of an environmental services business in Franklin, Massachusetts inflated her own compensation, including approximately $268,046 in expense reimbursements for expenses she had not incurred. The total embezzled exceeded $400,000.",
    controlGap:
      "Expense reimbursements ran through payroll, where they are easy to miss: a reimbursement is not taxed and does not show up as a raise. The person entering them was the person receiving them.",
    lossUsd: 400000,
    lossIsFloor: true,
    durationMonths: 63,
    detection: "unknown",
    resolvedYear: 2025,
    sodRuleIds: ["rule-payroll"],
    wouldHaveCaughtIt: [
      "Every reimbursement over a small threshold requires a receipt and a second person's approval",
      "Owner reviews gross-to-net payroll totals, not just the net amount leaving the bank",
      "Reimbursements paid separately from payroll, so they are visible as their own line",
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Massachusetts",
      url: "https://www.justice.gov/usao-ma/pr/attleboro-woman-pleads-guilty-embezzling-more-400000",
      grade: "primary-document-reported",
    },
    caveat:
      "Scheme ran December 2019 through March 2025; guilty plea entered October 2025. Sentencing followed the reported plea.",
  },
  {
    id: "case-restaurant-franchisee-idaho",
    title: "Restaurant franchise employee took $685,376 from a national-chain franchisee",
    sector: "restaurant",
    schemes: ["cash-larceny", "billing-shell-vendor"],
    howItWorked:
      "An employee of a franchisee operating locations of national restaurant chains diverted $685,376 from his employer, charged and sentenced as wire fraud.",
    controlGap:
      "Multi-location franchise operations concentrate bookkeeping at one back office while the owner's attention is spread across sites. Volume of small transactions across locations is what hides the aggregate.",
    lossUsd: 685376,
    lossIsFloor: false,
    detection: "unknown",
    resolvedYear: 2024,
    sodRuleIds: ["rule-cash-rec", "rule-vendor-create-pay"],
    wouldHaveCaughtIt: [
      "Per-location cash-to-deposit variance report reviewed weekly by the owner",
      "Comparison of the same expense line across locations — an outlier site is the fastest signal a multi-unit owner has",
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Idaho",
      url: "https://www.justice.gov/usao-id/pr/mountain-home-man-sentenced-27-months-embezzlement",
      grade: "primary-document-reported",
    },
    caveat:
      "The reported summary gives the amount and the 27-month sentence but not the scheme mechanism in detail. The control-gap reading above is a general characteristic of multi-unit franchise bookkeeping, not a finding stated in the source.",
  },
  {
    id: "case-nonprofit-human-first",
    title: "Nonprofit executive director spent $836,000 of agency money over five years",
    sector: "nonprofit",
    schemes: ["expense-reimbursement", "corruption"],
    howItWorked:
      "The executive director of Human First, Inc., a Long Island nonprofit, used agency funds over more than five years in the role for personal spending including international travel, spas, salons, restaurants, and elective cosmetic surgery.",
    controlGap:
      "A board that meets quarterly and reads a summary is not a control over the executive director's own spending. Without someone reviewing the ED's card statement line by line, the position reviews itself.",
    lossUsd: 836000,
    lossIsFloor: false,
    durationMonths: 60,
    detection: "unknown",
    resolvedYear: 2019,
    sodRuleIds: ["rule-admin-pay", "rule-vendor-create-pay"],
    wouldHaveCaughtIt: [
      "A named board member reviews the executive director's card statement and expense claims monthly, line by line",
      "The executive director does not approve their own expenses under any threshold",
      "Annual independent financial review, even where an audit is not required",
    ],
    source: {
      publisher: "U.S. Attorney's Office, Eastern District of New York",
      url: "https://www.justice.gov/usao-edny/pr/former-executive-director-long-island-charity-sentenced-over-two-years-prison",
      grade: "primary-document-reported",
    },
    caveat:
      "Sentence was 33 months, with $836,000 forfeited and $1,415,000 ordered in restitution. The restitution figure exceeds the forfeiture and is the better measure of total harm to the organization.",
  },
  {
    id: "case-modest-needs-fake-board",
    title: "Charity founder fabricated a board of directors to approve his own spending",
    sector: "nonprofit",
    schemes: ["corruption", "financial-statement"],
    howItWorked:
      "The founder and chief executive of the Modest Needs Foundation diverted donations intended for low-income families to personal use, including a luxury Manhattan apartment and restaurant spending. To make the spending look authorized, he created a fictitious board of directors and represented that it had approved his expenses and was overseeing the organization.",
    controlGap:
      "The oversight body existed only on paper. This is the failure mode that matters most for a very small organization: a control that is documented but never performed is worse than no control, because it stops anyone from asking the question.",
    lossUsd: 0,
    lossIsFloor: true,
    detection: "unknown",
    resolvedYear: 2026,
    sodRuleIds: ["rule-admin-pay"],
    wouldHaveCaughtIt: [
      "Confirm that named directors or advisors know they hold the role and have actually met",
      "Minutes signed by a second person who attended",
      "Any approval a control relies on must leave evidence someone else can check",
    ],
    source: {
      publisher: "U.S. Attorney's Office, Southern District of New York",
      url: "https://www.justice.gov/usao-sdny/pr/founder-and-former-ceo-charity-pleads-guilty-multimillion-dollar-charity-fraud-and-tax",
      grade: "primary-document-reported",
    },
    caveat:
      "Charged as a multimillion-dollar scheme; no single reliable total is recorded here. This case is included for the fabricated-oversight mechanism rather than for its dollar figure.",
  },
  {
    id: "case-dc-architecture-firm",
    title: "Architecture firm office manager took nearly $280,000",
    sector: "professional-services",
    schemes: ["check-tampering", "expense-reimbursement"],
    howItWorked:
      "The office manager of a Washington, D.C. architecture firm stole nearly $280,000 from the firm.",
    controlGap:
      "Design and professional-services firms typically run a single administrative role covering billing, payables, and bookkeeping, with partners focused on client work. The billing cycle is irregular enough that a missing payment does not stand out.",
    lossUsd: 280000,
    lossIsFloor: true,
    detection: "unknown",
    sodRuleIds: ["rule-cash-rec", "rule-deposit-post"],
    wouldHaveCaughtIt: [
      "A partner reviews the aged receivables list monthly and asks about anything written off",
      "Bank statement delivered to a partner, not to the administrator",
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Columbia",
      url: "https://www.justice.gov/usao-dc/pr/former-office-manager-sentenced-prison-term-theft-nearly-280000-dc-architecture-firm",
      grade: "primary-document-reported",
    },
    caveat:
      "The reported summary states the amount and the firm type but not the mechanism. The control-gap reading is a general characteristic of professional-services back offices rather than a finding stated in the source.",
  },
  {
    id: "case-bellingham-assistant-manager",
    title: "Assistant office manager took $1.4 million from a Bellingham business",
    sector: "professional-services",
    schemes: ["check-tampering"],
    howItWorked:
      "The former assistant office manager of a business in Bellingham, Washington embezzled approximately $1.4 million and received a two-year federal sentence.",
    controlGap:
      "The title is the point. Oversight is usually designed around the office manager, and the deputy role inherits the same system access with none of the attention.",
    lossUsd: 1400000,
    lossIsFloor: false,
    detection: "unknown",
    sodRuleIds: ["rule-cash-rec", "rule-admin-pay"],
    wouldHaveCaughtIt: [
      "Review who holds which system permissions, not who holds which job title",
      "Remove payment-release rights from anyone whose work does not require them",
    ],
    source: {
      publisher: "U.S. Attorney's Office, Western District of Washington",
      url: "https://www.justice.gov/usao-wdwa/pr/former-assistant-office-manager-bellingham-business-sentenced-two-years-prison-14",
      grade: "primary-document-reported",
    },
    caveat:
      "The reported summary gives amount and sentence but not the mechanism or duration.",
  },
  {
    id: "case-kearny-medical-receptionist",
    title: "Medical office receptionist cashed $446,000 of insurer checks over four years",
    sector: "medical",
    schemes: ["receivables-diversion", "skimming"],
    howItWorked:
      "A receptionist at a medical practice in Kearny, New Jersey took, cashed, and concealed more than $446,000 in checks that insurance companies had paid to the practice for patient services, between 2007 and 2011. She separately obtained more than $200,000 in goods and services on fraudulent credit cards.",
    controlGap:
      "The front-desk role received the mail. Where incoming payments and the record of incoming payments meet at the same desk, there is nothing to compare against anything. Seniority is not the variable here — a receptionist held enough access to run this for four years.",
    lossUsd: 446000,
    lossIsFloor: true,
    durationMonths: 48,
    detection: "unknown",
    resolvedYear: 2013,
    sodRuleIds: ["rule-collect-post", "rule-custody-rec", "rule-deposit-post"],
    wouldHaveCaughtIt: [
      "Incoming payments logged by whoever opens the mail, before they reach the person who posts them",
      "Electronic remittance from insurers so no payable check passes through the office at all",
      "Owner compares expected insurer payments against deposits monthly",
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of New Jersey",
      url: "https://www.justice.gov/usao-nj/pr/medical-office-receptionist-sentenced-34-months-prison-embezzlement-credit-card-fraud-and",
      grade: "primary-document-reported",
    },
    caveat: "Sentence was 34 months.",
  },
  {
    id: "case-void-no-sale-counter",
    title: "Counter clerk recorded sales as voids and no-sales to cut the cash he had to turn in",
    sector: "any",
    schemes: ["skimming", "cash-larceny"],
    howItWorked:
      "A front-counter clerk took customer payments and did not record the sales. He entered voided and no-sale transactions instead, which reduced the cash the register said he owed, and remitted the lower figure in his daily deposit. The gap between goods that left and cash that came back was the only trace.",
    controlGap:
      "The person taking the money could also cancel the record of taking it. A void is an ordinary, necessary function — which is exactly why it works as a concealment tool. Nobody was reviewing void and no-sale activity by employee.",
    lossUsd: 0,
    lossIsFloor: true,
    durationMonths: 8,
    detection: "unknown",
    resolvedYear: 2014,
    sodRuleIds: ["rule-collect-post", "rule-writeoff", "rule-custody-rec"],
    wouldHaveCaughtIt: [
      "Weekly report of voids, no-sales, and discounts grouped by employee — the outlier is visible at a glance",
      "Voids above a small amount require a second person's code at the time, not an explanation later",
      "Inventory or production volume compared against recorded sales",
    ],
    source: {
      publisher: "U.S. Attorney's Office, Western District of Missouri",
      url: "https://www.justice.gov/usao-wdmo/pr/former-postal-worker-pleads-guilty-stealing",
      grade: "primary-document-reported",
    },
    caveat:
      "The employer here was the U.S. Postal Service, not a small business, and no reliable loss total is recorded. It is included because the mechanism — void and no-sale entries used to suppress recorded cash — is exactly what a small retail counter, restaurant till, or practice front desk faces, and because no comparable small-business case surfaced with the mechanism described this plainly. Conduct ran June 2013 to February 2014.",
  },
];
