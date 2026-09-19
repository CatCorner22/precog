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
    sodRuleIds: ["rule-cash-rec", "rule-custody-rec", "rule-deposit-post"],
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
    schemes: ["billing-shell-vendor", "receivables-diversion", "skimming"],
    howItWorked:
      "The financial coordinator of a Houston dental practice formed a company named SGS Healthcare and directed practice revenue to it. Insurance checks written payable to the practice were deposited into accounts she controlled. The dentist had been in business 38 years. In July 2021 he began a detailed review of his own company accounts to prepare for retirement, and that review is what surfaced the scheme. She also manipulated the books to conceal cash payments patients had made directly to the practice.",
    controlGap:
      "Nobody outside the role could see which entities the practice paid or received through, and no one independently confirmed that insurer payments landed in the practice's own account. The owner had not examined the accounts closely in years.",
    lossUsd: 243597,
    lossIsFloor: false,
    detection: "owner-review",
    resolvedYear: 2023,
    sodRuleIds: ["rule-vendor-create-pay", "rule-cash-rec"],
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
    lossIsFloor: false,
    durationMonths: 132,
    detection: "bank-or-insurer",
    resolvedYear: 2017,
    sodRuleIds: ["rule-claims-writeoff", "rule-admin-writeoff"],
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
      "This case runs the other direction from embezzlement: the money flowed into the practice, and the practice carried the repayment and reputational exposure. Billing ran from 2005 to 2016; the $581,729 reflects insurer payments between 2011 and 2015. The 132 months recorded is the full 2005 to 2016 billing period, which is how long the scheme ran; the $581,729 is what insurers paid during the 2011 to 2015 window within it. The provider whose identity was used was a retired dentist. Sentenced 2017 to twelve months and one day.",
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
    detection: "owner-review",
    resolvedYear: 2022,
    sodRuleIds: [
      "rule-vendor-create-pay",
      "rule-vendor-create-approve",
      "rule-vendor-approve-pay",
      "rule-payroll",
    ],
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
      "The $356,000 recorded here is the sum of the two components the charging office states for this employer — about $336,000 in bogus vendor payments plus about $20,000 in payroll issued under other people's names. The prosecution's overall figure of $881,000 is larger because it covers a second victim: after MI5 detected the fraud in July 2019 and fired her, she lied about her work history, was hired as bookkeeper at a family-owned construction company in Rochester, was promoted to general manager, and embezzled there too. Sentenced to nine years and three months, with more than $1 million in restitution. Scheme at MI5 ran April 2014 to July 2019.",
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
      "rule-vendor-create-pay",
      "rule-payroll",
      "rule-admin-pay",
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
    detection: "owner-review",
    resolvedYear: 2022,
    sodRuleIds: ["rule-payroll", "rule-admin-pay"],
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
    sodRuleIds: ["rule-payroll"],
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
      url: "https://www.justice.gov/usao-ma/pr/attleboro-woman-pleads-guilty-embezzling-more-400000",
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
    sodRuleIds: ["rule-payroll", "rule-admin-pay"],
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
    title: "Nonprofit executive director spent $836,000 of agency money over five years",
    sector: "nonprofit",
    schemes: ["expense-reimbursement", "corruption"],
    howItWorked:
      "The executive director of Human First, Inc., a Long Island nonprofit, used agency funds over more than five years in the role for personal spending including international travel, spas, salons, restaurants, and elective cosmetic surgery.",
    controlGap:
      "A board that meets quarterly and reads a summary is not a control over the executive director's own spending. Without someone reviewing the ED's card statement line by line, the position reviews itself.",
    lossUsd: 836000,
    lossIsFloor: false,
    durationMonths: 64,
    detection: "unknown",
    resolvedYear: 2019,
    sodRuleIds: ["rule-admin-pay", "rule-vendor-create-pay"],
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
      "Sentence was 33 months, with $836,000 forfeited and $1,415,000 ordered in restitution. The restitution figure exceeds the forfeiture and is the better measure of total harm to the organization. Human First served autistic children and developmentally disabled young adults. Wafa Abboud was executive director from January 2011 to May 2016 and acted alongside several co-conspirators — which matters, because segregation of duties assumes people do not collude, and here they did.",
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
    sodRuleIds: ["rule-admin-pay"],
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
    resolvedYear: 2016,
    sodRuleIds: ["rule-admin-pay", "rule-cash-rec"],
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
      'Restitution and forfeiture were each ordered at $279,611, which is the figure recorded here; the charging office\'s headline of "nearly $280,000" is that number rounded up, so it is not a floor. Pled guilty November 2016; six months in prison.',
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
    sodRuleIds: ["rule-cash-rec", "rule-admin-pay", "rule-vendor-create-pay"],
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
      "Sentenced November 2025 to two years for wire fraud and filing a false tax return. Nine years is the longest run in this library, and it is worth sitting with: nothing in the ordinary course of business surfaced it for nearly a decade. The employer was Hardware Sales in Bellingham. Amy Siniscarco was sentenced 6 November 2025.",
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
    resolvedYear: 2013,
    sodRuleIds: ["rule-collect-post", "rule-custody-rec", "rule-deposit-post"],
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
    caveat: "Sentence was 34 months. Gwendolyn Muller was ordered to pay $556,000 in restitution.",
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
];
