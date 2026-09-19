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
    sodRuleIds: ["rule-admin-pay", "rule-cash-rec"],
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
      "The manager of a Chick-fil-A franchise at Minneapolis–St. Paul airport, owned by The Grove, Inc., was responsible for collecting the daily cash receipts from that restaurant and a sister pizzeria and depositing them in a safe-deposit box. From September 2022 to October 2023 he kept some or all of the cash. He hid the gap by depositing later days' receipts against earlier days, so the record showed deposits running late rather than missing.",
    controlGap:
      "One person carried the cash from the register to the bank and nobody matched each day's point-of-sale cash total to a deposit of the same date. Lapping — using tomorrow's cash to cover today's — only works when deposits are checked by amount and not by date.",
    lossUsd: 144819,
    lossIsFloor: false,
    durationMonths: 13,
    detection: "unknown",
    resolvedYear: 2024,
    sodRuleIds: ["rule-deposit-post", "rule-custody-rec"],
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
      "The linked release is the charging document (February 2024). Timothy Michael Hill Jr. pleaded guilty in June 2024 and, per press reports of the sentencing hearing, was sentenced in October 2024 to one year in prison with restitution of about $145,000. The loss figure is the amount charged.",
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
    sodRuleIds: ["rule-collect-post", "rule-cash-rec"],
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
    sodRuleIds: ["rule-vendor-create-pay", "rule-admin-pay"],
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
    detection: "by-accident",
    resolvedYear: 2018,
    sodRuleIds: ["rule-admin-pay", "rule-cash-rec"],
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
    sodRuleIds: ["rule-cash-rec", "rule-admin-pay"],
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
    detection: "unknown",
    resolvedYear: 2024,
    sodRuleIds: ["rule-admin-pay"],
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
      "Jodi Hamrick was sentenced in April 2024 to three years after a jury trial; co-owner David M. Gluth was sentenced separately. The release states the loss as more than $400,000. This is a collusion case: two people, one of them an owner, defeated every control that depended on one person checking another.",
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
    detection: "unknown",
    resolvedYear: 2025,
    sodRuleIds: ["rule-payroll", "rule-admin-pay", "rule-collect-post"],
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
      "Jennifer Lynn Horton, 49, was sentenced in January 2025 to 30 months after pleading guilty to two counts of wire fraud, with a $1 million judgment and forfeiture of four vehicles. The release states the loss as more than $1 million; the salary and payroll figures are the release's.",
  },
];
