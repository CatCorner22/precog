/**
 * Curated knowledge corpus for Pioneer RAG.
 *
 * Every chunk declares what stands behind it. A chunk either restates a named
 * document a reader can open, or it is control practice written for this app
 * with no single document behind it. The two are typed differently so a
 * practice chunk can never wear a citation-shaped badge, and a chunk may point
 * at prosecuted cases in the evidence library that demonstrate what it says.
 * Nothing here is legal advice.
 */

import type { IndustryId } from "../industry";

export type ChunkBasis =
  | {
      kind: "cited";
      publisher: string;
      /** The document restated, as a reader would look it up. */
      document: string;
      url: string;
    }
  | {
      kind: "practice";
      /** What the guidance is and where its vocabulary comes from. */
      note: string;
    };

export interface KnowledgeChunk {
  id: string;
  title: string;
  domain:
    | "coso"
    | "sod"
    | "lean"
    | "dental_ops"
    | "retail_ops"
    | "restaurant_ops"
    | "services_ops"
    | "fraud"
    | "insurance"
    | "continuity"
    | "ai_governance"
    | "cybersecurity"
    | "privacy";
  tags: string[];
  text: string;
  source: string;
  /** Primary or authoritative reference used for the educational summary. */
  sourceUrl?: string;
  basis: ChunkBasis;
  /** Ids in CASE_LIBRARY (evidence/cases.ts) of prosecuted cases that demonstrate this chunk. */
  caseIds?: string[];
  /** When set, this chunk is boosted for the matching industry and demoted for others. */
  industry?: IndustryId;
}

const COSO_ICIF: ChunkBasis = {
  kind: "cited",
  publisher: "Committee of Sponsoring Organizations of the Treadway Commission",
  document: "Internal Control — Integrated Framework (2013)",
  url: "https://www.coso.org/guidance-on-ic",
};
const ACFE_RTTN: ChunkBasis = {
  kind: "cited",
  publisher: "Association of Certified Fraud Examiners",
  document: "Occupational Fraud 2026: A Report to the Nations",
  url: "https://www.acfe.com/fraud-resources/report-to-the-nations",
};
const NIST_AI_RMF: ChunkBasis = {
  kind: "cited",
  publisher: "National Institute of Standards and Technology",
  document: "AI Risk Management Framework (AI RMF 1.0)",
  url: "https://www.nist.gov/itl/ai-risk-management-framework",
};
const practice = (note: string): ChunkBasis => ({ kind: "practice", note });

/** One-line description of what stands behind a chunk, for tool results and briefs. */
export function describeChunkBasis(chunk: KnowledgeChunk): string {
  const b = chunk.basis;
  const cases = chunk.caseIds?.length
    ? ` Demonstrated by ${chunk.caseIds.length} prosecuted ${chunk.caseIds.length === 1 ? "case" : "cases"} in the evidence library: ${chunk.caseIds.join(", ")}.`
    : "";
  return b.kind === "cited"
    ? `Restates ${b.document} (${b.publisher}), ${b.url}.${cases}`
    : `Practitioner guidance written for this app, with no single document behind it. ${b.note}${cases}`;
}

export const KNOWLEDGE_CORPUS: KnowledgeChunk[] = [
  {
    id: "coso-5-components",
    title: "COSO five components",
    domain: "coso",
    tags: ["coso", "control environment", "monitoring", "risk assessment"],
    text: "COSO Internal Control — Integrated Framework has five components: Control Environment, Risk Assessment, Control Activities, Information & Communication, and Monitoring Activities. Reasonable assurance means residual risk is reduced to an acceptable level, not eliminated. Small dental practices still own all five components; compensating controls and owner monitoring substitute for full segregation of duties.",
    basis: COSO_ICIF,
  },
  {
    id: "coso-control-activities",
    title: "Control activities for small teams",
    domain: "coso",
    tags: ["control activities", "sod", "approvals", "reconciliations"],
    text: "Control activities in the COSO framework include authorizations, verifications, reconciliations, physical controls, and segregation of duties. Where a small entity cannot separate every duty, the framework's answer is management oversight and compensating controls. In practice for a small business that means dual signatures, independent bank reconciliation by the owner, exception reports, and documented residual-risk acceptance with review dates.",
    basis: COSO_ICIF,
  },
  {
    id: "coso-monitoring",
    title: "Monitoring activities",
    domain: "coso",
    tags: ["monitoring", "ongoing", "separate evaluations"],
    text: "The COSO framework describes monitoring as ongoing (built into daily and weekly work) or as separate evaluations (periodic deep dives). In practice for a small business: weekly owner bank-reconciliation review, monthly write-off aging, and quarterly vendor-master review. Undocumented monitoring does not count.",
    basis: COSO_ICIF,
  },
  {
    id: "sod-three-way",
    title: "Classic segregation of duties",
    domain: "sod",
    tags: ["sod", "custody", "authorization", "recording"],
    text: "Classic SoD separates custody of assets, authorization of transactions, and recording in the books. In a 4–8 person dental office these roles often collide. Minimum viable compensating pattern: person who posts payments does not reconcile the bank; person who can write off AR does not solely control deposits; vendor setup requires second approval or owner review.",
    basis: practice(
      "Standard segregation-of-duties doctrine as applied to a four-to-eight-person office.",
    ),
  },
  {
    id: "sod-dental-cash",
    title: "Dental cash and patient payment path",
    domain: "dental_ops",
    industry: "dental",
    tags: ["cash", "deposits", "front desk", "payments"],
    text: "High-risk dental cash path: collect patient payments, void or adjust charges, prepare the deposit, post to the practice-management system, and reconcile the bank. One person both receiving payments and recording them is the pattern behind two prosecuted dental cases in this library. Dual control on deposit bags, camera coverage of the cash drawer, and owner-only bank reconciliation each remove one step a single person can take alone.",
    basis: practice("Dental front-desk cash-handling practice."),
    caseIds: ["case-boston-dental", "case-houston-dental-shell"],
  },
  {
    id: "fraud-triangle",
    title: "Fraud triangle and opportunity",
    domain: "fraud",
    tags: ["fraud", "opportunity", "pressure", "rationalization"],
    text: "The fraud triangle is pressure, opportunity, and rationalization. Controls act on opportunity (segregation of duties, dual control, monitoring); a business cannot see pressure or rationalization from the outside. Trust in a person does not shrink opportunity, because opportunity is a property of how work is divided, not of character. Benchmarks about occupational fraud describe populations, never any employee.",
    basis: practice(
      "Summary of the fraud triangle, a concept from Donald R. Cressey, Other People's Money (1953). The application to small businesses is this app's.",
    ),
  },
  {
    id: "fraud-detection-lag",
    title: "Detection lag multiplies loss",
    domain: "fraud",
    tags: ["detection", "timeline", "embezzlement", "bank rec"],
    text: "The ACFE's Occupational Fraud 2026: A Report to the Nations puts the median time from the start of a scheme to its discovery at twelve months. Schemes caught within six months had a median loss of $40,000; those that ran more than five years, more than $1.1 million. Independent bank reconciliation and surprise cash counts are detection controls that shorten that window. Cameras help after the fact but do not replace reconciliation.",
    basis: ACFE_RTTN,
  },
  {
    id: "lean-muda-dental",
    title: "Lean muda in dental ops",
    domain: "lean",
    industry: "dental",
    tags: ["lean", "tps", "muda", "waste", "denials"],
    text: "Toyota Production System waste (muda) in dental offices includes rework on insurance claims, waiting for chair turnover, over-processing chart notes, and defects in coding that cause denials. Denial rework is both operational waste and a control risk if write-offs hide unauthorized adjustments. Value-stream map from claim submission to payment.",
    basis: practice("Lean (Toyota Production System) vocabulary applied to office administration."),
  },
  {
    id: "lean-mura-muri",
    title: "Mura and muri in staffing",
    domain: "lean",
    tags: ["mura", "muri", "unevenness", "overburden", "staffing"],
    text: "Mura (unevenness) appears when one person owns all billing knowledge and others idle or thrash. Muri (overburden) appears when the office manager carries all SoD roles. Cross-training reduces both waste and knowledge single points of failure.",
    basis: practice("Lean (Toyota Production System) vocabulary applied to staffing."),
  },
  {
    id: "continuity-spof",
    title: "Knowledge single points of failure",
    domain: "continuity",
    tags: ["spof", "cross-training", "continuity", "tribal knowledge"],
    text: "Critical knowledge with one expert owner is a continuity and control risk. If the sole expert can also authorize write-offs or vendor changes, process failure and fraud opportunity combine. Document procedures, cross-train a backup, and re-score residual risk after any key person leave.",
    basis: practice("Business-continuity practice for small teams."),
  },
  {
    id: "insurance-transfer",
    title: "Insurance transfer vs control design",
    domain: "insurance",
    tags: ["insurance", "deductible", "premium", "employee dishonesty"],
    text: "Employee dishonesty / crime coverage transfers some residual financial risk but does not fix process design. Deductible sets retained floor; policy limit caps recovery; control credits (cameras, dual control, bank rec) may reduce premium. Annual cost of risk ≈ net premium + annualized expected retained loss. Raising deductible without improving detection often increases owner residual.",
    basis: practice(
      "Description of how crime-coverage terms interact with control design. Not any carrier's terms.",
    ),
  },
  {
    id: "ai-shadow-ai",
    title: "Shadow AI and model risk for practices",
    domain: "ai_governance",
    tags: ["ai", "shadow ai", "phi", "model risk", "nist"],
    text: "Small practices adopting AI for notes, coding, or chatbots face model risk, PHI leakage, and shadow AI (uncontrolled tools). NIST's AI Risk Management Framework organizes the response as Govern, Map, Measure, and Manage. In practice for a small business: keep an inventory of AI use cases, never paste PHI into unapproved tools, and require human review for financially relevant outputs such as write-offs and claim-coding overrides.",
    basis: NIST_AI_RMF,
  },
  {
    id: "residual-appetite",
    title: "Residual risk appetite language",
    domain: "coso",
    tags: ["residual", "appetite", "accept", "remediate"],
    text: "Owners may accept residual risk deliberately when cost of further control exceeds benefit, but acceptance must be explicit, dated, and re-reviewed after staff or insurance changes. 'We trust our team' without monitoring is not residual acceptance — it is unmeasured residual.",
    basis: practice("Risk-acceptance practice; the wording is this app's."),
  },
  {
    id: "dental-writeoffs",
    title: "Write-off and adjustment controls",
    domain: "dental_ops",
    industry: "dental",
    tags: ["write-off", "adjustments", "ar", "pms"],
    text: "An unauthorized write-off or adjustment erases a balance that was actually paid, so the cash can leave while the books still balance. Controls: reason codes required, a threshold above which the doctor or owner approves, monthly aging of adjustments, and no one both adjusting balances and posting payments without a compensating review.",
    basis: practice("Dental revenue-cycle control practice."),
  },
  {
    id: "vendor-master",
    title: "Vendor and AP risk",
    domain: "sod",
    tags: ["vendor", "ap", "payments", "fraud"],
    text: "Vendor-master fraud includes invented vendors and address changes that redirect payments to personal accounts. Separate vendor setup from payment release; require dual approval above a dollar threshold; review every new vendor monthly. When one person both sets up vendors and releases payments, an invented vendor is paid like any other; two prosecuted cases in this library ran on exactly that.",
    basis: practice("Accounts-payable control practice."),
    caseIds: ["case-dennys-franchise-vendors", "case-houston-dental-shell"],
  },
  {
    id: "leading-indicators",
    title: "Leading indicators of control failure",
    domain: "fraud",
    tags: ["leading indicators", "monitoring", "anomalies"],
    text: "Leading indicators include rising void/adjustment rates, delayed bank reconciliations, sole ownership of critical knowledge, overdue residual acceptance reviews, claims load factor increases, and sudden cash intensity spikes. Leading indicators beat lagging loss discovery.",
    basis: practice("Monitoring practice; the indicator list is this app's."),
  },

  // ---- Retail ----
  {
    id: "retail-shrink-sod",
    title: "Retail shrink and POS segregation",
    domain: "retail_ops",
    industry: "retail",
    tags: ["retail", "shrink", "pos", "returns", "sweethearting", "overrides"],
    text: "Retail shrink combines shoplifting, employee theft, and paperwork error. The employee-theft slice concentrates at the POS: no-receipt returns to a personal card, sweethearting (under-ringing friends), price overrides, and voided sales after cash is taken. Controls: manager-only override codes, daily exception report of voids/returns/overrides by cashier, receipt required for cash refunds, and camera coverage synced to POS timestamps.",
    basis: practice("Retail loss-prevention practice."),
  },
  {
    id: "retail-cash-drawer",
    title: "Cash drawer accountability",
    domain: "retail_ops",
    industry: "retail",
    tags: ["retail", "cash drawer", "deposit", "over short", "blind count"],
    text: "One cashier per drawer per shift, blind drop counts (the counter does not see the POS expected total), and a cash-over/short log by employee turn skimming into a visible pattern within weeks. The person who counts the drawer should not also prepare the deposit and post it to the books; if the team is too small, the owner reviews the deposit slip against the POS Z-report weekly.",
    basis: practice("Retail cash-handling practice."),
  },
  {
    id: "retail-inventory-receiving",
    title: "Receiving and inventory adjustments",
    domain: "retail_ops",
    industry: "retail",
    tags: ["retail", "inventory", "receiving", "cycle count", "purchase order", "adjustments"],
    text: "Receiving without a purchase-order match lets short shipments and phantom deliveries slide into cost of goods. Require three-way match (PO, packing slip, invoice) above a dollar threshold, second-person spot counts on high-value SKUs, and owner review of inventory adjustment reasons monthly. Large unexplained negative adjustments are a shrink and fraud leading indicator.",
    basis: practice("Retail receiving and inventory practice."),
  },
  {
    id: "retail-ecom-refunds",
    title: "E-commerce refund and chargeback path",
    domain: "retail_ops",
    industry: "retail",
    tags: ["retail", "ecommerce", "refunds", "chargebacks", "shopify", "platform admin"],
    text: "Online refunds are cash leaving without a physical return. Limit refund permissions to named users, require a return-received scan before refund release above a threshold, and reconcile platform payouts to the bank monthly. Platform admin rights (who can add staff, change payout accounts) belong to the owner only.",
    basis: practice("Online-retail refund and payout practice."),
  },

  // ---- Restaurant / hospitality ----
  {
    id: "restaurant-tips-cash",
    title: "Tip pooling and nightly cash close",
    domain: "restaurant_ops",
    industry: "restaurant",
    tags: ["restaurant", "tips", "tip pool", "cash out", "nightly close", "deposit", "z report"],
    text: "Restaurant cash leaks at the nightly close: cash tips paid out from the drawer, tip-pool math done by one person, and the deposit prepared by the same closer who runs the Z-report. Controls: a second person verifies the close sheet against the POS Z-report, tip-out calculations are printed and signed, safe drops are logged with two initials, and the owner compares deposits to POS totals weekly.",
    basis: practice("Restaurant cash-close practice."),
  },
  {
    id: "restaurant-voids-comps",
    title: "Voids, comps, and discounts",
    domain: "restaurant_ops",
    industry: "restaurant",
    tags: ["restaurant", "voids", "comps", "discounts", "manager code", "pos"],
    text: "Voids and comps are the restaurant equivalent of write-offs. A server who can void a paid ticket can pocket the cash. Require manager codes for voids after payment, a reason on every comp, and a nightly void/comp report by employee reviewed by the owner or GM. Rising void rates on one shift or server are a leading indicator, not an accusation.",
    basis: practice("Restaurant point-of-sale control practice."),
  },
  {
    id: "restaurant-liquor-variance",
    title: "Liquor variance and pour cost",
    domain: "restaurant_ops",
    industry: "restaurant",
    tags: ["restaurant", "bar", "liquor", "pour cost", "variance", "inventory"],
    text: "Liquor is high-value, easy to over-pour, and easy to give away. Weekly bar inventory compared to POS sales (usage vs. sold) produces a variance percentage; anything above a few percent deserves a look. Standard pour sizes, jiggers or measured pourers, and a bar manager who does not also close the bar drawer reduce residual risk.",
    basis: practice("Bar inventory practice."),
  },
  {
    id: "restaurant-vendor-ap",
    title: "Food vendor invoices and kickbacks",
    domain: "restaurant_ops",
    industry: "restaurant",
    tags: ["restaurant", "vendor", "food cost", "invoices", "kickback", "receiving"],
    text: "Food and beverage AP is high-volume and easy to pad: duplicate invoices, short deliveries billed in full, and vendor kickbacks to whoever places orders. Separate ordering from receiving from paying where possible; if not, the owner approves new vendors and reviews food-cost percentage weekly. A sudden food-cost jump with flat sales points at receiving or invoicing, not the menu.",
    basis: practice("Restaurant purchasing and payables practice."),
  },

  // ---- Professional services ----
  {
    id: "services-trust-account",
    title: "Client trust and retainer account handling",
    domain: "services_ops",
    industry: "professional_services",
    tags: [
      "professional services",
      "trust account",
      "iolta",
      "retainer",
      "commingling",
      "three-way reconciliation",
    ],
    text: "Client funds held in trust must never mix with operating cash. Monthly three-way reconciliation (bank statement, trust ledger, individual client balances) signed by a partner is the core control; disbursements require a second approval; and no single person should be able to move money from trust to operating without documented authority. Trust shortfalls are a license-level compliance problem, not just a loss.",
    basis: practice("Client-trust accounting practice for professional firms."),
  },
  {
    id: "services-billing-writeoffs",
    title: "Time billing, WIP, and write-downs",
    domain: "services_ops",
    industry: "professional_services",
    tags: ["professional services", "billing", "wip", "write-down", "realization", "invoice"],
    text: "Revenue leaks in services firms through unbilled time, silent write-downs, and invoices that never leave. Controls: monthly WIP aging review by the engagement partner, write-downs above a threshold approved by someone other than the biller, and realization rate tracked per client. The billing coordinator who can also apply client payments and issue credits needs an independent monthly review.",
    basis: practice("Professional-services revenue-cycle practice."),
  },
  {
    id: "services-expense-reimbursement",
    title: "Expense reports and reimbursement abuse",
    domain: "services_ops",
    industry: "professional_services",
    tags: ["professional services", "expenses", "reimbursement", "receipts", "corporate card"],
    text: "Expense reimbursement fraud is small per instance and large over years: duplicate submissions, personal purchases on the firm card, mileage padding. Require itemized receipts above a low threshold, partner approval for their own staff, and a quarterly sample review of card statements by someone outside the approval chain.",
    basis: practice("Expense-reimbursement control practice."),
  },
  {
    id: "services-engagement-scope",
    title: "Engagement letters and scope control",
    domain: "services_ops",
    industry: "professional_services",
    tags: ["professional services", "engagement letter", "scope creep", "change order", "margin"],
    text: "Scope creep is a revenue and quality risk: work delivered without a signed change order is often written off later. Require an engagement letter before time is charged, a change-order note for out-of-scope requests, and a monthly budget-vs-actual check per engagement.",
    basis: practice("Engagement-management practice for professional firms."),
  },

  // ---- General small business ----
  {
    id: "smb-bank-rec-owner",
    title: "Owner bank reconciliation habit",
    domain: "sod",
    industry: "general",
    tags: ["small business", "bank reconciliation", "owner review", "statements", "positive pay"],
    text: "Owner-first bank statement review breaks the loop in which the person who records payments is also the only one who sees the bank's record. Positive pay (the bank honors only checks you pre-authorize) and dual approval on ACH above a threshold each remove one more path a single person can use alone.",
    basis: practice("Owner-review practice for small businesses."),
    caseIds: ["case-amk-hvac", "case-bellingham-assistant-manager"],
  },
  {
    id: "smb-payroll-ghost",
    title: "Payroll ghost employees and rate changes",
    domain: "fraud",
    industry: "general",
    tags: ["small business", "payroll", "ghost employee", "rate change", "approval"],
    text: "Payroll fraud shows up as ghost employees, unapproved rate increases, and padded hours. Owner approves every new hire in the payroll system, reviews the payroll register total and headcount each cycle, and someone other than the payroll preparer reconciles payroll to the bank debit.",
    basis: practice("Payroll control practice."),
    caseIds: ["case-restaurant-franchisee-idaho", "case-florida-construction-payroll"],
  },
  {
    id: "coso-17-principles",
    title: "COSO principles and control effectiveness",
    domain: "coso",
    tags: ["coso", "17 principles", "design", "implementation", "operating effectiveness"],
    text: "COSO's five components are supported by 17 principles. An effective system requires the relevant principles to be present and functioning and the five components to operate together. A policy on paper is not enough: assess whether a control is suitably designed, placed in operation, and operating consistently, then retain evidence of review and remediation.",
    source: "COSO Internal Control—Integrated Framework",
    sourceUrl: "https://www.coso.org/internal-control",
  },
  {
    id: "green-book-documentation",
    title: "Document control design, execution, and corrective action",
    domain: "coso",
    tags: ["green book", "documentation", "evidence", "deficiency", "corrective action"],
    text: "The GAO Green Book organizes internal control into five components and 17 principles and emphasizes appropriate documentation. For a small practice, retain who performed and reviewed each key control, the date, exceptions found, evidence inspected, corrective owner, and due date. Escalate deficiencies based on impact and likelihood, and verify corrective actions rather than closing them on assertion alone.",
    source: "U.S. GAO Standards for Internal Control in the Federal Government (2025 Green Book)",
    sourceUrl: "https://www.gao.gov/products/gao-25-107721",
  },
  {
    id: "logical-access-leavers",
    title: "Logical access and workforce changes",
    domain: "cybersecurity",
    tags: ["access", "least privilege", "mfa", "termination", "pms", "banking", "audit log"],
    text: "Access control should follow least privilege and unique user identity. Avoid shared PMS, accounting, email, and banking credentials; require MFA where available; review privileged access periodically; and disable access promptly when duties or employment change. Preserve audit logs and review high-risk activity such as exports, vendor edits, refunds, write-offs, and permission changes.",
    source: "NIST Cybersecurity Framework 2.0",
    sourceUrl: "https://www.nist.gov/cyberframework",
  },
  {
    id: "hipaa-risk-analysis",
    title: "HIPAA security risk analysis and safeguards",
    domain: "privacy",
    tags: ["hipaa", "phi", "ephi", "risk analysis", "audit controls", "dental", "security"],
    text: "A dental practice handling electronic protected health information should perform an accurate and thorough risk analysis, implement reasonable and appropriate administrative, physical, and technical safeguards, and revisit the analysis when systems or operations change. Internal-control evidence should include system inventory, access decisions, security incidents, contingency procedures, and audit-control review. This educational summary is not a legal compliance determination.",
    source: "HHS HIPAA Security Rule risk-analysis guidance",
    sourceUrl: "https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html",
  },
  {
    id: "vendor-change-verification",
    title: "Verify vendor and payment instruction changes out of band",
    domain: "sod",
    tags: ["vendor", "bank change", "callback", "business email compromise", "payment"],
    text: "Treat changes to vendor banking, remittance addresses, and payment contacts as high-risk master-data events. Require approval independent of the requester and verify the change using a trusted phone number or contact already on file—not contact details supplied in the change request. Log the verification and hold first payment when risk indicators are present.",
    source: "FBI business email compromise prevention guidance",
    sourceUrl: "https://www.fbi.gov/how-we-can-help-you/scams-and-safety/common-scams-and-crimes/business-email-compromise",
  },
  {
    id: "refund-controls",
    title: "Patient refunds and credit-balance controls",
    domain: "dental_ops",
    tags: ["refund", "credit balance", "patient", "approval", "original payment"],
    text: "Patient refunds combine cash disbursement and account adjustment risk. Require a documented credit-balance basis, approval independent of preparation, pay back to the original payment method when feasible, prohibit the same person from creating a fictitious credit and releasing the refund, and reconcile the refund register to the ledger and bank activity.",
    source: "Healthcare revenue-cycle control practice (educational)",
  },
  {
    id: "backup-recovery-tests",
    title: "Backups require restoration tests",
    domain: "continuity",
    tags: ["backup", "restore", "ransomware", "continuity", "recovery", "immutable"],
    text: "A successful backup job is not proof of recoverability. Keep protected or offline copies for critical PMS, imaging, accounting, and configuration data; define recovery priorities and responsible owners; and test restoration on a schedule. Record recovery time, gaps, and remediation. Restrict deletion of backups from ordinary administrator credentials.",
    source: "NIST Cybersecurity Framework 2.0 recovery outcomes",
    sourceUrl: "https://www.nist.gov/cyberframework",
  },
  {
    id: "incident-response-escalation",
    title: "Incident response roles and escalation",
    domain: "cybersecurity",
    tags: ["incident response", "ransomware", "breach", "escalation", "communications"],
    text: "Define who can isolate systems, contact vendors and counsel, preserve evidence, communicate with patients, and authorize recovery before an incident. Maintain an offline contact list, decision thresholds, and a short exercise schedule. After an event, document lessons learned and update risk analysis, safeguards, and continuity plans.",
    source: "NIST Cybersecurity Framework 2.0 Respond and Recover functions",
    sourceUrl: "https://www.nist.gov/cyberframework",
  },
  {
    id: "payroll-change-controls",
    title: "Payroll master-file and off-cycle payment controls",
    domain: "sod",
    tags: ["payroll", "ghost employee", "direct deposit", "rate change", "off-cycle"],
    text: "Separate payroll master-file changes from payroll approval and funding. Independently review new workers, terminations, pay-rate changes, direct-deposit changes, bonuses, and off-cycle payments against authorized personnel records. Reconcile the payroll register to bank funding and the general ledger, investigate duplicate accounts or addresses, and retain approval evidence.",
    source: "Payroll internal-control practice (educational)",
  },
  {
    id: "system-change-management",
    title: "Control changes to financial and clinical systems",
    domain: "cybersecurity",
    tags: ["change management", "configuration", "pms", "accounting", "testing", "rollback"],
    text: "Changes to PMS, accounting, payment, interface, and security configurations can alter control behavior. Record the request and business reason, require appropriate approval, test high-risk changes away from production when feasible, preserve prior configuration or a rollback path, restrict production change access, and review emergency changes after implementation.",
    source: "NIST Cybersecurity Framework 2.0 Protect outcomes",
    sourceUrl: "https://www.nist.gov/cyberframework",
  },
  {
    id: "management-override",
    title: "Management override is a distinct control risk",
    domain: "fraud",
    tags: ["management override", "journal entry", "exception", "owner", "related party"],
    text: "Owner involvement can compensate for limited staffing, but it can also bypass ordinary controls. Treat manual journal entries, unusual write-offs, related-party vendors, threshold splitting, and after-hours overrides as reviewable exceptions. Preserve the business purpose, preparer, approver, evidence, and follow-up; use an independent CPA or other qualified reviewer where the owner is the transaction initiator.",
    source: "Internal-control and fraud-risk practice (educational)",
  },
  {
    id: "coso-17-principles",
    title: "COSO principles and control effectiveness",
    domain: "coso",
    tags: ["coso", "17 principles", "design", "implementation", "operating effectiveness"],
    text: "COSO's five components are supported by 17 principles. An effective system requires the relevant principles to be present and functioning and the five components to operate together. A policy on paper is not enough: assess whether a control is suitably designed, placed in operation, and operating consistently, then retain evidence of review and remediation.",
    source: "COSO Internal Control—Integrated Framework",
    sourceUrl: "https://www.coso.org/internal-control",
  },
  {
    id: "green-book-documentation",
    title: "Document control design, execution, and corrective action",
    domain: "coso",
    tags: ["green book", "documentation", "evidence", "deficiency", "corrective action"],
    text: "The GAO Green Book organizes internal control into five components and 17 principles and emphasizes appropriate documentation. For a small practice, retain who performed and reviewed each key control, the date, exceptions found, evidence inspected, corrective owner, and due date. Escalate deficiencies based on impact and likelihood, and verify corrective actions rather than closing them on assertion alone.",
    source: "U.S. GAO Standards for Internal Control in the Federal Government (2025 Green Book)",
    sourceUrl: "https://www.gao.gov/products/gao-25-107721",
  },
  {
    id: "logical-access-leavers",
    title: "Logical access and workforce changes",
    domain: "cybersecurity",
    tags: ["access", "least privilege", "mfa", "termination", "pms", "banking", "audit log"],
    text: "Access control should follow least privilege and unique user identity. Avoid shared PMS, accounting, email, and banking credentials; require MFA where available; review privileged access periodically; and disable access promptly when duties or employment change. Preserve audit logs and review high-risk activity such as exports, vendor edits, refunds, write-offs, and permission changes.",
    source: "NIST Cybersecurity Framework 2.0",
    sourceUrl: "https://www.nist.gov/cyberframework",
  },
  {
    id: "hipaa-risk-analysis",
    title: "HIPAA security risk analysis and safeguards",
    domain: "privacy",
    tags: ["hipaa", "phi", "ephi", "risk analysis", "audit controls", "dental", "security"],
    text: "A dental practice handling electronic protected health information should perform an accurate and thorough risk analysis, implement reasonable and appropriate administrative, physical, and technical safeguards, and revisit the analysis when systems or operations change. Internal-control evidence should include system inventory, access decisions, security incidents, contingency procedures, and audit-control review. This educational summary is not a legal compliance determination.",
    source: "HHS HIPAA Security Rule risk-analysis guidance",
    sourceUrl: "https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html",
  },
  {
    id: "vendor-change-verification",
    title: "Verify vendor and payment instruction changes out of band",
    domain: "sod",
    tags: ["vendor", "bank change", "callback", "business email compromise", "payment"],
    text: "Treat changes to vendor banking, remittance addresses, and payment contacts as high-risk master-data events. Require approval independent of the requester and verify the change using a trusted phone number or contact already on file—not contact details supplied in the change request. Log the verification and hold first payment when risk indicators are present.",
    source: "FBI business email compromise prevention guidance",
    sourceUrl: "https://www.fbi.gov/how-we-can-help-you/scams-and-safety/common-scams-and-crimes/business-email-compromise",
  },
  {
    id: "refund-controls",
    title: "Patient refunds and credit-balance controls",
    domain: "dental_ops",
    tags: ["refund", "credit balance", "patient", "approval", "original payment"],
    text: "Patient refunds combine cash disbursement and account adjustment risk. Require a documented credit-balance basis, approval independent of preparation, pay back to the original payment method when feasible, prohibit the same person from creating a fictitious credit and releasing the refund, and reconcile the refund register to the ledger and bank activity.",
    source: "Healthcare revenue-cycle control practice (educational)",
  },
  {
    id: "backup-recovery-tests",
    title: "Backups require restoration tests",
    domain: "continuity",
    tags: ["backup", "restore", "ransomware", "continuity", "recovery", "immutable"],
    text: "A successful backup job is not proof of recoverability. Keep protected or offline copies for critical PMS, imaging, accounting, and configuration data; define recovery priorities and responsible owners; and test restoration on a schedule. Record recovery time, gaps, and remediation. Restrict deletion of backups from ordinary administrator credentials.",
    source: "NIST Cybersecurity Framework 2.0 recovery outcomes",
    sourceUrl: "https://www.nist.gov/cyberframework",
  },
  {
    id: "incident-response-escalation",
    title: "Incident response roles and escalation",
    domain: "cybersecurity",
    tags: ["incident response", "ransomware", "breach", "escalation", "communications"],
    text: "Define who can isolate systems, contact vendors and counsel, preserve evidence, communicate with patients, and authorize recovery before an incident. Maintain an offline contact list, decision thresholds, and a short exercise schedule. After an event, document lessons learned and update risk analysis, safeguards, and continuity plans.",
    source: "NIST Cybersecurity Framework 2.0 Respond and Recover functions",
    sourceUrl: "https://www.nist.gov/cyberframework",
  },
  {
    id: "payroll-change-controls",
    title: "Payroll master-file and off-cycle payment controls",
    domain: "sod",
    tags: ["payroll", "ghost employee", "direct deposit", "rate change", "off-cycle"],
    text: "Separate payroll master-file changes from payroll approval and funding. Independently review new workers, terminations, pay-rate changes, direct-deposit changes, bonuses, and off-cycle payments against authorized personnel records. Reconcile the payroll register to bank funding and the general ledger, investigate duplicate accounts or addresses, and retain approval evidence.",
    source: "Payroll internal-control practice (educational)",
  },
  {
    id: "system-change-management",
    title: "Control changes to financial and clinical systems",
    domain: "cybersecurity",
    tags: ["change management", "configuration", "pms", "accounting", "testing", "rollback"],
    text: "Changes to PMS, accounting, payment, interface, and security configurations can alter control behavior. Record the request and business reason, require appropriate approval, test high-risk changes away from production when feasible, preserve prior configuration or a rollback path, restrict production change access, and review emergency changes after implementation.",
    source: "NIST Cybersecurity Framework 2.0 Protect outcomes",
    sourceUrl: "https://www.nist.gov/cyberframework",
  },
  {
    id: "management-override",
    title: "Management override is a distinct control risk",
    domain: "fraud",
    tags: ["management override", "journal entry", "exception", "owner", "related party"],
    text: "Owner involvement can compensate for limited staffing, but it can also bypass ordinary controls. Treat manual journal entries, unusual write-offs, related-party vendors, threshold splitting, and after-hours overrides as reviewable exceptions. Preserve the business purpose, preparer, approver, evidence, and follow-up; use an independent CPA or other qualified reviewer where the owner is the transaction initiator.",
    source: "Internal-control and fraud-risk practice (educational)",
  },
];
