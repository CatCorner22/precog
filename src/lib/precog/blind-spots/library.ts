/**
 * Blind spots: obligations and traps an owner-run business meets for the
 * first time after something has already gone wrong. Each entry names the
 * trap in plain words, one question the owner can answer today, what to do,
 * and the public source behind it. Rules of thumb that depend on state law
 * carry `region` and name the state they were checked against.
 */
import type { IndustryId } from "../industry";

/** Why the trap matters, ordered worst first. Mirrors the triage gates. */
export type BlindSpotTier = "personal" | "money" | "operate" | "fine";

export const TIER_ORDER: readonly BlindSpotTier[] = ["personal", "money", "operate", "fine"];

export const TIER_WORDS: Record<BlindSpotTier, { label: string; detail: string }> = {
  personal: {
    label: "You pay personally",
    detail: "The company's shield does not cover these. The owner or manager pays.",
  },
  money: {
    label: "Money that does not come back",
    detail: "Past a short window the bank, the insurer or the law stops helping.",
  },
  operate: {
    label: "The doors stay closed",
    detail: "One lapse and the business cannot trade, bank or reach its customers.",
  },
  fine: {
    label: "Fines and penalties",
    detail: "Paperwork nobody mentioned until the letter came.",
  },
};

export interface BlindSpotSource {
  label: string;
  url: string;
}

export interface BlindSpot {
  id: string;
  tier: BlindSpotTier;
  title: string;
  /** What goes wrong, in two sentences or fewer. */
  why: string;
  /** One question the owner can answer yes or no today. */
  check: string;
  /** What to do, each a short imperative. */
  fix: readonly string[];
  sources: readonly BlindSpotSource[];
  /** Only these lines of business see it; absent = every business. */
  industries?: readonly IndustryId[];
  /** Shown only from this many people on payroll. */
  minHeadcount?: number;
  /** The state whose rule the entry quotes. Federal rules carry none. */
  region?: "Tennessee";
}

export const BLIND_SPOTS: readonly BlindSpot[] = [
  {
    id: "payroll-trust-fund",
    tier: "personal",
    title: "Withheld payroll tax is the government's money, and you owe it personally",
    why: "The IRS assesses the full unpaid amount against any person who decided what got paid, and paying other bills first counts as willful. Hiring a payroll service does not move that liability.",
    check:
      "Does someone other than the payroll provider confirm each payroll tax deposit in EFTPS?",
    fix: [
      "Open your own EFTPS account and check the deposits after every payroll.",
      "Keep the IRS address of record at the business, not at the provider.",
      "If cash is short, pay the payroll tax deposit before any supplier.",
    ],
    sources: [
      {
        label: "IRS, Employment taxes and the trust fund recovery penalty",
        url: "https://www.irs.gov/businesses/small-businesses-self-employed/employment-taxes-and-the-trust-fund-recovery-penalty-tfrp",
      },
      {
        label: "IRS, Outsourcing payroll duties",
        url: "https://www.irs.gov/businesses/small-businesses-self-employed/outsourcing-payroll-duties",
      },
    ],
  },
  {
    id: "retirement-deposits",
    tier: "personal",
    title: "Late 401(k) deposits are a prohibited transaction, not a late bill",
    why: "Employee deferrals must reach the plan as soon as they can be separated from company money; small plans get seven business days. Later than that is a prohibited transaction with an excise tax, and the plan needs a fidelity bond of at least 10 percent of its assets.",
    check:
      "Do the deferrals from each payroll reach the plan within seven business days, and does the plan carry its fidelity bond?",
    fix: [
      "Compare the payroll date with the plan deposit date for the last three payrolls.",
      "Ask the plan provider for the bond certificate and its amount.",
    ],
    sources: [
      {
        label: "IRS, 401(k) plan fix-it guide: deferrals not deposited on time",
        url: "https://www.irs.gov/retirement-plans/401k-plan-fix-it-guide-you-havent-timely-deposited-employee-elective-deferrals",
      },
      {
        label: "29 CFR 2580.412-12, amount of the bond",
        url: "https://www.law.cornell.edu/cfr/text/29/2580.412-12",
      },
    ],
    minHeadcount: 5,
  },
  {
    id: "personal-guarantees",
    tier: "personal",
    title: "A supplier credit application can make you the guarantor",
    why: "Many trade credit forms, leases and card agreements carry a personal guarantee above the signature line. The company's limited liability does not apply to a debt you guaranteed.",
    check: "Do you know every agreement the owner has signed as a personal guarantor?",
    fix: [
      "List every credit application, lease and card agreement and read the paragraph above the signature.",
      "Sign new ones with your title only, and strike guarantee language before signing.",
    ],
    sources: [
      {
        label: "Patterson Bray, Signing a credit application can create personal liability",
        url: "https://pattersonbray.com/small-business-credit-application/",
      },
    ],
  },
  {
    id: "cash-reporting",
    tier: "personal",
    title: "Cash over $10,000 has a form, and splitting it is a crime",
    why: "Form 8300 is due within 15 days of receiving more than $10,000 in cash, including related payments, with a yearly statement to the customer. Breaking deposits into smaller amounts to avoid a report is structuring, and the IRS has seized accounts for the pattern alone.",
    check:
      "Does the person who takes large cash payments know the $10,000 rule and who files Form 8300?",
    fix: [
      "Write the rule into the cash-receipt procedure and name the filer.",
      "Deposit cash as it comes in; never shape a deposit to stay under $10,000.",
    ],
    sources: [
      {
        label: "IRS, Form 8300 reference guide",
        url: "https://www.irs.gov/businesses/small-businesses-self-employed/irs-form-8300-reference-guide",
      },
      {
        label: "Institute for Justice, Seize first, question later",
        url: "https://ij.org/report/seize-first-question-later/",
      },
    ],
    industries: ["automotive", "retail", "construction", "general", "professional_services"],
  },
  {
    id: "sales-tax-responsible-person",
    tier: "personal",
    title: "Unpaid sales tax follows the people who ran the business",
    why: "Tennessee assesses officers, members and managers personally for sales tax the business collected and did not remit.",
    check:
      "Does someone compare the sales tax collected in the system with the amount remitted each month?",
    fix: [
      "Tie the return to the system's tax-collected report before filing.",
      "Keep the sales tax account in the owner's name with the owner's email.",
    ],
    sources: [
      {
        label:
          "Tennessee Department of Revenue, How individuals become responsible for a business's taxes",
        url: "https://revenue.support.tn.gov/hc/en-us/articles/10823490752660-CS-Responsible-Parties-2-How-Individuals-Become-Responsible-for-a-Business-s-Taxes-Personal",
      },
    ],
    industries: ["retail", "restaurant", "automotive", "construction", "general"],
    region: "Tennessee",
  },
  {
    id: "bank-statement-window",
    tier: "money",
    title: "Business accounts get days, not months, to dispute a bad payment",
    why: "Consumer protections for unauthorized transfers cover personal accounts only. A business must report a forged check or bad ACH debit within the window in its account agreement, often two banking days for ACH and 30 to 60 days for checks, or the bank keeps the loss on the business.",
    check:
      "Does someone read every bank statement and online activity within a week of month end, and do you know your account agreement's reporting window?",
    fix: [
      "Find the reporting deadline in the account agreement and write it on the reconciliation procedure.",
      "Turn on daily balance and transaction alerts to a second phone.",
      "Ask the bank for ACH debit blocks or filters on the operating account.",
    ],
    sources: [
      {
        label: "UCC 4-406, customer's duty to discover unauthorized items",
        url: "https://www.law.cornell.edu/ucc/4/4-406",
      },
      {
        label: "12 CFR 1005.2, Regulation E covers consumer accounts",
        url: "https://www.law.cornell.edu/cfr/text/12/1005.2",
      },
    ],
  },
  {
    id: "instant-payments-final",
    tier: "money",
    title: "Wires and Zelle are final the moment they leave",
    why: "There is no chargeback on a wire or a Zelle payment to an enrolled recipient. A payment sent to the wrong account on a convincing email is gone.",
    check:
      "Is every wire and instant payment capped, and does a second person confirm the destination by phone before release?",
    fix: [
      "Set a per-payment limit at the bank that needs a second approver above it.",
      "Confirm any new or changed account with a phone number you already had.",
    ],
    sources: [
      {
        label: "Zelle, Can I reverse a payment?",
        url: "https://www.zelle.com/faq/can-i-reverse-zeller-payment",
      },
    ],
  },
  {
    id: "deposit-insurance",
    tier: "money",
    title: "Deposit insurance stops at $250,000 per bank, all accounts added together",
    why: "A company's checking, savings and payroll accounts at one bank are insured as one $250,000 total. A sole proprietor's business deposits are added to the owner's personal ones.",
    check: "Do your balances at any one bank ever pass $250,000 around payroll or tax time?",
    fix: [
      "Check the peak balance in the last twelve months.",
      "Spread balances across banks or ask about a sweep or reciprocal deposit program.",
    ],
    sources: [
      {
        label: "FDIC, Your business, your deposits",
        url: "https://www.fdic.gov/consumer-resource-center/2024-05/your-business-your-deposits",
      },
    ],
  },
  {
    id: "mailed-checks",
    tier: "money",
    title: "Mailed checks are being stolen, washed and cashed",
    why: "FinCEN reports a surge in check fraud from mail theft. A check altered after it leaves your hands clears against your account, and the dispute window above applies.",
    check:
      "Have you stopped mailing checks where an ACH or card payment would do, and do you use positive pay on the rest?",
    fix: [
      "Move recurring suppliers to ACH or card.",
      "Ask the bank about positive pay; hand-deliver or drop checks inside the post office.",
    ],
    sources: [
      {
        label: "FinCEN, analysis of check fraud related to mail theft",
        url: "https://www.fincen.gov/news/news-releases/fincen-issues-depth-analysis-check-fraud-related-mail-theft",
      },
    ],
  },
  {
    id: "insurance-fine-print",
    tier: "money",
    title: "Your policy was written around the loss you fear",
    why: "Crime policies cover a payment tricked out of staff only by endorsement, usually with a small sublimit. A cyber insurer voided a policy over a wrong answer about multi-factor sign-in. Business interruption needs physical damage, and an employee's own car on a work errand is a gap without hired and non-owned auto cover.",
    check:
      "Have you read the social engineering sublimit, the cyber application answers, and the auto and interruption triggers with your agent in the last year?",
    fix: [
      "Ask the agent in writing: what is the social engineering limit, and is the multi-factor answer on the cyber application still true?",
      "Add hired and non-owned auto if anyone drives their own car for work.",
    ],
    sources: [
      {
        label:
          "Insurance Journal, Travelers and policyholder void cyber policy over multi-factor answers",
        url: "https://www.insurancejournal.com/news/national/2022/08/30/682564.htm",
      },
      {
        label: "Iowa Supreme Court, business interruption needs direct physical loss",
        url: "https://www.iowacourts.gov/courtcases/14882/embed/SupremeCourtOpinion",
      },
      {
        label: "Chubb, Social engineering fraud coverage",
        url: "https://www.chubb.com/us-en/business-insurance/social-engineering-fraud-coverage-for-crime-insurance.html",
      },
    ],
  },
  {
    id: "auto-renew-contracts",
    tier: "money",
    title: "The copier, alarm and software contracts renew themselves",
    why: "Equipment leases and service contracts often renew for a full term unless written notice arrives inside a window, typically 90 to 180 days before the end date. Miss it and you pay for years you did not want.",
    check: "Do you have a list of every contract with its end date and its notice window?",
    fix: [
      "List the contracts and read each one for the words automatic, evergreen or renewal.",
      "Put the first day of each notice window on the shared calendar, not the end date.",
    ],
    sources: [
      {
        label: "Xerox New England, the evergreen clause in copier leases",
        url: "https://www.xeroxne.com/answers/evergreen-copier-lease-clause",
      },
    ],
  },
  {
    id: "subcontractor-certificates",
    tier: "money",
    title: "An uninsured subcontractor becomes your payroll at audit",
    why: "Workers' compensation premium audits charge the general contractor for every subcontractor who cannot show a certificate of insurance, and an injured uninsured sub's claim lands on your policy.",
    check:
      "Is a current certificate of insurance on file for every subcontractor before their first payment?",
    fix: [
      "Make the certificate a condition of the first payment, with the expiry date on the vendor record.",
      "Re-collect certificates before the policy audit.",
    ],
    sources: [
      {
        label:
          "Georgia Office of Insurance, verify workers' compensation coverage and avoid audit surprises",
        url: "https://oci.georgia.gov/insurance-resources/business/how-verify-workers-compensation-coverage-and-avoid-audit-surprises",
      },
    ],
    industries: ["construction"],
  },
  {
    id: "digital-keys",
    tier: "operate",
    title: "Someone else may hold the keys to your domain, email and listing",
    why: "The web designer who registered the domain, the former manager who was the only email super admin, or the agency that owns the Google Business Profile can lock the business out of its own name, mail and phone calls. Recovery goes through whoever controls the DNS records.",
    check:
      "Is the domain, the DNS, the email admin role and the business listing in an account the owner controls, with a second owner named?",
    fix: [
      "Look up the domain's registrant and move it to an owner account with two-factor sign-in.",
      "Make a second person super admin for email and a second owner on the business listing.",
      "Add these to the leaver access checklist.",
    ],
    sources: [
      {
        label: "Google Workspace, recovering administrator access",
        url: "https://knowledge.workspace.google.com/admin/users/recovering-administrator-access-to-your-account",
      },
      {
        label: "Google Business Profile, owners, managers and third parties",
        url: "https://support.google.com/business/answer/7353941?hl=en",
      },
    ],
  },
  {
    id: "owner-incapacity",
    tier: "operate",
    title: "If the only signer is in the hospital, nobody gets paid",
    why: "A bank freezes an account whose sole signer has died until a court or the operating agreement names a successor. A personal power of attorney usually does not reach the business accounts, the payroll sign-in or the lease.",
    check: "Can a named second person sign payroll and pay the rent on Monday if the owner cannot?",
    fix: [
      "Add a second signer at the bank and a second admin on payroll.",
      "Put a successor manager and an incapacity clause in the operating agreement.",
      "Record where the passwords, keys and insurance policies live.",
    ],
    sources: [
      {
        label: "Escondido Probate Law, who pays payroll if the sole signer dies",
        url: "https://escondidoprobatelaw.com/who-pays-payroll-if-the-sole-signer-dies/",
      },
    ],
  },
  {
    id: "annual-report",
    tier: "operate",
    title: "Skip the annual report and the state dissolves the company",
    why: "A Tennessee LLC's annual report is due the first day of the fourth month after its fiscal year ends. Miss it and the state administratively dissolves the company, which can void contracts, block lawsuits and expose owners until it is reinstated.",
    check: "Do you know the annual report due date and who files it?",
    fix: [
      "Put the due date on the shared calendar and name a second filer.",
      "Keep the registered agent address current so the notice reaches you.",
    ],
    sources: [
      {
        label: "Tenn. Code 48-249-1017, annual report",
        url: "https://law.justia.com/codes/tennessee/title-48/limited-liability-companies/chapter-249/part-10/section-48-249-1017/",
      },
      {
        label: "Tennessee Secretary of State, business FAQs",
        url: "https://sos.tn.gov/businesses/faqs",
      },
    ],
    region: "Tennessee",
  },
  {
    id: "dea-renewal",
    tier: "operate",
    title: "The DEA registration lapses every three years",
    why: "A dentist who prescribes controlled substances renews DEA registration every three years, and the renewal notice goes to the address on file. Without it, no controlled prescriptions.",
    check:
      "Is the DEA renewal date and the address on file written down where a second person can see it?",
    fix: [
      "Put the renewal date on the shared calendar 90 days early.",
      "Check the address on the DEA record after any move.",
    ],
    sources: [
      {
        label: "DEA, Practitioner's manual",
        url: "https://www.deadiversion.usdoj.gov/GDP/%28DEA-DC-071%29%28EO-DEA226%29_Practitioner%27s_Manual_%28final%29.pdf",
      },
    ],
    industries: ["dental"],
  },
  {
    id: "nonprofit-filings",
    tier: "operate",
    title: "Three missed 990s and the exemption is gone",
    why: "The IRS automatically revokes tax-exempt status after three consecutive unfiled returns, even the short 990-N. Tennessee also requires registration before soliciting, and donors lose their deduction without a written acknowledgment for gifts of $250 or more.",
    check:
      "Were the last three 990s filed, is the state registration current, and does every gift of $250 or more get a dated acknowledgment?",
    fix: [
      "Look the organization up on the IRS tax-exempt search and note the last filing.",
      "Calendar the 990 and the state renewal; make acknowledgments part of the gift-entry procedure.",
    ],
    sources: [
      {
        label: "IRS, Automatic revocation of exemption",
        url: "https://www.irs.gov/charities-non-profits/automatic-revocation-of-exemption",
      },
      {
        label: "IRS, Charitable contributions: written acknowledgments",
        url: "https://www.irs.gov/charities-non-profits/charitable-organizations/charitable-contributions-written-acknowledgments",
      },
      {
        label: "Tennessee Secretary of State, charities FAQs",
        url: "https://sos.tn.gov/charities/faqs",
      },
    ],
    industries: ["nonprofit"],
  },
  {
    id: "headcount-thresholds",
    tier: "fine",
    title: "Each hire can switch on a law nobody told you about",
    why: "Federal and state employment laws switch on at fixed head counts: workers' compensation, OSHA injury logs, discrimination statutes, COBRA, family leave. The count that matters is the one on payroll, including part-timers.",
    check: "Do you know which threshold your next hire crosses?",
    fix: [
      "Compare the thresholds below with your head count before each hire.",
      "Ask your payroll provider or an employment lawyer about the ones within two hires.",
    ],
    sources: [
      {
        label:
          "OSHA, recordkeeping tutorial (10 or fewer employees exempt; 300A posted February 1 to April 30)",
        url: "https://www.osha.gov/sites/default/files/osha_rktutorial.pdf",
      },
      {
        label: "Tennessee Bureau of Workers' Compensation, who must carry insurance",
        url: "https://lwdsupport.tn.gov/hc/en-us/articles/204304628-How-many-employees-do-I-have-to-have-before-I-am-required-to-have-workers-compensation-insurance",
      },
      {
        label: "Baker Donelson, federal employment law thresholds by employer size",
        url: "https://www.bakerdonelson.com/easy-guide-federal",
      },
    ],
  },
  {
    id: "tipped-reporting",
    tier: "fine",
    title: "More than ten employees means a tip return, and the tip credit needs notice",
    why: "A food or drink business that normally has more than ten employees files Form 8027 every year. Taking the tip credit requires telling each tipped employee in advance; without notice the credit is lost and back wages are owed.",
    check:
      "Was Form 8027 filed last year, and does every tipped hire get the tip credit notice in writing?",
    fix: [
      "Add the tip credit notice to the new-hire packet.",
      "Put Form 8027 on the yearly calendar beside the W-2s.",
    ],
    sources: [
      {
        label: "IRS, Instructions for Form 8027",
        url: "https://www.irs.gov/pub/irs-pdf/i8027.pdf",
      },
      {
        label: "DOL Fact Sheet 15, tipped employees under the FLSA",
        url: "https://www.dol.gov/agencies/whd/fact-sheets/15-tipped-employees-flsa",
      },
    ],
    industries: ["restaurant"],
    minHeadcount: 8,
  },
  {
    id: "worker-classification",
    tier: "fine",
    title: "Calling someone a contractor or salaried does not make it so",
    why: "A worker you direct is an employee however the contract reads, and the business owes back wages, liquidated damages and payroll taxes when that is found. A salaried title alone does not remove overtime: the federal floor is $684 a week.",
    check:
      "Has each contractor and each salaried-exempt person been checked against the tests in the last year?",
    fix: [
      "List everyone paid on a 1099 and everyone salaried under $35,568 and review each against the DOL guides.",
      "Convert the doubtful ones before an audit or a claim does it for you.",
    ],
    sources: [
      {
        label: "DOL, misclassification small entity compliance guide",
        url: "https://www.dol.gov/agencies/whd/flsa/misclassification/small-entity-compliance-guide",
      },
      {
        label: "DOL, overtime salary levels",
        url: "https://www.dol.gov/agencies/whd/overtime/salary-levels",
      },
    ],
  },
  {
    id: "i9-retention",
    tier: "fine",
    title: "Every missing I-9 is a fine, years after the person left",
    why: "An I-9 is kept three years after hire or one year after the person leaves, whichever is later, and inspectors fine per missing or incomplete form.",
    check:
      "Is there a complete I-9 for everyone hired in the last three years, including the ones who left?",
    fix: [
      "Pull the I-9 file against the payroll roster once a year.",
      "Add the I-9 to the leaver checklist with its destroy-after date.",
    ],
    sources: [
      {
        label: "USCIS, retaining Form I-9",
        url: "https://www.uscis.gov/i-9-central/form-i-9-resources/handbook-for-employers-m-274/100-retaining-form-i-9",
      },
    ],
  },
  {
    id: "final-pay",
    tier: "fine",
    title: "Final wages have a deadline of their own",
    why: "In Tennessee, a person who leaves or is let go is paid in full by the next regular payday or within 21 days, whichever is later, whatever the dispute.",
    check: "Does the leaver procedure name the final pay date?",
    fix: ["Add the final pay date to the leaver checklist and let payroll know the same day."],
    sources: [
      {
        label: "Tenn. Code 50-2-103(g), payment of wages on separation",
        url: "https://law.justia.com/codes/tennessee/title-50/chapter-2/part-1/section-50-2-103/",
      },
    ],
    region: "Tennessee",
  },
  {
    id: "breach-notice",
    tier: "fine",
    title: "A lost laptop starts a 45-day clock",
    why: "Tennessee requires notice to every affected person within 45 days of discovering a breach of unencrypted personal data. Dealers and tax preparers also owe the FTC a written security program with a named person in charge.",
    check:
      "Is every laptop and phone with customer data encrypted, and is there a named person who starts the clock?",
    fix: [
      "Turn on device encryption everywhere customer data lives.",
      "Write a one-page breach plan naming who calls the lawyer, the insurer and the customers.",
    ],
    sources: [
      {
        label: "Tenn. Code 47-18-2107, release of personal consumer information",
        url: "https://law.justia.com/codes/tennessee/title-47/chapter-18/part-21/section-47-18-2107/",
      },
      {
        label: "FTC Safeguards Rule, standards for safeguarding customer information",
        url: "https://www.federalregister.gov/documents/2021/12/09/2021-25736/standards-for-safeguarding-customer-information",
      },
    ],
    region: "Tennessee",
  },
  {
    id: "unclaimed-property",
    tier: "fine",
    title: "Uncashed paychecks and old customer credits belong to the state",
    why: "After the dormancy period, uncashed payroll checks, customer deposits, refunds and gift card balances are reported and sent to the state, with due diligence letters first. Tennessee's report is due November 1 every year, and audits reach back years.",
    check: "Does someone review stale uncashed checks and old customer credits once a year?",
    fix: [
      "Pull outstanding checks older than a year and credits older than three from the books.",
      "Send the letters and file by November 1.",
    ],
    sources: [
      {
        label: "Tennessee Treasury, unclaimed property reporting guide",
        url: "https://treasury.tn.gov/Portals/0/Documents/Unclaimed%20Property/Reporting/TNReporting-CompleteReportingGuide.pdf",
      },
    ],
    region: "Tennessee",
  },
  {
    id: "property-schedule",
    tier: "fine",
    title: "The county taxes your desks and tools, and guesses if you do not file",
    why: "Tennessee businesses file a tangible personal property schedule with the county assessor by March 1. An unfiled schedule gets a forced assessment that is usually higher than the real figure.",
    check: "Was the personal property schedule filed by March 1 this year?",
    fix: ["Put March 1 on the yearly calendar beside the 1099s and name the filer."],
    sources: [
      {
        label: "Tennessee Comptroller, tangible personal property",
        url: "https://comptroller.tn.gov/office-functions/pa/property-taxes/tangible-personal-property.html",
      },
    ],
    region: "Tennessee",
  },
];

/** Head counts at which a federal or Tennessee employer rule switches on. */
export interface HeadcountThreshold {
  at: number;
  rule: string;
  region?: "Tennessee";
  /** Only these lines of business meet it; absent = every business. */
  industries?: readonly IndustryId[];
}

export const HEADCOUNT_THRESHOLDS: readonly HeadcountThreshold[] = [
  {
    at: 1,
    rule: "Workers' compensation for every construction employer",
    region: "Tennessee",
    industries: ["construction"],
  },
  { at: 5, rule: "Workers' compensation insurance", region: "Tennessee" },
  { at: 8, rule: "Tennessee Human Rights Act", region: "Tennessee" },
  { at: 11, rule: "OSHA injury log and the 300A posted February 1 to April 30" },
  { at: 15, rule: "Title VII and the Americans with Disabilities Act" },
  { at: 20, rule: "Age discrimination (ADEA) and COBRA continuation" },
  { at: 50, rule: "Family and Medical Leave Act and the ACA employer mandate" },
];
