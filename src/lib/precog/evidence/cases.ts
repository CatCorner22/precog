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
    sodRuleIds: ["rule-cash-rec"],
    wouldHaveCaughtIt: [
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner opens the bank statement unopened and reviews cleared-check images before anyone else handles it",
      },
      {
        control: "positive-pay",
        asApplied: "Bank Positive Pay: the bank pays only checks on a list the owner uploads",
      },
      {
        control: "payroll-register-review",
        asApplied: "Payroll register reviewed against the payroll bank debit each cycle",
      },
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
      "The office manager of a Boston-area dental practice was responsible for tracking patient invoices, depositing insurance payments into the practice account, and recording those deposits in the books. She diverted at least 276 checks from insurers to herself and recorded the deposits as though they had been made. She made the insurers' checks payable to herself, forged the practice owner's signature on them, and deposited them into her own account.",
    controlGap:
      "Custody of incoming payments and the recording of those payments sat with the same person. When the person who opens the mail is also the person who says what arrived, the books will always agree with the deposit — because both are written by the same hand.",
    lossUsd: 348000,
    lossIsFloor: true,
    durationMonths: 72,
    detection: "unknown",
    resolvedYear: 2020,
    sodRuleIds: ["rule-collect-post", "rule-deposit-post"],
    wouldHaveCaughtIt: [
      {
        control: "electronic-remittance",
        asApplied:
          "Insurance remittances routed to a lockbox or to electronic funds transfer, so no employee handles a payable check",
      },
      {
        control: "expected-receipts-vs-deposits",
        asApplied:
          "Owner compares the practice-management system's insurance-payment report to the bank deposit total monthly",
      },
      {
        control: "independent-bank-reconciliation",
        asApplied: "Someone other than the depositor reconciles the bank account",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Massachusetts",
      url: "https://www.justice.gov/usao-ma/pr/former-office-manager-boston-dental-practice-sentenced-bank-fraud-identity-theft-and-tax",
      grade: "primary-document-reported",
    },
    caveat:
      "The scheme ran from 2009 through December 2014. The figure is stated in the source as more than $348,000. Yuliya Vaysglus was terminated in February 2015 and pled guilty in June 2020 to bank fraud, aggravated identity theft, and filing false tax returns; 41 months.",
  },
  {
    id: "case-houston-dental-shell",
    title:
      "Dental practice payments rerouted to a shell company, found only when the owner prepared to retire",
    sector: "dental",
    schemes: ["receivables-diversion", "skimming"],
    howItWorked:
      "The financial coordinator of a Houston dental practice formed a company named SGS Healthcare and directed practice revenue to it. Insurance checks written payable to the practice were deposited into accounts she controlled. The dentist had been in business 38 years. In July 2021 he began a detailed review of his own company accounts to prepare for retirement, and that review is what surfaced the scheme. She also manipulated the books to conceal cash payments patients had made directly to the practice.",
    controlGap:
      "Nobody outside the role could see which entities the practice paid or received through, and no one independently confirmed that insurer payments landed in the practice's own account. The owner had not examined the accounts closely in years.",
    lossUsd: 243597,
    lossIsFloor: false,
    detection: "owner-review",
    resolvedYear: 2023,
    sodRuleIds: ["rule-collect-post", "rule-cash-rec"],
    wouldHaveCaughtIt: [
      {
        control: "new-payee-review",
        asApplied:
          "Owner reviews the list of new payees and vendors monthly — a five-minute report in any accounting package",
      },
      {
        control: "bank-alerts-on-payee-change",
        asApplied: "Bank alerts on new payees and on any account change",
      },
      {
        control: "confirm-remittance-account",
        asApplied: "Annual confirmation with major insurers of the remittance account on file",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Southern District of Texas",
      url: "https://www.justice.gov/usao-sdtx/pr/local-woman-sentenced-embezzling-funds-dental-office",
      grade: "primary-document-reported",
    },
    caveat:
      "The $243,597 figure is the loss the practice's own outside auditor identified; the charged conduct is described as more than $200,000. Sentence was 41 months. This is the clearest case in the library for how these schemes usually end: not through a control, but because an owner finally looked. An owner who only looks at retirement is choosing a detection window measured in decades. Jennifer Thornton pled guilty to wire fraud on 20 July 2023.",
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
    lossIsFloor: true,
    durationMonths: 132,
    detection: "bank-or-insurer",
    resolvedYear: 2017,
    sodRuleIds: [],
    wouldHaveCaughtIt: [
      {
        control: "billing-matches-the-schedule",
        asApplied: "Monthly production-by-provider report compared against the actual schedule",
      },
      {
        control: "billing-matches-the-schedule",
        asApplied: "Provider credentialing list reviewed by the owner against claims submitted",
      },
      {
        control: "billing-matches-the-schedule",
        asApplied:
          "Any claim naming a provider not on the day's schedule flagged before submission",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Connecticut",
      url: "https://www.justice.gov/usao-ct/pr/stamford-dental-office-manager-sentenced-prison-defrauding-insurance-companies",
      grade: "primary-document-reported",
    },
    caveat:
      "This case runs the other direction from embezzlement: the money flowed into the practice, and the practice carried the repayment and reputational exposure. Billing ran from 2005 to 2016; the $581,729 reflects insurer payments between 2011 and 2015. The 132 months recorded is the full 2005 to 2016 billing period, which is how long the scheme ran; the $581,729 is what insurers paid during the 2011 to 2015 window within it, so it is recorded as a floor for the full period. The provider whose identity was used was a retired dentist. Sentenced 2017 to twelve months and one day.",
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
    lossIsFloor: false,
    durationMonths: 63,
    detection: "owner-review",
    resolvedYear: 2022,
    sodRuleIds: ["rule-vendor-create-pay", "rule-vendor-create-approve", "rule-vendor-approve-pay"],
    wouldHaveCaughtIt: [
      {
        control: "new-payee-second-approval",
        asApplied:
          "A second person approves every new vendor before its first payment, checking a W-9 and a real business address",
      },
      { control: "new-payee-review", asApplied: "New-vendor report reviewed monthly by the owner" },
      {
        control: "background-check-money-handlers",
        asApplied:
          "Reference and background checks on anyone who will touch money — she was fired for this and hired straight into the same role elsewhere",
      },
      {
        control: "payee-account-not-an-employee",
        asApplied: "No vendor paid to a bank account that matches an employee's",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Minnesota",
      url: "https://www.justice.gov/usao-mn/pr/kenyon-bookkeeper-sentenced-more-9-years-prison-881000-employer-embezzlement-and-tax",
      grade: "primary-document-reported",
    },
    caveat:
      "The $356,000 recorded here is the sum of the two components the charging office states for this employer — about $336,000 in bogus vendor payments plus about $20,000 in payroll issued under other people's names. Both components are approximate, so the sum is an estimate, not a floor. The prosecution's overall figure of $881,000 is larger because it covers a second victim: after MI5 detected the fraud in July 2019 and fired her, she lied about her work history, was hired as bookkeeper at a family-owned construction company in Rochester, was promoted to general manager, and embezzled there too. Sentenced to nine years and three months, with more than $1 million in restitution. Scheme at MI5 ran April 2014 to July 2019.",
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
    resolvedYear: 2024,
    sodRuleIds: [
      "rule-cash-rec",
      "rule-custody-rec",
      "rule-deposit-post",
      "rule-release-rec",
      "rule-sign-rec",
      "rule-payroll",
    ],
    wouldHaveCaughtIt: [
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner receives the bank statement directly and reviews cleared-check images and the credit-card statement before the controller sees them",
      },
      {
        control: "split-one-duty-out",
        asApplied:
          "Any single duty moved out of the role — even just the bank reconciliation — breaks the cycle",
      },
      {
        control: "dual-release-above-threshold",
        asApplied: "Dual signature or dual electronic release on payments above a set threshold",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Minnesota",
      url: "https://www.justice.gov/usao-mn/pr/hutchinson-woman-sentenced-prison-embezzling-more-2-million-employer",
      grade: "primary-document-reported",
    },
    caveat:
      "Scheme ran August 2013 through December 2019. The employer was R&R Excavating, a family-owned highway construction company. Jennifer Rath pled guilty in September 2023 and was sentenced in June 2024 to nearly three and a half years, with restitution of the full $2,061,328.67. The loss was not only the money: the company could not pay vendors on time, its credit suffered, and employees lost their jobs.",
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
    tenureYearsStated: 27,
    detection: "owner-review",
    resolvedYear: 2022,
    sodRuleIds: ["rule-payroll", "rule-payroll-master-run"],
    wouldHaveCaughtIt: [
      {
        control: "payroll-register-review",
        asApplied:
          "Owner approves the payroll register every cycle — a one-page list of names and amounts",
      },
      {
        control: "no-self-approval",
        asApplied:
          "Anyone's own pay rate change requires a second person's approval, without exception for the person who runs payroll",
      },
      {
        control: "card-statement-line-review",
        asApplied: "Company credit card statements opened and reviewed by the owner",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Middle District of Florida",
      url: "https://www.justice.gov/usao-mdfl/pr/long-time-employee-local-construction-firm-sentenced-prison-embezzlement",
      grade: "primary-document-reported",
    },
    caveat:
      "The source describes the credit-card payments as dating back to at least 2008 without giving an end date, so no duration is recorded. The escalation pattern — starting small, growing when nothing happens — is the part worth noticing. Pamela Smith, 60, of Winter Park, was sentenced in December 2022 to three years.",
  },
  {
    id: "case-attleboro-expense-padding",
    title: "Office manager added $268,046 in expense reimbursements to her own paychecks",
    sector: "professional-services",
    schemes: ["expense-reimbursement", "payroll"],
    howItWorked:
      "Over roughly five years, the office manager of an environmental services business in Franklin, Massachusetts inflated her own compensation, including approximately $268,046 in expense reimbursements for expenses she had not incurred. The total embezzled exceeded $400,000. She also put more than $105,000 of personal spending on the company card — country club memberships, vacations, cruises, timeshares, costs of her home — and manipulated the accounting software so the records showed her drawing only her weekly salary. Among the phony reimbursements were uniform costs, for a role that had no uniform.",
    controlGap:
      "Expense reimbursements ran through payroll, where they are easy to miss: a reimbursement is not taxed and does not show up as a raise. The person entering them was the person receiving them.",
    lossUsd: 400000,
    lossIsFloor: true,
    durationMonths: 63,
    detection: "unknown",
    resolvedYear: 2026,
    sodRuleIds: [],
    wouldHaveCaughtIt: [
      {
        control: "receipt-and-second-approval",
        asApplied:
          "Every reimbursement over a small threshold requires a receipt and a second person's approval",
      },
      {
        control: "card-statement-line-review",
        asApplied:
          "Owner reads the company card statement every month — the country club and the cruises were on it",
      },
      {
        control: "payroll-register-review",
        asApplied:
          "Owner reviews gross-to-net payroll totals, not just the net amount leaving the bank",
      },
      {
        control: "receipt-and-second-approval",
        asApplied:
          "Reimbursements paid separately from payroll, so they are visible as their own line",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Massachusetts",
      url: "https://www.justice.gov/usao-ma/pr/attleboro-woman-sentenced-18-months-prison-embezzling-more-400000",
      grade: "primary-document-reported",
    },
    caveat:
      "Marie Hobson, 55, was sentenced in January 2026 to 18 months, with $511,119 in restitution and $429,980 forfeited. Scheme ran December 2019 through March 2025.",
  },
  {
    id: "case-restaurant-franchisee-idaho",
    title: "Restaurant district manager paid ghost employees $685,376 over three years",
    sector: "restaurant",
    schemes: ["payroll"],
    howItWorked:
      "As district manager for a franchisee of national restaurant chains, Javier Ruiz supervised several Idaho restaurants and oversaw their payroll. From at least April 2021 to April 2024 he took the employee numbers of people who had already left, changed the names and details attached to them, and entered hours that were never worked, so the payroll system issued real pay to employees who no longer existed. He collected it three ways: cashing the checks, loading fraudulent pay cards, and direct deposit.",
    controlGap:
      "One person could reactivate a departed employee's record, enter their hours, and approve the run, with nobody comparing the payroll roster against who actually still worked there. Multi-site operations make this easy to hide: a district manager's headcount is spread across locations no single owner watches closely.",
    lossUsd: 685376,
    lossIsFloor: false,
    durationMonths: 36,
    detection: "unknown",
    resolvedYear: 2025,
    sodRuleIds: ["rule-payroll", "rule-payroll-master-run"],
    wouldHaveCaughtIt: [
      {
        control: "terminated-staff-vs-payroll",
        asApplied:
          "A monthly comparison of the terminated-employee list against everyone paid that month — the ghost names were all former staff",
      },
      {
        control: "payroll-register-review",
        asApplied:
          "Owner compares the number of people paid against the number of people scheduled across all locations each cycle",
      },
      {
        control: "no-self-approval",
        asApplied:
          "Reactivating any employee record requires a second person's approval, not the same manager who runs the payroll",
      },
      {
        control: "compare-across-locations",
        asApplied:
          "Compare labor hours and payroll cost against sales for each location every month; a location whose payroll carries hours nobody scheduled stands out against its sister sites",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Idaho",
      url: "https://www.justice.gov/usao-id/pr/mountain-home-man-sentenced-27-months-embezzlement",
      grade: "primary-document-reported",
    },
    caveat: "Sentenced in December 2025 to 27 months, with $685,376 in restitution.",
  },
  {
    id: "case-nonprofit-human-first",
    title:
      "Nonprofit executive director and co-conspirators took $1.4 million of agency money over five years",
    sector: "nonprofit",
    schemes: ["expense-reimbursement", "corruption"],
    howItWorked:
      "The executive director of Human First, Inc., a Long Island nonprofit, used agency funds over more than five years in the role for personal spending including international travel, spas, salons, restaurants, and elective cosmetic surgery.",
    controlGap:
      "A board that meets quarterly and reads a summary is not a control over the executive director's own spending. Without someone reviewing the ED's card statement line by line, the position reviews itself.",
    lossUsd: 1415000,
    lossIsFloor: false,
    durationMonths: 64,
    detection: "unknown",
    resolvedYear: 2023,
    sodRuleIds: ["rule-release-rec"],
    wouldHaveCaughtIt: [
      {
        control: "card-statement-line-review",
        asApplied:
          "A named board member reviews the executive director's card statement and expense claims monthly, line by line",
      },
      {
        control: "no-self-approval",
        asApplied: "The executive director does not approve their own expenses under any threshold",
      },
      {
        control: "independent-financial-review",
        asApplied: "Annual independent financial review, even where an audit is not required",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Eastern District of New York",
      url: "https://www.justice.gov/usao-edny/pr/former-executive-director-long-island-charity-sentenced-over-two-years-prison",
      grade: "primary-document-reported",
    },
    caveat:
      "Wafa Abboud was sentenced in January 2023 to 33 months, with $836,000 forfeited and $1,415,000 ordered in restitution to Human First. The restitution figure exceeds the forfeiture and is the better measure of total harm to the organization, so it is the loss recorded here; the release's headline says over $1 million. Human First served autistic children and developmentally disabled young adults. Wafa Abboud was executive director from January 2011 to May 2016 and acted alongside several co-conspirators — which matters, because segregation of duties assumes people do not collude, and here they did.",
  },
  {
    id: "case-modest-needs-fake-board",
    title:
      "Charity founder took $2.5 million and invented a board — a bartender, a friend, his housekeeper — to approve it",
    sector: "nonprofit",
    schemes: ["corruption", "financial-statement"],
    howItWorked:
      "Keith Taylor, founder and chief executive of the Modest Needs Foundation, used the charity's accounts as his own from at least 2015: more than $300,000 on rent for a high-rise Manhattan apartment, more than $320,000 at restaurants, more than $100,000 on food-delivery apps. To make the spending look authorized he listed a fictitious board of directors — a bartender, a friend, and his housekeeper — none of whom knew they had been named and none of whom ever attended a meeting.",
    controlGap:
      "The oversight body existed only on paper. This is the failure that matters most for a very small organization: a control that is documented but never performed is worse than none, because it stops anyone asking the question. Donors and staff saw a board; there was no board.",
    lossUsd: 2500000,
    lossIsFloor: true,
    detection: "unknown",
    resolvedYear: 2025,
    sodRuleIds: [],
    wouldHaveCaughtIt: [
      {
        control: "verify-oversight-is-real",
        asApplied:
          "Confirm that each named director knows they hold the role and has actually met — a single phone call to any of the three would have ended this",
      },
      {
        control: "verify-oversight-is-real",
        asApplied: "Minutes signed by a second person who was in the room",
      },
      {
        control: "independent-financial-review",
        asApplied:
          "An outside accountant reviewing the accounts annually, reporting to someone other than the executive",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Southern District of New York",
      url: "https://www.justice.gov/usao-sdny/pr/founder-and-former-ceo-charity-pleads-guilty-multimillion-dollar-charity-fraud-and-tax",
      grade: "primary-document-reported",
    },
    caveat:
      "Pled guilty in 2025 to wire fraud and to evading more than $1 million in federal income tax; sentencing was scheduled for 10 December 2025. The $2.5 million is stated as a floor.",
  },
  {
    id: "case-dc-architecture-firm",
    title:
      "Architecture firm bookkeeper put $167,000 of gift cards on the company card over eight years",
    sector: "professional-services",
    schemes: ["expense-reimbursement"],
    howItWorked:
      "Jill Murray was the office manager and bookkeeper of a Washington, D.C. architecture firm, authorized to buy supplies, keep the books, and pay the firm's credit card bills. Between December 2005 and March 2014 she made about $112,630 in personal purchases on the company's account — Amazon, Best Buy, Staples, Target, Whole Foods, Office Depot, Crate & Barrel — and bought $83,511 of Staples gift cards and $83,469 of Office Depot gift cards in her own name, then manipulated the firm's books to hide it.",
    controlGap:
      "The person making the purchases also paid the card bill and kept the books, so nobody outside the role ever read the statement. Gift cards are the detail that matters: they turn a company card into untraceable value, and $167,000 of them left the firm as ordinary-looking supplier lines.",
    lossUsd: 279611,
    lossIsFloor: false,
    durationMonths: 100,
    detection: "unknown",
    resolvedYear: 2017,
    sodRuleIds: ["rule-release-rec"],
    wouldHaveCaughtIt: [
      {
        control: "card-statement-line-review",
        asApplied:
          "A partner reads the company card statement line by line every month — eight years of Staples and Office Depot lines would have stood out in one",
      },
      {
        control: "gift-card-purchases-controlled",
        asApplied:
          "Gift cards bought on a company card require a second person's approval and a stated business purpose, because they are cash that leaves no trail",
      },
      {
        control: "split-one-duty-out",
        asApplied: "The person who pays the card bill is not the person who keeps the books",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Columbia",
      url: "https://www.justice.gov/usao-dc/pr/former-office-manager-sentenced-prison-term-theft-nearly-280000-dc-architecture-firm",
      grade: "primary-document-reported",
    },
    caveat:
      'Restitution and forfeiture were each ordered at $279,611, which is the figure recorded here; the charging office\'s headline of "nearly $280,000" is that number rounded up, so it is not a floor. Pled guilty November 2016 and was sentenced in February 2017 to six months in prison.',
  },
  {
    id: "case-bellingham-assistant-manager",
    title: "Assistant office manager took $1.4 million from a hardware retailer over nine years",
    sector: "retail",
    schemes: ["check-tampering", "expense-reimbursement"],
    howItWorked:
      "The assistant office manager of a regional hardware retail and leasing business ran a scheme from 2013 to 2022 using fraudulent company checks and unauthorized company credit card purchases, including more than 1,800 unauthorized transactions charged through her personal Amazon account. The total came to more than $1.4 million. She also forged signatures, or had people with signing authority sign blank checks, and altered the company's books to hide the theft.",
    controlGap:
      "Card spending was never reviewed line by line, and an ordinary-looking retail supplier name on a statement is indistinguishable from a personal order. The title is the other half of the problem: oversight tends to be designed around the office manager, while the deputy inherits the same system access with none of the attention.",
    lossUsd: 1400000,
    lossIsFloor: true,
    durationMonths: 108,
    detection: "unknown",
    resolvedYear: 2025,
    sodRuleIds: [],
    wouldHaveCaughtIt: [
      {
        control: "card-statement-line-review",
        asApplied: "Owner opens the company card statement and reads it line by line, every month",
      },
      {
        control: "permission-review",
        asApplied: "Review who holds which system permissions, not who holds which job title",
      },
      {
        control: "card-statement-line-review",
        asApplied:
          "Any card charge to a consumer marketplace matched to a business purpose before it is coded",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Western District of Washington",
      url: "https://www.justice.gov/usao-wdwa/pr/former-assistant-office-manager-bellingham-business-sentenced-two-years-prison-14",
      grade: "primary-document-reported",
    },
    caveat:
      "Sentenced November 2025 to two years for wire fraud and filing a false tax return. Nine years is worth sitting with: nothing in the ordinary course of business surfaced it for nearly a decade. The employer was Hardware Sales in Bellingham. Amy Siniscarco was sentenced 6 November 2025. On 12 August 2022 a bank representative told the owners that an electronic check had moved from the business account to her personal account; the owners' review of past transactions then found nine more, and they reported the theft to Bellingham police that month (Cascadia Daily News, from the charging papers). That account comes from the newspaper, not from the cited release, which does not say how the theft was found, so the detection route is recorded as unknown. The release puts the scheme at 2013 to 2022.",
  },
  {
    id: "case-kearny-medical-receptionist",
    title: "Medical office receptionist cashed $446,000 of insurer checks over four years",
    sector: "medical",
    schemes: ["receivables-diversion", "skimming"],
    howItWorked:
      "A receptionist at a medical practice in Kearny, New Jersey took, cashed, and concealed more than $446,000 in checks that insurance companies had paid to the practice for patient services, between 2007 and 2011. She separately obtained more than $200,000 in goods and services on fraudulent credit cards. She also fraudulently obtained ten credit cards in the name of one of the practice's principals and charged more than $218,000 to them.",
    controlGap:
      "The front-desk role received the mail. Where incoming payments and the record of incoming payments meet at the same desk, there is nothing to compare against anything. Seniority is not the variable here — a receptionist held enough access to run this for four years.",
    lossUsd: 446000,
    lossIsFloor: true,
    durationMonths: 48,
    detection: "unknown",
    resolvedYear: 2015,
    sodRuleIds: ["rule-collect-post"],
    wouldHaveCaughtIt: [
      {
        control: "log-payments-at-the-mail",
        asApplied:
          "Incoming payments logged by whoever opens the mail, before they reach the person who posts them",
      },
      {
        control: "electronic-remittance",
        asApplied:
          "Electronic remittance from insurers so no payable check passes through the office at all",
      },
      {
        control: "expected-receipts-vs-deposits",
        asApplied: "Owner compares expected insurer payments against deposits monthly",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of New Jersey",
      url: "https://www.justice.gov/usao-nj/pr/medical-office-receptionist-sentenced-34-months-prison-embezzlement-credit-card-fraud-and",
      grade: "primary-document-reported",
    },
    caveat:
      "Gwendolyn Muller was sentenced in March 2015 to 34 months and ordered to pay $556,000 in restitution.",
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
    sodRuleIds: ["rule-collect-post", "rule-collect-adjust", "rule-deposit-post", "rule-cash-void"],
    wouldHaveCaughtIt: [
      {
        control: "adjustments-report-by-employee",
        asApplied:
          "Weekly report of voids, no-sales, and discounts grouped by employee — the outlier is visible at a glance",
      },
      {
        control: "dual-release-above-threshold",
        asApplied:
          "Voids above a small amount require a second person's code at the time, not an explanation later",
      },
      {
        control: "volume-vs-recorded-sales",
        asApplied: "Inventory or production volume compared against recorded sales",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Western District of Missouri",
      url: "https://www.justice.gov/usao-wdmo/pr/former-postal-worker-pleads-guilty-stealing",
      grade: "primary-document-reported",
    },
    caveat:
      "The employer here was the U.S. Postal Service, not a small business, and no reliable loss total is recorded. It is included because the mechanism — void and no-sale entries used to suppress recorded cash — is exactly what a small retail counter, restaurant till, or practice front desk faces, and because no comparable small-business case surfaced with the mechanism described this plainly. Conduct ran June 2013 to February 2014.",
  },
  {
    id: "case-milwaukee-office-manager-bounced-paycheck",
    title:
      "Office manager and bookkeeper spent $650,000 of a Milwaukee company's money; it surfaced when a paycheck bounced",
    sector: "any",
    schemes: ["expense-reimbursement"],
    howItWorked:
      "The office manager and in-house bookkeeper of a small Milwaukee business used company funds for more than $650,000 of unauthorized purchases between September 2018 and February 2020, among them antique jewelry, lifelike dolls, and trinkets she intended to resell. She entered false records in the company's books so the spending did not show. The scheme came to light only when an employee's paycheck bounced.",
    controlGap:
      "One person both spent the company's money and kept the record of it, and nobody outside that role looked at the bank account. The books balanced because she wrote them; the bank balance did not, and the first person to notice was an employee whose pay did not clear.",
    lossUsd: 650000,
    lossIsFloor: true,
    durationMonths: 17,
    detection: "by-accident",
    resolvedYear: 2024,
    sodRuleIds: ["rule-cash-rec"],
    wouldHaveCaughtIt: [
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner reads the bank statement each month before the bookkeeper does — seventeen months of resale-inventory purchases would have been on it",
      },
      {
        control: "split-one-duty-out",
        asApplied:
          "Someone other than the person who pays the bills reconciles the bank account, even in a business too small for a finance team",
      },
      {
        control: "independent-financial-review",
        asApplied:
          "An outside accountant reviews the books against bank records, reporting to the owner",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Eastern District of Wisconsin",
      url: "https://www.justice.gov/usao-edwi/pr/former-bookkeeper-sentenced-federal-prison-embezzlement-and-fraud",
      grade: "primary-document-reported",
    },
    caveat:
      "Emilee K. Rueda, 42, was sentenced on 9 February 2024 to 33 months for wire fraud and tax offenses. The release describes the victim only as a small business. IRS Criminal Investigation published a matching release. The purchases were made with company funds; the release does not say by what instrument.",
  },
  {
    id: "case-msp-airport-restaurant-cash",
    title:
      "Airport restaurant manager pocketed $144,819 in daily cash and covered it with the next day's receipts",
    sector: "restaurant",
    schemes: ["cash-larceny"],
    howItWorked:
      "The manager of a Chick-fil-A franchise at Minneapolis–St. Paul airport, owned by The Grove, Inc., was responsible for collecting the daily cash receipts from that restaurant and a sister pizzeria and depositing them in a safe-deposit box. From September 2022 to October 2023 he kept some or all of the cash. He hid the gap by depositing later days' receipts against earlier days, so the record showed deposits running late rather than missing, and he emailed the company's accounting staff regularly to say he was catching up on late deposits.",
    controlGap:
      "One person carried the cash from the register to the bank and nobody matched each day's point-of-sale cash total to a deposit of the same date. Lapping — using tomorrow's cash to cover today's — only works when deposits are checked by amount and not by date.",
    lossUsd: 144819,
    lossIsFloor: false,
    durationMonths: 13,
    detection: "unknown",
    resolvedYear: 2024,
    sodRuleIds: [],
    wouldHaveCaughtIt: [
      {
        control: "expected-receipts-vs-deposits",
        asApplied:
          "Each day's register cash total matched to a bank deposit of the same date, by someone other than the person who carries the cash",
      },
      {
        control: "split-one-duty-out",
        asApplied: "The person who counts the drawer is not the person who makes the deposit",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner reviews deposit dates against business days each month — a lag that grows is the tell",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Minnesota",
      url: "https://www.justice.gov/usao-mn/pr/fast-food-manager-charged-wire-fraud-embezzling-more-140000-employer",
      grade: "primary-document-reported",
    },
    caveat:
      "The linked release is the charging document (February 2024). Timothy Michael Hill Jr. pleaded guilty in June 2024 (release: justice.gov/usao-mn/pr/fast-food-manager-pleads-guilty-wire-fraud-after-embezzling-more-140000-employer, which names the employer only as Company A and puts the loss at about $144,000) and, per press reports of the sentencing hearing, was sentenced in October 2024 to one year in prison with restitution of about $145,000. The loss figure is the amount charged.",
  },
  {
    id: "case-san-antonio-dermatology-side-account",
    title:
      "Dermatology office manager diverted patient payments into a leftover event bank account for eight years",
    sector: "medical",
    schemes: ["receivables-diversion", "check-tampering"],
    howItWorked:
      "In 2012 the owner of the Dermatology & Laser Center of San Antonio opened a bank account to collect contributions for a one-off medical symposium, to be closed when the event ended. The office manager kept it open without permission. From July 2012 to February 2020 she deposited checks and cash that patients paid the practice into that account, using an altered signature stamp or forging the owner's endorsement, and also redirected the practice's profit-sharing tax checks into it. She spent the money on travel, property payments, meals, and cards she opened in the owner's name.",
    controlGap:
      "The practice had a bank account the owner had forgotten about, and the person who received patient payments also controlled where they were deposited and kept the books. A dormant account in the business's name is a ready-made place to park diverted receipts.",
    lossUsd: 345254,
    lossIsFloor: false,
    durationMonths: 92,
    detection: "unknown",
    resolvedYear: 2021,
    sodRuleIds: ["rule-collect-post", "rule-deposit-post"],
    wouldHaveCaughtIt: [
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner keeps a list of every account in the practice's name, closes the ones that should be closed, and reads the statements of the rest",
      },
      {
        control: "log-payments-at-the-mail",
        asApplied:
          "Patient checks logged when they arrive by someone who does not post them, and the log matched to deposits",
      },
      {
        control: "expected-receipts-vs-deposits",
        asApplied: "Day-sheet collections matched to deposits in the operating account by date",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Western District of Texas",
      url: "https://www.justice.gov/usao-wdtx/pr/former-office-manager-sentenced-fraud-charges",
      grade: "primary-document-reported",
    },
    caveat:
      "Patricia Ann Doucet, 74, pleaded guilty in August 2021 to ten counts of wire fraud and was sentenced in November 2021 to 46 months with restitution of $345,254.44, which is the figure recorded here; the release rounds it to nearly $350,000.",
  },
  {
    id: "case-wnc-contract-bookkeeper-phony-vendors",
    title:
      "Contract bookkeeper wired $975,670 from three small businesses to herself behind phony vendors",
    sector: "any",
    schemes: ["billing-shell-vendor"],
    howItWorked:
      "A contracted bookkeeper handled accounts payable, payroll, and tax returns for three small businesses in western North Carolina. From 2019 through 2024 she made unauthorized wire transfers from their bank accounts to her own, and covered them by creating phony vendors and false entries in each company's ledger. Much of the money went to casinos.",
    controlGap:
      "An outside bookkeeper held the same combination of duties an inside one would: she could add a payee, send the payment, and write the entry that explained it. None of the three owners looked at outgoing wires independently of the ledger she kept.",
    lossUsd: 975670,
    lossIsFloor: false,
    durationMonths: 60,
    detection: "unknown",
    resolvedYear: 2026,
    sodRuleIds: ["rule-vendor-create-pay", "rule-invoice-pay", "rule-ach-release"],
    wouldHaveCaughtIt: [
      {
        control: "new-payee-review",
        asApplied:
          "Each owner reviews every new payee added to their bank's wire and bill-pay lists, monthly",
      },
      {
        control: "bank-alerts-on-payee-change",
        asApplied: "Bank alert to the owner's phone on any wire to a payee not previously paid",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner reads the bank statement's wire section directly from the bank, not from the bookkeeper's report",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Western District of North Carolina",
      url: "https://www.justice.gov/usao-wdnc/pr/bookkeeper-sentenced-federal-prison-embezzlment-scheme",
      grade: "primary-document-reported",
    },
    caveat:
      "Jeraldine Agnes Geldner was sentenced in January 2026 to 57 months. The loss is stated as $975,670.94; restitution of $1,131,293.94 also covers tax. IRS Criminal Investigation published a matching release. Three businesses were victims; the record treats them together because the release does.",
  },
  {
    id: "case-franklin-remodeler-bounced-check",
    title:
      "Remodeling company bookkeeper diverted $315,000 and fed the accountant doctored bank statements; a bounced check ended it",
    sector: "construction",
    schemes: ["check-tampering"],
    howItWorked:
      "Within months of being hired as bookkeeper at Dukate Fine Remodeling in Franklin, Indiana, she began using her online access to the company's accounts to pay more than a dozen personal credit cards and buy electronics and other goods. Each year she gave the company's outside accountant false books together with bank statements she had altered so the two agreed. She also left hundreds of thousands of dollars of company bills unpaid. Police and the FBI were called after a company check bounced. The owners laid off workers and cashed in retirement savings to keep the business open.",
    controlGap:
      "The outside accountant received the bank statements from the bookkeeper instead of from the bank, so the one document that could not be faked was the one nobody independent saw. She also came with a ten-year record of fraud, forgery, and theft convictions that no one checked.",
    lossUsd: 315000,
    lossIsFloor: true,
    durationMonths: 24,
    tenureYearsStated: 0,
    detection: "by-accident",
    resolvedYear: 2018,
    sodRuleIds: ["rule-cash-rec", "rule-ach-release"],
    wouldHaveCaughtIt: [
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner and accountant each receive statements directly from the bank; nothing the bookkeeper hands over counts as the statement",
      },
      {
        control: "background-check-money-handlers",
        asApplied:
          "A criminal-records check before giving anyone online access to the bank accounts",
      },
      {
        control: "independent-financial-review",
        asApplied:
          "Accountant reconciles to bank-sourced records and reports unpaid vendor balances to the owner",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Southern District of Indiana",
      url: "https://www.justice.gov/usao-sdin/pr/bookkeeper-sentenced-defrauding-small-franklin-indiana-business",
      grade: "primary-document-reported",
    },
    caveat:
      "Erica Howard, 42, was sentenced in August 2018 to 58 months and ordered to repay more than $315,000. The release calls it a two-year scheme; the duration is recorded as 24 months on that basis. Her prior convictions are stated in the release.",
  },
  {
    id: "case-ocean-city-builder-forged-checks",
    title:
      "Home builder's office manager forged the owner's signature on more than 500 checks over eight years",
    sector: "construction",
    schemes: ["check-tampering"],
    howItWorked:
      "The office manager and bookkeeper of an Ocean City, Maryland home builder forged a business owner's signature on company checks at least 500 times between 2016 and 2024, taking about $1.79 million, and made false entries in the books so the checks did not show as what they were.",
    controlGap:
      "Check-writing custody, signature access, and the books sat with one person for eight years, and no one compared cleared-check images against what the ledger said the checks were for. Five hundred forged checks cleared a bank that had no reason to question them.",
    lossUsd: 1793688,
    lossIsFloor: false,
    durationMonths: 96,
    detection: "unknown",
    resolvedYear: 2026,
    sodRuleIds: ["rule-cash-rec"],
    wouldHaveCaughtIt: [
      {
        control: "positive-pay",
        asApplied: "Bank Positive Pay: the bank pays only checks on a list the owner uploads",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner reviews cleared-check images each month — a payee that is not a supplier stands out in one sitting",
      },
      {
        control: "independent-bank-reconciliation",
        asApplied:
          "Bank reconciliation done by someone who did not write the checks or the entries",
      },
    ],
    source: {
      publisher:
        "IRS Criminal Investigation, reporting the U.S. Attorney's Office, District of Maryland",
      url: "https://www.irs.gov/compliance/criminal-investigation/former-office-manager-sentenced-for-embezzling-more-than-1-point-7-million-from-ocean-city-home-builder",
      grade: "primary-document-reported",
    },
    caveat:
      "Tammy Barcus of Berlin, Maryland pleaded guilty in October 2025 and was sentenced in March 2026 to 48 months, with restitution of $1,793,688.87 to the builder and $562,883 to the IRS. The loss recorded is the restitution to the employer. The U.S. Attorney's Office published the plea release; the sentencing release cited here is IRS-CI's.",
  },
  {
    id: "case-mukilteo-flooring-owner-bookkeeper-collusion",
    title:
      "Flooring company co-owner and bookkeeper together took $400,000 from the partner who put up the money",
    sector: "trades",
    schemes: ["expense-reimbursement", "financial-statement"],
    howItWorked:
      "Between 2011 and 2016 the co-owner who ran Gluth Contract Flooring in Mukilteo, Washington and its bookkeeper drew on company accounts for a home mortgage, luxury vacations, and department-store bills, and took out loans in the company's name without the knowledge of the silent partner who had financed the business. The bookkeeper was convicted at trial of wire fraud, aggravated identity theft, and conspiracy.",
    controlGap:
      "Every control the business had ran through the operating owner, and the operating owner was in on it. The investor had no view of the bank accounts, the loans, or the books except what the two of them chose to show him.",
    lossUsd: 400000,
    lossIsFloor: true,
    durationMonths: 60,
    detection: "owner-review",
    resolvedYear: 2024,
    sodRuleIds: ["rule-cash-rec"],
    wouldHaveCaughtIt: [
      {
        control: "independent-financial-review",
        asApplied:
          "An accountant engaged by and reporting to the investing partner, with direct bank and lender access, reviewing annually",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Statements and loan notices delivered to every owner directly from the bank, not through the office",
      },
      {
        control: "verify-oversight-is-real",
        asApplied:
          "The partner confirms each year that the oversight he believes exists actually leaves evidence",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Western District of Washington",
      url: "https://www.justice.gov/usao-wdwa/pr/former-flooring-company-bookkeeper-sentenced-three-years-prison-scheme-steal-company",
      grade: "primary-document-reported",
    },
    caveat:
      "Jodi Hamrick was sentenced in April 2024 to three years after a jury trial; co-owner David M. Gluth was sentenced separately. The release states the loss as more than $400,000. This is a collusion case: two people, one of them an owner, defeated every control that depended on one person checking another. The investing partner learned what had happened only by taking the company to court; the business went bankrupt in 2016. Gluth pleaded guilty in 2021 and was sentenced to two years.",
  },
  {
    id: "case-greenfield-contractor-payroll-and-payments",
    title:
      "Contracting company office manager raised her own pay 466 times, added her husband to payroll, and redirected customer payments",
    sector: "construction",
    schemes: ["payroll", "receivables-diversion", "expense-reimbursement"],
    howItWorked:
      "The office manager of a family-owned contracting company in Greenfield, Indiana ran payroll, customer invoicing, and the company credit cards. From January 2016 through December 2022 she inflated her own salary on 466 occasions, for about $515,000; in December 2020 she added her husband to payroll though he had not been hired, for another $107,000; she redirected customer payments to her own account; and she put personal spending on company cards. The total exceeded $1 million.",
    controlGap:
      "One person entered payroll, approved it, issued the invoices, received the payments, and held the cards, and nobody reviewed the payroll register, the headcount, or the card statements. Four separate schemes ran through the same unwatched seat for seven years.",
    lossUsd: 1000000,
    lossIsFloor: true,
    durationMonths: 84,
    detection: "owner-review",
    resolvedYear: 2025,
    sodRuleIds: ["rule-payroll", "rule-payroll-master-run"],
    wouldHaveCaughtIt: [
      {
        control: "payroll-register-review",
        asApplied:
          "Owner reads the payroll register each cycle — names, gross pay, and headcount — against who actually works there",
      },
      {
        control: "no-self-approval",
        asApplied:
          "Nobody who runs payroll can change their own pay without a second person's approval",
      },
      {
        control: "card-statement-line-review",
        asApplied: "Owner reads every company card statement line by line",
      },
      {
        control: "log-payments-at-the-mail",
        asApplied:
          "Customer payments logged on arrival by someone other than the person who invoices",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Southern District of Indiana",
      url: "https://www.justice.gov/usao-sdin/pr/former-office-manager-sentenced-two-and-half-years-federal-prison-embezzling-over-1",
      grade: "primary-document-reported",
    },
    caveat:
      "Jennifer Lynn Horton, 49, was sentenced in January 2025 to 30 months after pleading guilty to two counts of wire fraud, with a $1 million judgment and forfeiture of four vehicles. The release states the loss as more than $1 million; the salary and payroll figures are the release's. The owner went to investigators in February 2023 after working out that money was missing; court filings reported in the press put the total at $1,116,258.",
  },
  {
    id: "case-fairfax-hardware-store-bookkeeper-credit-cards",
    title:
      "Hardware store bookkeeper of 18 years paid her personal credit cards from the store's bank account for five years, $540,000",
    sector: "retail",
    schemes: ["check-tampering", "expense-reimbursement"],
    howItWorked:
      "The bookkeeper at Farm Mercantile, Inc., a hardware store in Fairfax, Minnesota, worked there from 1998 to 2016 and was an authorized signer on the store's bank accounts with authority to sign and issue checks. From about 2011 through 2016 she transferred money directly from those accounts to her personal credit cards and entered the transfers in the general ledger as legitimate business expenses. She took approximately $540,063, which she spent on online gambling.",
    controlGap:
      "One person held bank signing authority, paid the bills, and kept the ledger, so a payment to a card issuer could be coded as a supplier expense and nobody outside the role compared the bank statement with the books. Eighteen years of tenure stood in for the review nobody did.",
    lossUsd: 540063,
    lossIsFloor: false,
    durationMonths: 60,
    tenureYearsStated: 18,
    detection: "unknown",
    resolvedYear: 2018,
    sodRuleIds: ["rule-cash-rec", "rule-ach-release"],
    wouldHaveCaughtIt: [
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner reads the bank statement first each month; a recurring payment to a card issuer that is not the store's card stands out on the page",
      },
      {
        control: "independent-bank-reconciliation",
        asApplied:
          "Someone other than the bookkeeper matches the bank statement against the ledger, so a card payment coded as a supplier expense does not reconcile",
      },
      {
        control: "independent-financial-review",
        asApplied:
          "An outside accountant reviews the books annually and asks what each recurring payee is",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Minnesota",
      url: "https://www.justice.gov/usao-mn/pr/fairfax-bookkeeper-sentenced-prison-540000-embezzlement-scheme",
      grade: "primary-document-reported",
    },
    caveat:
      "Theresa Ernestine Linsmeier pleaded guilty on 7 June 2018 to one count of wire fraud and one count of filing a false tax return and was sentenced in October 2018 to 27 months by Senior Judge Donovan W. Frank in St. Paul. IRS Criminal Investigation investigated. The release does not say how the store discovered the theft, so the detection route is recorded as unknown. The five-year duration is the span the release gives (about 2011 through 2016), not a court finding to the month.",
  },
  {
    id: "case-granger-auto-dealership-office-manager-wires",
    title:
      "Auto dealership office manager wired $1.4 million to his own bank account over 14 years and hid it with journal entries",
    sector: "retail",
    schemes: ["check-tampering"],
    howItWorked:
      "The office manager of Granger Motors, an auto dealership in Granger, Iowa, ran the dealership's accounting system and payroll. From about January 1998 until May 2012 he caused money to be wired or deposited from the dealership to his personal bank account and made fraudulent journal entries so the books still balanced. He admitted taking more than $1.4 million and spent it on international airline tickets, hotels, restaurant meals, golf items, and jewelry.",
    controlGap:
      "The person who could post a journal entry also controlled the outgoing payments, and no one outside the role compared what left the bank against who received it. Fourteen years passed because the books balanced by construction: he wrote both sides.",
    lossUsd: 1433825,
    lossIsFloor: false,
    durationMonths: 172,
    detection: "unknown",
    resolvedYear: 2013,
    sodRuleIds: ["rule-cash-rec", "rule-je-rec", "rule-ach-release", "rule-release-je"],
    wouldHaveCaughtIt: [
      {
        control: "payee-account-not-an-employee",
        asApplied:
          "Compare the bank account numbers that receive outgoing wires against employee payroll accounts; a match is the finding",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner reads the bank statement first each month and questions any wire whose recipient is not a known supplier or lender",
      },
      {
        control: "independent-financial-review",
        asApplied:
          "An outside accountant reviews manual journal entries each year and asks the office manager to support each one",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Southern District of Iowa",
      url: "https://www.justice.gov/usao-sdia/pr/former-auto-dealership-office-manager-sentenced-41-months-federal-prison-14-million",
      grade: "primary-document-reported",
    },
    caveat:
      "Ralph L. Schippers pleaded guilty on 17 September 2012 to wire fraud and was sentenced in January 2013 to 41 months in prison, three years of supervised release, and restitution of $1,433,825.37, the loss figure used here. The release says the scheme was not discovered until May 2012 but not how, so the detection route is recorded as unknown. A later published opinion, United States v. Schippers, 982 F. Supp. 2d 948 (S.D. Iowa 2013), concerns collection of that restitution for Granger Motors and its insurer. This is the oldest case in the library; the mechanics have not changed.",
  },
  {
    id: "case-marion-iowa-bookkeeper-paper-payroll-checks",
    title:
      "Bookkeeper wrote herself paper payroll checks for eight years while her real pay arrived by direct deposit, more than $500,000",
    sector: "any",
    schemes: ["payroll", "check-tampering"],
    howItWorked:
      "The bookkeeper of a small veteran-owned business in Marion, Iowa had access to all of the company's financial records, ran its payroll, and was the contact for its employee retirement plan. From 2013 to 2021 she wrote physical payroll checks to herself that she was not owed, even though her own pay already arrived electronically, forged signatures, changed her own pay rate, and made false entries in the books to hide the checks. For a period she also stopped paying the company's federal and state taxes and its employee retirement-plan contributions. She took more than $500,000. After the company found the theft and fired her, it recovered $373,732 of an inheritance from her in a state civil case.",
    controlGap:
      "One person entered payroll, approved it, signed checks, and kept the ledger, so a second paycheck to the payroll clerk looked like any other payroll entry. Nobody outside the role compared the payroll register against the people actually employed or against the bank's cleared-check images.",
    lossUsd: 500000,
    lossIsFloor: true,
    durationMonths: 96,
    detection: "unknown",
    resolvedYear: 2026,
    sodRuleIds: [
      "rule-payroll",
      "rule-payroll-master-run",
      "rule-payroll-release",
      "rule-payroll-rec",
      "rule-cash-rec",
    ],
    wouldHaveCaughtIt: [
      {
        control: "payroll-register-review",
        asApplied:
          "Owner reads the payroll register each cycle; a second payment to the bookkeeper, or a paper check to someone paid by direct deposit, is visible on one page",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner opens the bank statement first and looks at the cleared-check images; a payroll check made out to the bookkeeper stands out",
      },
      {
        control: "no-self-approval",
        asApplied: "Nobody approves their own pay or changes their own pay rate, at any amount",
      },
      {
        control: "payroll-tax-remittance-verified",
        asApplied:
          "Owner logs in to the IRS and state portals each quarter to confirm the payroll-tax deposits the bookkeeper reports were made",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Northern District of Iowa",
      url: "https://www.justice.gov/usao-ndia/pr/springville-woman-sent-federal-prison-embezzlement-scheme",
      grade: "primary-document-reported",
    },
    caveat:
      "Debra Ann Vaughn, 67, of Springville, Iowa, pleaded guilty on 1 December 2025 to one count of bank fraud and was sentenced on 19 May 2026 to 41 months in prison and five years of supervised release. Restitution was set at $158,135.77 after credit for the $373,732.27 the company had already recovered in the civil case, so the loss recorded here is the release's figure of more than $500,000, not the restitution figure. The release does not say how the company discovered the theft, so the detection route is recorded as unknown. The eight-year duration is the span the release gives (2013 to 2021).",
  },
  {
    id: "case-anderson-flooring-accountant-transfers-gambling",
    title:
      "Indiana business's accountant moved $952,000 to his own accounts in 18 months and reconciled the bank himself",
    sector: "any",
    schemes: ["check-tampering", "financial-statement"],
    howItWorked:
      "The accountant and director of administration of an Indiana business, employed there for nearly six years, wrote and signed checks, made electronic payments, reconciled the accounting records against the bank, and kept the ledgers. From August 2020 to at least February 2022 he transferred about $952,237 from the company's payroll and operating accounts to his personal accounts in 120 transactions and spent much of it on online gambling. He hid the transfers by recording them as invoice payments, falsifying inventory logs, listing paid jobs as unpaid, and voiding checks.",
    controlGap:
      "The person who moved the money also performed the bank reconciliation, so the one check that compares the books with the bank was done by the one person with a reason to make them agree. Every cover entry he made was in a record only he reviewed.",
    lossUsd: 952237,
    lossIsFloor: false,
    durationMonths: 18,
    tenureYearsStated: 5,
    detection: "unknown",
    resolvedYear: 2024,
    sodRuleIds: [
      "rule-release-rec",
      "rule-sign-rec",
      "rule-cash-rec",
      "rule-je-rec",
      "rule-ach-release",
    ],
    wouldHaveCaughtIt: [
      {
        control: "independent-bank-reconciliation",
        asApplied:
          "Someone other than the person who pays the bills reconciles the bank account, so a transfer recorded as an invoice payment must match a real invoice",
      },
      {
        control: "payee-account-not-an-employee",
        asApplied:
          "Compare the destination accounts of outgoing transfers against employee payroll accounts every month",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner opens the bank statement first each month and questions transfers to any account that is not a known supplier",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Southern District of Indiana",
      url: "https://www.justice.gov/usao-sdin/pr/anderson-accountant-sentenced-over-three-years-federal-prison-embezzling-nearly-one",
      grade: "primary-document-reported",
    },
    caveat:
      'Nathaniel Wills, 34, of Anderson, Indiana, pleaded guilty to wire fraud and was sentenced in October 2024 by U.S. District Judge James P. Hanlon to 41 months in prison, three years of supervised release, and $877,507 in restitution; the loss recorded here is the $952,237 the release says he took. The release names the employer only as an Indiana business; local reporting identifies it as a flooring company, which the release does not, so the sector is recorded as any. Five years of tenure is the release\'s "nearly six years" rounded down. The release does not say how the theft was discovered, so the detection route is recorded as unknown.',
  },
  {
    id: "case-columbus-realty-office-manager-personal-amex",
    title:
      "Real estate brokerage's office manager of nine years paid her personal American Express from company accounts every month for almost six years, $454,000",
    sector: "professional-services",
    schemes: ["check-tampering", "expense-reimbursement"],
    howItWorked:
      "The office manager and bookkeeper of Keller Williams Realty River Cities in Columbus, Georgia, employed there for nine years, made monthly electronic payments from the brokerage's accounts to her personal American Express card from January 2017 to September 2022, $453,876.68 in all. In October 2022 the firm's representatives noticed discrepancies in one account and that she had moved money out of it to other accounts.",
    controlGap:
      "One person made the electronic payments and kept the books, so a monthly payment to a card issuer sat among ordinary payables for 68 months. A brokerage has no reason to pay an employee's personal card, and nothing outside the role compared the payees on the bank statement with the suppliers the firm actually had.",
    lossUsd: 453876,
    lossIsFloor: false,
    durationMonths: 68,
    tenureYearsStated: 9,
    detection: "owner-review",
    resolvedYear: 2025,
    sodRuleIds: ["rule-cash-rec", "rule-ach-release"],
    wouldHaveCaughtIt: [
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner reads the bank statement first each month; a recurring payment to a card issuer the firm holds no card with stands out on the page",
      },
      {
        control: "payee-account-not-an-employee",
        asApplied:
          "Compare recurring electronic payees against the supplier list and against employees; a card account belonging to an employee is the finding",
      },
      {
        control: "independent-bank-reconciliation",
        asApplied:
          "Someone other than the person who pays the bills reconciles the bank account, so a card payment coded as a payable must match a real supplier invoice",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Middle District of Georgia",
      url: "https://www.justice.gov/usao-mdga/pr/former-georgia-bookkeeper-sentenced-embezzling-columbus-real-estate-brokerage-firm",
      grade: "primary-document-reported",
    },
    caveat:
      "Lauren Williams Eldridge, 38, of Pine Mountain, Georgia, pleaded guilty on 29 January 2025 to five counts of wire fraud and was sentenced on 18 June 2025 by U.S. District Judge Clay Land to 27 months in prison, three years of supervised release, and restitution of $453,876.64; the loss recorded here is the $453,876.68 in payments the release states. The release says the firm's representatives noticed the discrepancies, which is recorded as the owner-review route: the business's own people looked, not an outside party. The employer is a franchise office of a national brokerage, not a national company; the release names it and describes her as its office manager and bookkeeper for nine years.",
  },
  {
    id: "case-caseyville-pediatrics-office-manager-five-ways",
    title:
      "Pediatric practice office manager took $368,000 over six years by five routes at once: cards, her own pay, reimbursements, insurance, and transfers",
    sector: "medical",
    schemes: ["expense-reimbursement", "payroll", "check-tampering"],
    howItWorked:
      "The office manager of A to Z Pediatrics in Caseyville, Illinois, took more than $350,000 from 2011 through 2017 by several routes at once: personal charges on the practice's credit cards, overpaying her own salary, reimbursing herself for overtime and mileage nobody had authorized, adding herself and family members to the practice's health insurance, and moving electronic payments from the practice's bank account to a personal credit card. She falsified journal entries to cover it. Restitution was set at $368,308.99.",
    controlGap:
      "One person ran payroll, held the cards, approved reimbursements, administered benefits, and kept the books, so every route she used was one she also recorded. No single control would have closed all five; the owner reading the payroll register, the card statement, and the bank statement each month would have closed the three that carried most of the money.",
    lossUsd: 368309,
    lossIsFloor: false,
    durationMonths: 72,
    detection: "unknown",
    resolvedYear: 2019,
    sodRuleIds: ["rule-payroll", "rule-payroll-release", "rule-ach-release", "rule-release-je"],
    wouldHaveCaughtIt: [
      {
        control: "payroll-register-review",
        asApplied:
          "Owner reads the payroll register each cycle; the office manager's own pay and overtime appear on one page next to everyone else's",
      },
      {
        control: "card-statement-line-review",
        asApplied:
          "Owner reads the practice card statement line by line each month rather than approving the total",
      },
      {
        control: "receipt-and-second-approval",
        asApplied:
          "Mileage and overtime reimbursements need a receipt or log and a second person's approval, including the office manager's own",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner opens the bank statement first and questions any electronic payment to a card issuer the practice holds no card with",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Southern District of Illinois",
      url: "https://www.justice.gov/usao-sdil/pr/embezzlement-doctors-office-sends-former-office-manager-federal-prison-nearly-three",
      grade: "primary-document-reported",
    },
    caveat:
      'Cassandra D. Eberhart, 49, of Moro, Illinois, pleaded guilty in October 2018 to wire fraud and filing a false federal income tax return and was sentenced in February 2019 to 33 months in prison, three years of supervised release, and restitution of $368,308.99, the loss figure recorded here; the release\'s headline figure is "over $350,000". The six-year duration is the span the release gives (2011 through 2017). The release does not say how the practice discovered the theft, so the detection route is recorded as unknown.',
  },
  {
    id: "case-northampton-internal-medicine-office-manager-oncology-supplies",
    title:
      'Internal medicine practice\'s office manager wrote $1.56 million of checks to her own credit cards and booked them as "Oncology Supplies"',
    sector: "medical",
    schemes: ["check-tampering", "expense-reimbursement", "financial-statement"],
    howItWorked:
      'The office manager of Northampton Internal Medical Associates in Northampton, Massachusetts, wrote checks from the practice\'s corporate account to pay her personal credit card bills from 2008 until September 2013, $1,562,206 in all, and entered them in QuickBooks as business expenses such as "Oncology Supplies". She spent the money on cash advances, competitive horse showing, clothing, restaurants, and entertainment.',
    controlGap:
      "The person who wrote the checks also kept the books, so a check to a card issuer could be coded as a supply purchase and nothing outside the role compared the payees on the cleared checks with the practice's actual suppliers. An internal medicine practice buying oncology supplies for five years is the kind of line an outside reviewer asks about and an inside one never sees.",
    lossUsd: 1562206,
    lossIsFloor: false,
    durationMonths: 68,
    detection: "unknown",
    resolvedYear: 2015,
    sodRuleIds: ["rule-cash-rec"],
    wouldHaveCaughtIt: [
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner opens the bank statement first and looks at the cleared-check images; checks payable to a card issuer stand out",
      },
      {
        control: "independent-bank-reconciliation",
        asApplied:
          "Someone other than the person who writes the checks reconciles the account, so a check coded as supplies must match a supplier invoice",
      },
      {
        control: "independent-financial-review",
        asApplied:
          'An outside accountant reviews the expense categories annually and asks what a primary care practice buys under "Oncology Supplies"',
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Massachusetts",
      url: "https://www.justice.gov/usao-ma/pr/former-medical-office-manager-sentenced-prison-embezzling-15-million-employer",
      grade: "primary-document-reported",
    },
    caveat:
      "Roxanne Tubolino, 56, of Belchertown, Massachusetts, pleaded guilty in January 2015 to one count of wire fraud and six counts of tax evasion and was sentenced in August 2015 in Springfield to 39 months in prison, 36 months of supervised release, and restitution of $1,342,256 to the practice, $25,000 to its insurer, and $506,447 to the IRS; the loss recorded here is the $1,562,206 the release says she took, and the insurer's share shows a fidelity claim was paid. The release gives the start only as 2008, so the 68-month duration counts from January 2008 and may overstate by up to eleven months. It does not say how the theft was discovered, so the detection route is recorded as unknown.",
  },
  {
    id: "case-duncan-part-time-bookkeeper-found-on-vacation",
    title:
      "Part-time bookkeeper employed more than a decade wrote herself checks, $2.28 million; found the week she was on vacation",
    sector: "any",
    schemes: ["check-tampering", "payroll", "expense-reimbursement", "financial-statement"],
    howItWorked:
      "A part-time bookkeeper for a small business in Duncan, South Carolina, employed there for more than ten years, wrote checks to herself from the company's accounts and deposited them in her own. In the ledger she marked them void; in QuickBooks she recorded them as void, as paid to other employees, or as paid to vendors. Some pay periods she paid herself three payroll checks, and she paid her personal credit card bills from the company account. It came to light when she was on vacation and her supervisor went looking for the record of a vendor payment. The company dismissed her and called law enforcement.",
    controlGap:
      "One person wrote the checks, ran payroll, and kept both sets of records, and for more than a decade nobody else had a reason to open them. The week she was away, someone did, and the scheme did not survive one person looking for one ordinary record.",
    lossUsd: 2276830,
    lossIsFloor: false,
    tenureYearsStated: 10,
    detection: "cover",
    resolvedYear: 2025,
    sodRuleIds: ["rule-payroll", "rule-payroll-release"],
    wouldHaveCaughtIt: [
      {
        control: "mandatory-time-away",
        asApplied:
          "Every year the bookkeeper takes a week off and someone else pays the bills and runs payroll from the same records; that is exactly what ended this one",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner opens the bank statement first and looks at the cleared-check images; checks payable to the bookkeeper stand out",
      },
      {
        control: "payroll-register-review",
        asApplied:
          "Owner reads the payroll register each cycle; three checks to one person in one period is visible on the page",
      },
      {
        control: "independent-bank-reconciliation",
        asApplied:
          "Someone other than the person who writes the checks reconciles the account, so a check marked void that the bank cleared does not reconcile",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of South Carolina",
      url: "https://www.justice.gov/usao-sc/pr/greer-woman-sentenced-federal-prison-ordered-pay-2m-restitution",
      grade: "primary-document-reported",
    },
    caveat:
      'Jennifer L. Bengston Cook, 56, of Greer, South Carolina, pleaded guilty to wire fraud and was sentenced in June 2025 by U.S. District Judge Jacquelin D. Austin to 36 months in prison and restitution of $2,276,830.09, the loss figure recorded here; the release\'s headline rounds it to $2 million. The release says she was employed for more than a decade and does not date the scheme, so no duration is recorded; ten years of tenure is recorded as a floor. The detection route is recorded as "someone else covered the desk": the release says the conduct was discovered when she was on vacation and her supervisor needed to find the record of a vendor payment. The release does not name the business or its trade, so the sector is recorded as any.',
  },
  {
    id: "case-evansville-parts-manager",
    title:
      "Parts manager ordered HVAC units the business did not need, then sold about 400 items on eBay",
    sector: "trades",
    schemes: ["inventory-theft"],
    howItWorked:
      "The parts manager of a multi-state business was responsible for ordering parts, signing for them when they arrived, and logging them into inventory. From 2018 to 2020 he ordered parts and products the business did not need, paid for with company funds, took them, and sold roughly 400 items — including HVAC units and LED display kits — on eBay, collecting the proceeds through PayPal.",
    controlGap:
      "Ordering, receiving, and the inventory record sat with one person. An order placed for resale looks identical to a legitimate one on the supplier invoice, and when the same person signs the delivery and writes the stock record, nothing in the paperwork ever disagrees with itself.",
    lossUsd: 431557.61,
    lossIsFloor: false,
    durationMonths: 24,
    tenureYearsStated: 5,
    detection: "unknown",
    resolvedYear: 2023,
    sodRuleIds: ["rule-order-receive"],
    wouldHaveCaughtIt: [
      {
        control: "count-inventory-independently",
        asApplied:
          "Quarterly stock count by someone outside the parts desk, compared against purchase invoices for the quarter",
      },
      {
        control: "volume-vs-recorded-sales",
        asApplied:
          "Parts purchased compared against parts sold or installed, by category, each quarter",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Southern District of Indiana",
      url: "https://www.justice.gov/usao-sdin/pr/evansville-parts-manager-sentenced-three-and-half-years-federal-prison-5-year-scheme",
      grade: "primary-document-reported",
    },
    caveat:
      "James H. Cox, 45, of Kentucky was sentenced in May 2023 by U.S. District Judge Richard L. Young to 3.5 years in prison after pleading guilty to wire fraud and tax counts. The release puts the employer's loss at $431,557.61 and splits restitution into $82,482.11 to the employer and $349,075.50 to its insurer, which is why the total rather than either restitution line is recorded here. He worked there from March 2015 to November 2020, the source of the five years of tenure; the release dates the fraudulent orders to 2018 through 2020, so 24 months is recorded as a floor. It does not say how the scheme was discovered or how large the business was.",
  },
  {
    id: "case-helena-it-salesman",
    title:
      "IT company salesman created bogus purchase orders, stole the inventory, and sold it online",
    sector: "professional-services",
    schemes: ["inventory-theft", "billing-shell-vendor"],
    howItWorked:
      "A salesman at Information Technology Corporation, a Helena, Montana company owned by the accounting firm Anderson ZurMuehlen, created fictitious purchase orders and invoices, directed payments to fictitious companies and unauthorized vendors, stole inventory, and sold it on eBay and KSL Classifieds between March 2020 and August 2021. When colleagues questioned discrepancies in orders and payments, he sent what the release calls lulling emails to reassure them and keep the scheme running, and moved the proceeds through third-party accounts he controlled.",
    controlGap:
      "A sales role held enough purchasing and vendor-payment power to create a supplier, order against it, and have it paid. The people who noticed the discrepancies raised them with the person committing the fraud rather than with someone independent of him, so the questions were answered instead of investigated.",
    lossUsd: 700000,
    lossIsFloor: false,
    durationMonths: 17,
    detection: "unknown",
    resolvedYear: 2024,
    sodRuleIds: ["rule-invoice-pay", "rule-vendor-create-pay"],
    wouldHaveCaughtIt: [
      {
        control: "new-payee-review",
        asApplied: "Owner reviews every vendor added that month and who requested it",
      },
      {
        control: "count-inventory-independently",
        asApplied: "Someone outside sales counts stock against purchase orders each quarter",
      },
      {
        control: "verify-oversight-is-real",
        asApplied:
          "Questions about order or payment discrepancies go to the owner, never back to the person who placed the order",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Montana",
      url: "https://www.justice.gov/usao-mt/pr/utah-man-sentenced-21-months-prison-defrauding-montana-employer-700000-restitution",
      grade: "primary-document-reported",
    },
    caveat:
      "Thomas Lynn Syddall, 50, of American Fork, Utah was sentenced in May 2024 to 21 months in prison and ordered to pay $700,000 in restitution after pleading guilty to wire fraud and money-laundering concealment. The release gives the loss only as the approximately $700,000 restitution figure, which is recorded here. The release names the victim and its owner; it does not state the company's size, the salesman's length of service, or how the scheme came to light.",
  },
  {
    id: "case-littleton-oral-surgery-fentanyl",
    title:
      "Oral surgery assistant removed fentanyl from the practice safe and refilled vials with another liquid",
    sector: "dental",
    schemes: ["inventory-theft"],
    howItWorked:
      "A surgical assistant at an oral surgery practice in Littleton, Colorado took fentanyl from the practice's controlled-substance safe. Boxes of fentanyl citrate in the safe had been tampered with; testing found seven vials contained a replacement liquid, and one of those was contaminated with bacteria. The theft came to light in June 2023 when her roommate found fentanyl vials and safety caps in her purse and reported it to the practice, which called the county sheriff.",
    controlGap:
      "Controlled substances were stocked and drawn from a safe the assistant could reach without a second person counting or inspecting what came out. A daily two-person count with a tamper check would have exposed a refilled vial the day it happened; instead the practice learned of it from someone outside the business.",
    lossUsd: 0,
    lossIsFloor: false,
    detection: "tip",
    resolvedYear: 2026,
    sodRuleIds: [],
    wouldHaveCaughtIt: [
      {
        control: "controlled-substance-count",
        asApplied:
          "Two people count the fentanyl and other scheduled drugs against the log at open and close, and inspect caps and seals",
      },
      {
        control: "verify-oversight-is-real",
        asApplied: "The surgeon, not the assistant who stocks the safe, signs the daily count",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Colorado",
      url: "https://www.justice.gov/usao-co/pr/former-dental-assistant-sentenced-tampering-fentanyl-vials-littleton-oral-surgery",
      grade: "primary-document-reported",
    },
    caveat:
      "Amber June Hyatt, 47, of Evergreen, Colorado pleaded guilty to one count of tampering with a consumer product and was sentenced in January 2026 to a year and a day in prison and two years of supervised release. The release states no dollar loss — the harm is to patients, who may have received a replacement liquid in place of an anesthetic — so the loss is recorded as zero and this case is excluded from loss arithmetic. It does not state when the tampering began or the assistant's length of service. The detection route is recorded as a tip because the release says the roommate reported the vials to the practice.",
  },
  {
    id: "case-st-albans-dental-billing",
    title:
      "Dental practice employee falsified payment records in the billing software while filling forged prescriptions",
    sector: "dental",
    schemes: ["receivables-diversion"],
    howItWorked:
      "An employee of a dental practice in St. Albans, Vermont embezzled $71,942.60 between May 2016 and August 2017 by manipulating and falsifying payment records in the practice's billing software. During roughly the same period she and another employee generated 46 fake prescriptions for controlled substances, typically oxycodone, forged a licensed prescriber's signature on them, and filled them at area pharmacies.",
    controlGap:
      "The person who could take a patient payment could also edit the record of it, so the ledger always matched the drawer. The embezzlement was found only because a separate drug-diversion investigation brought local police into the practice's records.",
    lossUsd: 71942.6,
    lossIsFloor: false,
    durationMonths: 15,
    detection: "law-enforcement",
    resolvedYear: 2021,
    sodRuleIds: ["rule-collect-post", "rule-collect-adjust", "rule-payments-adjust"],
    wouldHaveCaughtIt: [
      {
        control: "adjustments-report-by-employee",
        asApplied:
          "Payment edits, deletions, and adjustments in the practice-management software, listed by user, reviewed by the dentist monthly",
      },
      {
        control: "expected-receipts-vs-deposits",
        asApplied:
          "Day-sheet collections compared with the bank deposit by someone other than the front desk",
      },
      {
        control: "permission-review",
        asApplied: "Only the dentist or an outside bookkeeper can edit or delete a posted payment",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Vermont",
      url: "https://www.justice.gov/usao-vt/pr/swanton-woman-sentenced-prescription-fraud-and-embezzlement-scheme-and-ordered-pay",
      grade: "primary-document-reported",
    },
    caveat:
      "Lindsey Cox, 37, of Swanton, Vermont was sentenced in December 2021 to five years of probation and ordered to pay $71,942.60 in restitution, the figure recorded here, after pleading guilty to conspiring to acquire controlled substances by fraud and to theft in connection with health care. The release says only that payment records were manipulated and falsified, not how the money left the practice, so the scheme is recorded as receivables diversion. The detection route is recorded as law enforcement because the release credits the St. Albans Police Department, working alongside the DEA's drug-diversion investigation, with uncovering the embezzlement. The practice's size and the employee's role and length of service are not stated.",
  },
  {
    id: "case-bellevue-dental-card",
    title:
      "Dental office worker ran $174,336 of cash advances and personal spending through the practice credit card",
    sector: "dental",
    schemes: ["expense-reimbursement"],
    howItWorked:
      "An office worker for a Bellevue, Washington dentist used the practice credit card, meant for office expenses, for $122,880 in ATM cash advances plus fees, more than $46,534 in retail purchases, $25,606 in private school tuition, and a $4,692 family vacation — about $7,924 a month. She destroyed correspondence from licensing and insurance authorities and let the practice's licensing, insurance, and tax obligations go unpaid. Over the same period she obtained roughly 8,580 hydrocodone pills on about 200 occasions using forged prescriptions in her own name and the names of relatives and friends.",
    controlGap:
      "The card statement went to the person spending on the card, and so did the practice's mail. A card that can take cash advances, with a statement nobody else reads, is a checking account under a different name. The dentist learned of it when a pharmacy reported unusual prescribing to the DEA.",
    lossUsd: 174336,
    lossIsFloor: false,
    detection: "law-enforcement",
    resolvedYear: 2012,
    sodRuleIds: ["rule-release-rec"],
    wouldHaveCaughtIt: [
      {
        control: "card-statement-line-review",
        asApplied:
          "Dentist reads the card statement line by line each month; cash advances are disabled on the card",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Card and bank statements and licensing-board mail go to the dentist directly, not through the front desk",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Western District of Washington",
      url: "https://www.justice.gov/archive/usao/waw/press/2012/September/bowman.html",
      grade: "primary-document-reported",
    },
    caveat:
      "Lori Elizabeth Bowman, 38, of Bothell, Washington was sentenced in September 2012 to 30 months in prison and $174,336 in restitution for acquiring a controlled substance by fraud, access-device fraud, and aggravated identity theft. The release gives the card loss as approximately $174,336 and the monthly average as about $7,924 but no start date for the charges, so no duration is recorded. It describes detection as a pharmacy notifying the DEA about the dentist's prescribing, which led investigators to the employee; the card fraud surfaced from that investigation. The practice's size and her job title and tenure are not stated.",
  },
  {
    id: "case-boston-suburb-controller",
    title:
      "Newly hired controller took $229,088 in nine months using pre-signed checks and online banking",
    sector: "any",
    schemes: ["check-tampering"],
    howItWorked:
      "A small company in a Boston suburb hired a controller in April 2017 and gave her the checkbook, the QuickBooks file, and the online banking login. Some checks had been pre-signed in blank by a founder for business use; she wrote them to herself, and later forged the founder's signature on others, sometimes writing 'Consulting Fees' on the memo line although she was salaried. She deposited about $141,845 in checks to her own account and logged into online banking to send another $87,243 to her personal credit cards. She was fired in January 2018.",
    controlGap:
      "A founder who pre-signs blank checks has delegated the signature itself, and an online banking login with no second approver is the same thing in electronic form. The loss ran above $25,000 a month from the first month of employment — the short tenure that fraud-benchmark averages would call lowest-risk.",
    lossUsd: 229088,
    lossIsFloor: false,
    durationMonths: 9,
    tenureYearsStated: 0,
    detection: "unknown",
    resolvedYear: 2018,
    sodRuleIds: ["rule-ach-release"],
    wouldHaveCaughtIt: [
      {
        control: "dual-release-above-threshold",
        asApplied:
          "Bank-enforced dual approval on every online transfer, using the founder's own login",
      },
      {
        control: "positive-pay",
        asApplied:
          "Positive Pay, and no pre-signed checks — a check the founder has not listed does not clear",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied: "Founder opens the bank statement first and reads cleared-check images",
      },
      {
        control: "check-stock-custody",
        asApplied:
          "No check signed in blank, ever; blank stock locked and the numbers used logged each week by someone other than the controller",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Massachusetts",
      url: "https://www.justice.gov/usao-ma/pr/former-controller-small-business-sentenced-stealing-over-229000",
      grade: "primary-document-reported",
    },
    caveat:
      "Kelly A. Lynch, 40, was sentenced in October 2018 to 18 months in prison and $229,088 in restitution after pleading guilty to bank fraud. The release gives the two components as approximately $141,845 in checks and $87,243 in transfers; their sum is recorded as the loss. She was hired in April 2017 and the scheme ran until her termination in January 2018, so tenure is recorded as under a year and duration as nine months. The release does not say how the theft was found or how large the company was.",
  },
  {
    id: "case-st-louis-floor-covering",
    title:
      "Warehouse supervisor of 25 years ran ghost timesheets, fake vendors, and padded receipts for six and a half years",
    sector: "trades",
    schemes: ["payroll", "billing-shell-vendor", "expense-reimbursement"],
    howItWorked:
      "A warehouse and labor supervisor at a small floor-covering business in St. Louis County, Missouri, employed there for 25 years, submitted timesheets for a partner who did not work for the company and deposited the paychecks by forging the partner's signature; inflated his son's hours without the son's knowledge; inflated his own hours by claiming installation work; submitted invoices from two fake companies and had the company cut checks for them; paid himself on company credit cards; and altered receipts for real purchases to claim larger reimbursements. It began in March 2014 and ran six and a half years.",
    controlGap:
      "One trusted supervisor could put a name on payroll, approve hours, create a vendor, and submit a receipt, and 25 years of tenure had replaced review with trust. Each of the five schemes would have appeared on a different one-page report — the payroll register, the new-vendor list, the card statement, the reimbursement log — and none of those pages was being read by anyone else.",
    lossUsd: 339844,
    lossIsFloor: false,
    durationMonths: 78,
    tenureYearsStated: 25,
    detection: "unknown",
    resolvedYear: 2023,
    sodRuleIds: ["rule-payroll", "rule-payroll-master-run"],
    wouldHaveCaughtIt: [
      {
        control: "payroll-register-review",
        asApplied:
          "Owner reviews the payroll register against the crew roster every cycle — a name that has never been on a job site is the finding",
      },
      {
        control: "new-payee-review",
        asApplied: "Owner reviews every vendor added that month and asks to see the work",
      },
      {
        control: "receipt-and-second-approval",
        asApplied:
          "Reimbursements need the original receipt and approval from someone other than the claimant's own crew",
      },
      {
        control: "card-statement-line-review",
        asApplied: "Owner reads the company card statement line by line each month",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Eastern District of Missouri",
      url: "https://www.justice.gov/usao-edmo/pr/former-employee-sentenced-3-years-prison-embezzling-339000-st-louis-county-company",
      grade: "primary-document-reported",
    },
    caveat:
      "Ronald Scott Miller of Waterloo, Illinois was sentenced in March 2023 by U.S. District Judge Stephen R. Clark to three years and five months in prison after pleading guilty to wire fraud; the release states the loss as $339,844 and says he was ordered to repay it. The 25 years of tenure and the six-and-a-half-year duration are stated in the release. It does not say how the scheme was discovered or give the company's headcount.",
  },
  {
    id: "case-omaha-fake-refunds",
    title:
      "Area manager issued 275 credit-card refunds with no sale behind them to his own eight cards",
    sector: "restaurant",
    schemes: ["refund-fraud"],
    howItWorked:
      "An area manager hired in July 2017 to run three fast-food franchise locations in the Omaha area initiated about 275 credit-card refunds through the point-of-sale system between October 2017 and June 2018 — none tied to a real purchase — and directed them to eight of his own credit cards, pulling $30,075.16 from the company's bank account. He had passed the hiring background check by using his brother's identity on his I-9 and W-4.",
    controlGap:
      "A refund with no original sale is a payment, and the manager who could issue it was also the manager who reviewed the store's refunds. A monthly refunds-by-employee report, or a rule that refunds go only to the card that paid, would have shown 275 refunds to the same eight card numbers. The background check that should have stopped the hire was defeated by borrowed identity documents.",
    lossUsd: 30075.16,
    lossIsFloor: false,
    durationMonths: 8,
    tenureYearsStated: 0,
    detection: "unknown",
    resolvedYear: 2020,
    sodRuleIds: ["rule-refund-adjust"],
    wouldHaveCaughtIt: [
      {
        control: "adjustments-report-by-employee",
        asApplied:
          "Refunds and voids grouped by employee and by destination card, reviewed monthly; refunds allowed only to the original card",
      },
      {
        control: "compare-across-locations",
        asApplied:
          "Refund rate per location compared month over month — three stores under one manager all rising is the finding",
      },
      {
        control: "background-check-money-handlers",
        asApplied:
          "Identity verified against the person in front of you, not just the documents presented",
      },
      {
        control: "void-refund-second-approval",
        asApplied:
          "Every refund approved by a second person before it posts, with the original sale attached",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Nebraska",
      url: "https://www.justice.gov/usao-ne/pr/former-omaha-restaurant-manager-sentenced-wire-fraud",
      grade: "primary-document-reported",
    },
    caveat:
      "Robert Giardina, 39, was sentenced in September 2020 by Senior U.S. District Judge Laurie Smith Camp to 30 months in prison and $30,075.16 in restitution for wire fraud, the figure recorded here. The release names neither the management company nor the brand. The refunds ran from October 24, 2017 to June 5, 2018; he was hired on July 24, 2017, so tenure is recorded as under one year. The release does not say how the refunds were detected.",
  },
  {
    id: "case-burlington-dealership-cash",
    title:
      "Dealership office manager of 23 years took customer cash receipts and edited the accounting entries to match",
    sector: "retail",
    schemes: ["skimming", "check-tampering"],
    howItWorked:
      "The office manager of automobile dealerships in Burlington, Vermont, employed there for 23 years and in charge of all accounting with check-signing authority from about 2012, took cash paid by customers and also wrote checks to herself for non-business purposes, beginning no later than 2013. She concealed it by manipulating and falsifying entries for individual transactions in the dealerships' accounting system. An officer of the business found it in January 2024 and she was fired the same month.",
    controlGap:
      "Cash custody, check signing, and the accounting record were one seat for more than a decade. When the person who takes the cash also writes the entry describing it, the books balance by construction; only a comparison of what customers were charged against what was banked, done by someone else, breaks the loop.",
    lossUsd: 192675,
    lossIsFloor: false,
    durationMonths: 132,
    tenureYearsStated: 23,
    detection: "owner-review",
    resolvedYear: 2025,
    sodRuleIds: [
      "rule-collect-post",
      "rule-collect-adjust",
      "rule-payments-adjust",
      "rule-cash-rec",
      "rule-custody-rec",
      "rule-sign-rec",
    ],
    wouldHaveCaughtIt: [
      {
        control: "expected-receipts-vs-deposits",
        asApplied:
          "Owner compares cash sales and repair-order cash payments against bank deposits monthly",
      },
      {
        control: "adjustments-report-by-employee",
        asApplied:
          "Edited or deleted transactions in the dealer management system, listed by user, reviewed monthly",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Owner opens the bank statement first and reads every cleared check payable to an employee",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Vermont",
      url: "https://www.justice.gov/usao-vt/pr/jennifer-labonte-imprisoned-embezzling-employer",
      grade: "primary-document-reported",
    },
    caveat:
      "Jennifer LaBonte, 45, of Essex Junction, Vermont was sentenced in March 2025 to four months in prison, a $7,500 fine, and $192,675 in restitution, which she had paid in full before sentencing; the release gives the loss as about $192,000 and the restitution figure is recorded here. It says the theft began 'no later than 2013' and was uncovered in January 2024, so 132 months is a floor. The 23 years of tenure come from the stated employment dates of 2001 through January 2024. The detection route is recorded as owner review because the release says an officer of the dealerships uncovered the fraud; the dealerships are not named or sized.",
  },
  {
    id: "case-dothan-printing-credentials",
    title:
      "Former employee handed a competitor a colleague's login, exposing 30 customer accounts and their pricing for a year",
    sector: "any",
    schemes: ["data-theft"],
    howItWorked:
      "In March 2016 a printing company's former employee, recruited by the owner of a competing print shop in Dothan, Alabama, sent that owner the email address and password of a current employee whose account had elevated privileges. The competitor logged in repeatedly from his home for about a year, reading more than 30 customer account profiles and their pricing, and used the information to win the company's existing and prospective clients. The company discovered the intrusion on April 4, 2017 and cut off the access.",
    controlGap:
      "A departing employee knew a colleague's password, and the password did not change when he left. Elevated access lived in an account nobody reviewed, so a year of logins from an outside address raised no alarm. The loss here is not cash but the customer list itself.",
    lossUsd: 40000,
    lossIsFloor: true,
    durationMonths: 12,
    detection: "unknown",
    resolvedYear: 2022,
    sodRuleIds: [],
    wouldHaveCaughtIt: [
      {
        control: "no-shared-logins",
        asApplied:
          "Every person has their own login, and passwords known to a departing employee change the day they leave",
      },
      {
        control: "permission-review",
        asApplied:
          "Quarterly list of accounts with elevated privileges and their recent login locations, read by the owner",
      },
      {
        control: "same-day-access-removal",
        asApplied:
          "The departing employee's own login disabled on their last day, and every shared password changed the same day",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Southern District of Alabama",
      url: "https://www.justice.gov/usao-sdal/pr/kentucky-man-sentenced-conspiracy-intrude-protected-computer-system-competitor-business",
      grade: "primary-document-reported",
    },
    caveat:
      "Daniel Bruck LaCour, 33, of Lexington, Kentucky — the competitor, not the former employee — was sentenced in June 2022 to two years of probation, a $3,500 fine, and $40,000 in restitution to the victim company for conspiring to intrude into a protected computer. The release does not quantify the business lost; the $40,000 restitution is recorded as a floor. It describes the victim only as a printing company based in New York and Tennessee, does not state its size, and does not say how the intrusion was discovered. The insider is the former employee who supplied the credentials; the release does not describe any charge against that person.",
  },
  {
    id: "case-lenoir-secret-bank-account",
    title:
      "Office manager kept open a bank account the owner told him to close and routed customer payments into it",
    sector: "any",
    schemes: ["receivables-diversion", "check-tampering"],
    howItWorked:
      "The office manager of two family-owned businesses in Lenoir, North Carolina worked there from 2013 to 2019, keeping the books, paying vendors and the IRS, and reconciling the bank accounts. Told by the owner to close one company bank account, he instead kept it open, instructed customers to pay into it, and drew the money out with checks to himself deposited to his personal accounts — more than $1 million in all, spent on his mortgage, vehicle loans, a home theater, travel, and shopping.",
    controlGap:
      "The owner's instruction to close the account was never verified with the bank, and the person who would have reported the account's continued existence was the person using it. An account that receives customer money and appears on no statement the owner reads is, in effect, a second business the owner does not know he has.",
    lossUsd: 1000000,
    lossIsFloor: true,
    tenureYearsStated: 6,
    detection: "unknown",
    resolvedYear: 2021,
    sodRuleIds: ["rule-cash-rec", "rule-custody-rec", "rule-release-rec", "rule-sign-rec"],
    wouldHaveCaughtIt: [
      {
        control: "verify-oversight-is-real",
        asApplied:
          "Owner confirms directly with the bank, annually, which accounts exist in the company's name",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "Every account's statement goes to the owner first, including any the owner believes is closed",
      },
      {
        control: "confirm-remittance-account",
        asApplied: "Major customers confirm each year which account they are paying into",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Western District of North Carolina",
      url: "https://www.justice.gov/usao-wdnc/pr/office-manager-sentenced-four-years-embezzling-more-1-million-his-former-employer",
      grade: "primary-document-reported",
    },
    caveat:
      "Richard Allen Clark, 55, of Lenoir, North Carolina was sentenced in October 2021 to 48 months in prison, $980,000 in restitution to the businesses, and $194,750 to the IRS after pleading guilty to mail fraud, money laundering, and filing a false tax return. The release says more than $1 million, recorded as a floor. The six years of tenure come from the stated employment dates of 2013 to 2019; the release does not date the scheme itself within that span, so no duration is recorded. The businesses are not named and their size is not stated; the release does not say how the scheme was discovered.",
  },
  {
    id: "case-dartmouth-serial-embezzler",
    title:
      "Bookkeeper redirected vendor payments at one employer, then inflated her own payroll at the next",
    sector: "any",
    schemes: ["billing-shell-vendor", "payroll"],
    howItWorked:
      "From September 2017 to April 2020 an employee in Dartmouth, Massachusetts took at least $280,000 from one employer by directing payments meant for vendors to bank accounts she controlled and paying her personal credit cards and auto loan with company funds, falsifying the books so the payments appeared to have gone to legitimate vendors. From May 2022 to December 2023, at a second employer, she inflated her own payroll by more than $160,000 and paid herself phony reimbursements, hiding both by manipulating the payroll and accounting software.",
    controlGap:
      "The second employer hired someone who had left the first two years earlier after a $280,000 loss, and gave her the same combination of payment authority and control of the record. A reference call, or a bank alert on vendor account-detail changes at the first employer, would have stopped either half of this.",
    lossUsd: 443122.59,
    lossIsFloor: true,
    detection: "unknown",
    resolvedYear: 2025,
    sodRuleIds: ["rule-vendor-create-pay", "rule-payroll-release"],
    wouldHaveCaughtIt: [
      {
        control: "background-check-money-handlers",
        asApplied:
          "Reference calls to the previous employer before anyone is given payment authority",
      },
      {
        control: "bank-alerts-on-payee-change",
        asApplied: "Bank alerts the owner on any change to a vendor's account details",
      },
      {
        control: "payee-account-not-an-employee",
        asApplied: "No vendor is paid to a bank account matching an employee's",
      },
      {
        control: "payroll-register-review",
        asApplied:
          "Owner reviews the payroll register every cycle, including reimbursements paid through payroll",
      },
      {
        control: "vendor-master-change-log",
        asApplied:
          "Monthly list of new suppliers and changed bank details, read by the owner and confirmed by phone with the supplier",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Massachusetts",
      url: "https://www.justice.gov/usao-ma/pr/dartmouth-woman-sentenced-prison-embezzling-multiple-employers",
      grade: "primary-document-reported",
    },
    caveat:
      "Jasmyne Botelho, 42, of Dartmouth, Massachusetts was sentenced in March 2025 to 20 months in prison and ordered to pay $443,122.59 in restitution and forfeiture after pleading guilty to two counts of wire fraud. The release gives the two losses as 'at least $280,000' and 'more than $160,000'; the restitution total is recorded as the loss and marked as a floor. Neither employer is named or sized, no job title is given — 'bookkeeper' in the title describes the duties, not a stated title — and the release does not say how either scheme was discovered. The two schemes ran 32 and 20 months and are not combined into a single duration.",
  },
  {
    id: "case-jersey-city-condo-kickbacks",
    title:
      "Property manager steered repair work to a contractor who doubled his invoices and kicked back $440,000",
    sector: "any",
    schemes: ["corruption", "billing-shell-vendor"],
    howItWorked:
      "From November 2018 through October 2020 the lead property manager of a Jersey City, New Jersey condominium complex, together with the building superintendent, steered repair and maintenance work to one contractor and falsified invoices that grossly inflated the value of the work. The complex paid the contractor over $1 million for work worth about $500,000; the contractor paid $440,000 of the excess back to the property manager and about $30,000 to the superintendent.",
    controlGap:
      "The person choosing the contractor was the person approving the invoice, and no one independent compared what was billed against what was done. Kickback schemes leave no missing money in the books — every payment is to a real vendor for real work — so the only place they show is in prices, and someone has to be looking at prices.",
    lossUsd: 470000,
    lossIsFloor: false,
    durationMonths: 23,
    detection: "unknown",
    resolvedYear: 2024,
    sodRuleIds: ["rule-vendor-approve-pay"],
    wouldHaveCaughtIt: [
      {
        control: "billing-matches-the-schedule",
        asApplied:
          "Owner or board spot-checks invoiced repairs against the work order and a walk of the property",
      },
      {
        control: "dual-release-above-threshold",
        asApplied:
          "Repair invoices above a set amount need a second approver who did not select the contractor",
      },
      {
        control: "independent-financial-review",
        asApplied:
          "Annual outside review of spend by vendor — one contractor's share doubling is the finding",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of New Jersey",
      url: "https://www.justice.gov/usao-nj/pr/lead-property-manager-admits-conspiracy-committ-wire-fraud-470000-kickback-scheme",
      grade: "primary-document-reported",
    },
    caveat:
      "The lead property manager, 56, of Jersey City pleaded guilty in April 2024 to conspiracy to commit wire fraud, with sentencing scheduled for August 2024; this record has not been updated with the sentence and does not name him for that reason. The release states the loss to the complex's owner as $470,000, the sum of the kickbacks. It does not name the complex or its owner, or say how the scheme was discovered. The victim is a property owner rather than an operating business, so the sector is recorded as any.",
  },
  {
    id: "case-irvine-consultancy-it-wipe",
    title:
      "Consulting firm's IT lead, stripped of his duties but not his logins, deleted eight years of work and the off-site backups",
    sector: "professional-services",
    schemes: ["data-destruction"],
    howItWorked:
      "A senior strategist hired in April 2014 by Blue Stone Strategy Group, an Irvine, California consulting firm serving tribal governments, ran the firm's information technology and marketing. In November 2014, after he fell behind and the firm took those duties away and sent him to a client project in Florida, he used the administrator access he still held to delete files on the office server and the firm's cloud services, and sent a remote wipe command to the office Mac Pro from his phone. After resigning he kept deleting: client information, the firm's work product, its website and marketing materials built over eight years, and the backup copies a third-party provider held for the firm.",
    controlGap:
      "One person administered the user accounts, the cloud services, and the backup provider, and nobody revoked that access when his duties changed or when he resigned. A backup the same login can delete is not a backup. Only a recovery copy outside every employee's reach, plus removing administrator rights the day a role changes, would have limited the damage to an afternoon.",
    lossUsd: 53305,
    lossIsFloor: true,
    durationMonths: 1,
    tenureYearsStated: 0,
    detection: "unknown",
    resolvedYear: 2019,
    sodRuleIds: ["rule-backup-access"],
    wouldHaveCaughtIt: [
      {
        control: "recovery-copy-out-of-reach",
        asApplied:
          "One backup copy that no employee login can delete — held by a provider under the owner's own account, or offline",
      },
      {
        control: "permission-review",
        asApplied:
          "Administrator rights on the server, cloud services, and backup provider revoked the day a person's duties change, not the day they leave",
      },
      {
        control: "no-shared-logins",
        asApplied:
          "Each system administered under a named login the owner can switch off in one step, with the owner holding a second administrator account",
      },
      {
        control: "same-day-access-removal",
        asApplied:
          "Every login, cloud credential, and backup-provider account revoked the day his duties were taken away, not left until he resigned",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Central District of California",
      url: "https://www.justice.gov/usao-cdca/pr/former-it-administrator-sentenced-more-2-years-prison-hacking-his-ex-employer-s",
      grade: "primary-document-reported",
    },
    caveat:
      "Nikishna Polequaptewa, 37, of Avondale, Arizona was found guilty by a federal jury in November 2018 of one count of unauthorized impairment of the integrity and availability of data and was sentenced in July 2019 to 27 months in prison and $53,305 in restitution. The loss recorded here is the restitution figure and is a floor: the release describes eight years of website and marketing work destroyed but puts no price on it. He was hired in April 2014, so tenure is recorded as under one year. The deletions ran over days in November 2014, recorded as one month. The release does not say how the firm discovered the deletions, so the detection route is unknown.",
  },
  {
    id: "case-centro-san-antonio-fake-audit",
    title: "Nonprofit bookkeeper wrote herself 118 checks over three years",
    sector: "nonprofit",
    schemes: ["check-tampering", "financial-statement"],
    howItWorked:
      "The office manager and bookkeeper of a San Antonio nonprofit that ran services for the city's downtown public improvement district forged or wrote to herself 118 checks on the nonprofit's bank account between July 2014 and November 2017 and deposited them in her own account, $291,385.23 in all.",
    controlGap:
      "One person kept the books, wrote the checks, and was the board's only window onto the finances, so every check on her work passed through her. The board needed to read the cleared checks itself.",
    lossUsd: 291385.23,
    lossIsFloor: false,
    durationMonths: 40,
    detection: "unknown",
    resolvedYear: 2022,
    sodRuleIds: ["rule-cash-rec"],
    wouldHaveCaughtIt: [
      {
        control: "verify-oversight-is-real",
        asApplied:
          "The board engages and pays the auditor directly and receives the report from the auditor, never through the bookkeeper",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "The board treasurer receives the bank statement unopened each month and reads every cleared-check image",
      },
      {
        control: "positive-pay",
        asApplied: "The bank pays only checks on a list a board officer approves",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Western District of Texas",
      url: "https://www.justice.gov/usao-wdtx/pr/san-antonio-bookkeeper-sentenced-fraud",
      grade: "primary-document-reported",
    },
    caveat:
      "Alicia Henderson pleaded guilty in 2020 and was sentenced on 5 August 2022 to 33 months in prison and $356,104.23 in restitution, which covers the $291,385.23 taken plus $64,719 in unpaid federal tax on it; the loss recorded here is the amount taken. The nonprofit's name, Centro San Antonio, and the fake-audit detail come from San Antonio Report and KSAT coverage of the case: to keep the board satisfied she arranged an elaborate fake audit, with fabricated emails and websites and at least one other person who posed as the auditor. The release identifies the victim only as a nonprofit serving the Downtown Public Improvement District and does not describe the audit, so neither detail appears in the account above. The release does not say how the theft was discovered or how long she had worked there.",
  },
  {
    id: "case-dc-advocacy-finance-director-transfers",
    title:
      "Finance director with online-banking access moved $318,000 to himself in 32 transfers labelled as a digital-services vendor",
    sector: "nonprofit",
    schemes: ["billing-shell-vendor", "expense-reimbursement"],
    howItWorked:
      "A nonprofit advocacy organization in Washington, D.C. hired a director of finance in June 2021 and gave him, as one of three people with access to the bank account, the job of paying the bills. On 32 occasions between then and October 2022 he sent the organization's money to accounts he controlled, recording the payments as going to a vendor for digital services and creating other false documents to match. He also put personal travel for himself, family, and friends on the organization's credit card. He was gone by October 2022.",
    controlGap:
      "Three people could log in to the bank, but no second person had to approve a transfer before it left, so the person who entered the payment also released it. A payee record that reads 'digital services' is the whole check when nobody matches the bank's destination account to the vendor's real one. The card had the same gap: he approved his own statement.",
    lossUsd: 318000,
    lossIsFloor: false,
    durationMonths: 16,
    tenureYearsStated: 1,
    detection: "unknown",
    resolvedYear: 2025,
    sodRuleIds: ["rule-ach-release", "rule-vendor-create-pay"],
    wouldHaveCaughtIt: [
      {
        control: "dual-release-above-threshold",
        asApplied:
          "Bank-enforced second approval on every outgoing transfer, by a board officer who did not enter it",
      },
      {
        control: "new-payee-second-approval",
        asApplied:
          "Any new vendor bank account confirmed by phone with the vendor before the first payment, by someone other than the person who set it up",
      },
      {
        control: "card-statement-line-review",
        asApplied:
          "The executive director reads every line of the finance director's card statement each month",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Columbia",
      url: "https://www.justice.gov/usao-dc/pr/former-finance-director-district-non-profit-sentenced-embezzlement",
      grade: "primary-document-reported",
    },
    caveat:
      "Jarrett Robert Lewis, 44, pleaded guilty on 13 February 2025 to one count of wire fraud and was sentenced on 17 June 2025 to 27 months in prison, three years of supervised release, $318,000 in restitution, and $53,335 for the organization's legal fees. The loss recorded here is the restitution figure; the release describes the total as nearly $320,000. He was hired in June 2021 and the scheme ran to October 2022, so tenure is recorded as one year. The release does not name the organization or say how the transfers were found.",
  },
  {
    id: "case-seattle-nonprofits-finance-director-casinos",
    title:
      "Finance director drained two nonprofits in turn, $3.1 million, much of it withdrawn on their cards at casinos",
    sector: "nonprofit",
    schemes: ["expense-reimbursement", "cash-larceny"],
    howItWorked:
      "As finance director of Country Doctor Community Health Centers in Seattle she took about $2.3 million between December 2016 and June 2020, then moved to Community Passageways and took about $890,000 more between June 2020 and May 2022. She used the organizations' credit and debit cards, withdrawing about $1.6 million at casinos, and spent the rest on clothing, travel, and her mortgage. When one of the organizations' banks asked about the casino withdrawals, she said the nonprofit ran youth programs at casinos and the cash was for prizes, and the answer was accepted.",
    controlGap:
      "The person who held the cards also reconciled the accounts and answered the bank's questions, so the one outside party that noticed something wrong was routed back to her. Nobody who did not hold a card read the card and bank statements line by line. A reference check between the two nonprofits, or a review of the first one's books when she left, would have stopped the second loss.",
    lossUsd: 3121572,
    lossIsFloor: false,
    durationMonths: 66,
    detection: "unknown",
    resolvedYear: 2023,
    sodRuleIds: ["rule-release-rec"],
    wouldHaveCaughtIt: [
      {
        control: "card-statement-line-review",
        asApplied:
          "A board officer who holds no card reads every card and bank statement line each month; a casino ATM line is the finding",
      },
      {
        control: "independent-bank-reconciliation",
        asApplied:
          "Someone other than the finance director reconciles every bank and card account, and the bank's questions go to that person",
      },
      {
        control: "independent-financial-review",
        asApplied:
          "An outside accountant reviews the books at every finance-director departure before the person's next employer relies on a reference",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Western District of Washington",
      url: "https://www.justice.gov/usao-wdwa/pr/former-finance-director-two-non-profits-sentenced-41-months-prison-embezzling-over-3",
      grade: "primary-document-reported",
    },
    caveat:
      "Susana Tantico, 63, of Renton, Washington pleaded guilty in May 2023 to two counts of wire fraud and was sentenced in September 2023 to 41 months in prison, three years of supervised release, and $3,121,572 in restitution, the figure recorded here. The release describes the thefts as running over an eleven-year period, but the dated spans it gives (December 2016 to May 2022) cover 66 months, which is what is recorded. One nonprofit spent $132,000 on a forensic audit and repairs to its records afterward. The release does not say how the thefts came to light; the bank inquiry it describes was deflected, not acted on. These employers are larger than most businesses this app serves.",
  },
  {
    id: "case-brooklyn-nonprofit-fiscal-officer-fake-invoices",
    title:
      "Senior fiscal officer paid a company she owned on more than 500 invented invoices for nearly 17 years, $2.34 million",
    sector: "nonprofit",
    schemes: ["billing-shell-vendor"],
    howItWorked:
      "The senior fiscal officer of a Brooklyn nonprofit that provides employment and education services set up a sham company and, over nearly 17 years, generated and submitted more than 500 fictitious invoices from it for services supposedly delivered under a New York City Department of Education program for students in shelters and, later, job training for adults in shelters. She approved the invoices, paid them, and edited the accounting system so the payments did not stand out, $2,339,700 in all, spent on her mortgage, credit cards, car payments, and shopping.",
    controlGap:
      "The person who set up the vendor, approved its invoices, released the payments, and kept the ledger was one person for 17 years. A program-funded vendor whose invoices nobody outside finance matched to program records could bill forever. The length of the run shows the annual audit never sampled this vendor against evidence of delivery.",
    lossUsd: 2339700,
    lossIsFloor: false,
    durationMonths: 200,
    detection: "unknown",
    resolvedYear: 2025,
    sodRuleIds: [
      "rule-vendor-create-pay",
      "rule-vendor-create-approve",
      "rule-invoice-pay",
      "rule-vendor-approve-pay",
    ],
    wouldHaveCaughtIt: [
      {
        control: "new-payee-review",
        asApplied:
          "Every new vendor approved by the executive director with its registration and owner checked against staff names and addresses",
      },
      {
        control: "billing-matches-the-schedule",
        asApplied:
          "Every invoice for program services matched to the program's own attendance or delivery records by the program lead, not by finance",
      },
      {
        control: "independent-financial-review",
        asApplied:
          "The outside auditor samples the largest vendors each year and asks the program staff, not the fiscal officer, what was delivered",
      },
      {
        control: "vendor-master-change-log",
        asApplied:
          "The month a new vendor appears, the executive director reads the addition and checks its owner and address against staff records",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Eastern District of New York",
      url: "https://www.justice.gov/usao-edny/pr/former-fiscal-officer-brooklyn-charity-sentenced-21-months-imprisonment-embezzlement",
      grade: "primary-document-reported",
    },
    caveat:
      "Marcia Joseph pleaded guilty to wire fraud in January 2024 and was sentenced in September 2025 by U.S. District Judge Eric N. Vitaliano to 21 months in prison, with restitution and forfeiture of about $2.3 million; the loss recorded here is the $2,339,700 the release states she took. The release describes the span as nearly 17 years, recorded as 200 months. It does not name the nonprofit, state her hire date, or say how the invoices were discovered.",
  },
  {
    id: "case-baton-rouge-mattress-retailer-forged-checks",
    title:
      "Retail chain's office manager printed herself more than 300 checks of $1,500 to $4,000 over six and a half years, $1.2 million",
    sector: "retail",
    schemes: ["check-tampering"],
    howItWorked:
      "The office manager at the Baton Rouge headquarters of Mattress Direct, a regional mattress retailer, printed company checks payable to herself and to one other person in amounts between $1,500 and $4,000, forged the company treasurer's signature, and deposited them. From June 2012 to December 2018 she diverted more than 300 checking transactions worth more than $1.2 million.",
    controlGap:
      "Each check was small enough to pass unnoticed inside a retailer's daily volume, and the same person printed the checks, held the signature, and kept the books. Nobody who did not print checks looked at the cleared-check images, and the bank had no list of approved checks to compare against.",
    lossUsd: 1200000,
    lossIsFloor: true,
    durationMonths: 78,
    detection: "unknown",
    resolvedYear: 2019,
    sodRuleIds: ["rule-cash-rec"],
    wouldHaveCaughtIt: [
      {
        control: "positive-pay",
        asApplied:
          "The bank pays only checks whose number, payee, and amount the treasurer has uploaded; a check to the office manager is not on the list",
      },
      {
        control: "owner-opens-bank-statement",
        asApplied:
          "The treasurer opens the bank statement first and looks at every cleared-check image for a payee who works in the office",
      },
      {
        control: "independent-bank-reconciliation",
        asApplied: "Someone who cannot print checks reconciles the bank account each month",
      },
      {
        control: "check-stock-custody",
        asApplied:
          "Blank check stock locked away from the office manager, with the numbers used logged and compared to the bank statement weekly",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Middle District of Louisiana",
      url: "https://www.justice.gov/usao-mdla/pr/former-office-manager-sentenced-federal-prison-embezzling-over-one-million-dollars",
      grade: "primary-document-reported",
    },
    caveat:
      "Katherine Dyson of Denham Springs, Louisiana was sentenced in December 2019 to 42 months in prison after pleading guilty; the release states the loss as more than $1.2 million across more than 300 transactions, so the figure is recorded as a floor. The employer's name comes from the release and from The Advocate's coverage. The release does not say how the checks were discovered, give her hire date, or state the company's headcount.",
  },
  {
    id: "case-lowell-animal-hospital-refunds",
    title:
      "Animal hospital client relations specialist entered about 482 false refunds to her own debit cards over four years",
    sector: "any",
    schemes: ["refund-fraud"],
    howItWorked:
      "A client relations specialist at a full-service animal hospital, who worked there from October 2011 until September 2018, sold retail products to customers at the hospital. A temporary supervisory role also gave her access to the hospital's management software and the ability to manipulate account transactions. From March 2014 through August 2018 she entered false refund transactions in that software and credited them to her own personal debit cards: some refunded merchandise a customer had really bought and never returned, others refunded purchases that were never made. About 482 transactions in all. She hid them on the dormant accounts of inactive clients, such as those whose pets had died, and on test accounts set up for training.",
    controlGap:
      "The person who took customers' payments at the counter could also issue refunds, and a refund to her own debit card went through as readily as one to a customer's. The accounts the refunds were booked against belonged to clients nobody was going to hear from, so no customer was ever in a position to notice.",
    lossUsd: 182827.68,
    lossIsFloor: false,
    durationMonths: 53,
    tenureYearsStated: 6,
    detection: "unknown",
    resolvedYear: 2020,
    sodRuleIds: ["rule-cash-refund"],
    wouldHaveCaughtIt: [
      {
        control: "adjustments-report-by-employee",
        asApplied:
          "Refunds listed monthly by employee and by the card they went to; one employee's cards receiving refunds for years is the finding",
      },
      {
        control: "void-refund-second-approval",
        asApplied:
          "Every refund approved by someone who does not work the counter, with the original sale attached and paid back only to the card that paid",
      },
      {
        control: "permission-review",
        asApplied:
          "Owner reviews who can issue refunds in the practice software, and removes the right when a temporary supervisory role ends",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, District of Massachusetts",
      url: "https://www.justice.gov/usao-ma/pr/lowell-woman-sentenced-stealing-approximately-182000-employer",
      grade: "primary-document-reported",
    },
    caveat:
      "Sasha A. Saulnier of Lowell, Massachusetts pleaded guilty in January 2020 to six counts of wire fraud and was sentenced by U.S. District Judge Nathaniel M. Gorton to one year and one day in prison and restitution of $182,827.68, the figure recorded here. The resolved year is the year of the plea; the sentencing date could not be confirmed from here. The six years of tenure are the whole years from October 2011 to September 2018. The releases do not name the hospital, give its size, or say how the refunds were found; the sector is recorded as any because a veterinary hospital is neither a dental nor a medical practice, though its front desk works the same way.",
  },
  {
    id: "case-norfolk-brake-maker-treasurer-payroll",
    title:
      "Manufacturer's treasurer put her husband on the payroll and paid herself above her salary",
    sector: "any",
    schemes: ["payroll"],
    howItWorked:
      "The treasurer of a manufacturer of brake products in Norfolk, Virginia had access to the company's financial records and accounts, including the ability to approve payroll. She created a payroll account for her husband, who never worked for the company and did not know about it, and issued herself unauthorized payroll funds above her salary. She also intercepted vendor payments, diverted them to her personal accounts, and changed the company's records so the payments appeared to have been deposited in the company's accounts. The release says she took the money to cover online gambling losses and to support her shopping.",
    controlGap:
      "The same person could add a name to the payroll and send the pay out. A payroll account for someone who never worked there needs only one pair of hands when the person who sets it up also releases the money, and the same access let her rewrite the records that would otherwise have shown it.",
    lossUsd: 123104.42,
    lossIsFloor: false,
    detection: "unknown",
    resolvedYear: 2026,
    sodRuleIds: ["rule-payroll-master-release"],
    wouldHaveCaughtIt: [
      {
        control: "payroll-register-review",
        asApplied:
          "Owner reads the payroll register each cycle against who actually works there, before the run is released",
      },
      {
        control: "no-self-approval",
        asApplied: "The treasurer's own pay is approved by someone else, at any amount",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Eastern District of Virginia",
      url: "https://www.justice.gov/usao-edva/pr/norfolk-woman-sentenced-over-year-prison-embezzling-her-employer-pay-gambling-debts",
      grade: "primary-document-reported",
    },
    caveat:
      "Katherine Louise Henderson, 55, of Norfolk was sentenced in June 2026 to a year and six months in prison for wire fraud; the release gives the total taken as $123,104.42, the figure recorded here, which includes the diverted vendor payments. The release does not name the company, give its size, say when the scheme began or how long it ran, or say how it was found.",
  },
  {
    id: "case-pittsburgh-foundation-it-invoices",
    title:
      "Foundation IT manager approved his own shell company's invoices for eight years, nearly $1 million",
    sector: "nonprofit",
    schemes: ["billing-shell-vendor"],
    howItWorked:
      "An IT manager at The Heinz Endowments, a Pittsburgh philanthropic foundation, worked there from 2014 to 2024, maintained its servers and IT systems, and was required to approve vendor invoices and to hire outside contractors for technical work. Between 2016 and 2024 he billed the foundation through a shell corporation he controlled, submitting invoices for work that was never performed or was performed by other vendors, and authorized payment of those invoices himself.",
    controlGap:
      "The person who put a bill forward was also the person who approved it for payment, so a bill from his own company needed nobody else's sign-off.",
    lossUsd: 977977,
    lossIsFloor: false,
    durationMonths: 96,
    tenureYearsStated: 10,
    detection: "unknown",
    resolvedYear: 2026,
    sodRuleIds: ["rule-invoice-approve"],
    wouldHaveCaughtIt: [
      {
        control: "no-self-approval",
        asApplied:
          "Invoices a department head puts forward are approved by someone outside that department before they are paid",
      },
      {
        control: "new-payee-review",
        asApplied:
          "Someone outside IT reviews each new vendor that month and who at the vendor the foundation actually deals with",
      },
      {
        control: "independent-financial-review",
        asApplied:
          "Outside IT spending read once a year against what was actually delivered, by someone who does not approve it",
      },
    ],
    source: {
      publisher: "U.S. Attorney's Office, Western District of Pennsylvania",
      url: "https://www.justice.gov/usao-wdpa/pr/former-foundation-it-manager-sentenced-prison-embezzling-nearly-1-million-employer",
      grade: "primary-document-reported",
    },
    caveat:
      "Charles A. Richardson, 45, of Pittsburgh pleaded guilty to one count of wire fraud and was sentenced in 2026 by U.S. District Judge Christy Criswell Wiegand to one year and one day in prison. The release gives the loss as nearly $1 million; the $977,977 recorded here is the restitution ordered, as reported by Hoodline. That he was required to approve vendor invoices and submitted the shell company's invoices comes from press coverage of the sentencing, which attributes it to prosecutors; the release itself says he embezzled the money by authorizing payment of the fraudulent invoices. The 96 months are the eight years of billing, 2016 to 2024, and the ten years of tenure are 2014 to 2024. The foundation's headcount is not stated.",
  },
];
