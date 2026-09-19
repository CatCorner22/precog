/**
 * Curated knowledge corpus for Pioneer RAG.
 * Chunks are educational (COSO, SoD, Lean, dental ops) — not legal advice.
 */

import type { IndustryId } from "../industry";

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
    | "ai_governance";
  tags: string[];
  text: string;
  source: string;
  /** When set, this chunk is boosted for the matching industry and demoted for others. */
  industry?: IndustryId;
}

export const KNOWLEDGE_CORPUS: KnowledgeChunk[] = [
  {
    id: "coso-5-components",
    title: "COSO five components",
    domain: "coso",
    tags: ["coso", "control environment", "monitoring", "risk assessment"],
    text: "COSO Internal Control — Integrated Framework has five components: Control Environment, Risk Assessment, Control Activities, Information & Communication, and Monitoring Activities. Reasonable assurance means residual risk is reduced to an acceptable level, not eliminated. Small dental practices still own all five components; compensating controls and owner monitoring substitute for full segregation of duties.",
    source: "COSO ICIF (educational summary)",
  },
  {
    id: "coso-control-activities",
    title: "Control activities for small teams",
    domain: "coso",
    tags: ["control activities", "sod", "approvals", "reconciliations"],
    text: "Control activities include authorizations, verifications, reconciliations, physical controls, and segregation of duties. When team size prevents full SoD, COSO still expects compensating controls: dual signatures, independent bank reconciliation by the owner, exception reports, and documented residual risk acceptance with review dates.",
    source: "COSO ICIF (educational summary)",
  },
  {
    id: "coso-monitoring",
    title: "Monitoring activities",
    domain: "coso",
    tags: ["monitoring", "ongoing", "separate evaluations"],
    text: "Monitoring can be ongoing (daily/weekly owner reviews) or separate evaluations (periodic deep dives). For dental practices, weekly bank rec review, monthly write-off aging, and quarterly vendor master review are practical monitoring activities. Undocumented monitoring does not count.",
    source: "COSO ICIF (educational summary)",
  },
  {
    id: "sod-three-way",
    title: "Classic segregation of duties",
    domain: "sod",
    tags: ["sod", "custody", "authorization", "recording"],
    text: "Classic SoD separates custody of assets, authorization of transactions, and recording in the books. In a 4–8 person dental office these roles often collide. Minimum viable compensating pattern: person who posts payments does not reconcile the bank; person who can write off AR does not solely control deposits; vendor setup requires second approval or owner review.",
    source: "Internal control practice (educational)",
  },
  {
    id: "sod-dental-cash",
    title: "Dental cash and patient payment path",
    domain: "dental_ops",
    industry: "dental",
    tags: ["cash", "deposits", "front desk", "payments"],
    text: "High-risk dental cash path: collect patient payments, void/adjust charges, prepare deposit, post to PMS, and reconcile bank. Single front-desk ownership of collect + void + deposit is a classic embezzlement pattern. Dual control on deposit bags, camera coverage of cash drawer, and owner-only bank rec reduce residual risk quickly.",
    source: "Dental practice operations (educational)",
  },
  {
    id: "fraud-triangle",
    title: "Fraud triangle and opportunity",
    domain: "fraud",
    tags: ["fraud", "opportunity", "pressure", "rationalization"],
    text: "The fraud triangle is pressure, opportunity, and rationalization. Controls primarily shrink opportunity (SoD, dual control, monitoring). Small practices often over-focus on 'trustworthy people' and under-invest in opportunity reduction. Crime statistics for employee dishonesty are industry priors for education, not accusations against any employee.",
    source: "Fraud examination basics (educational)",
  },
  {
    id: "fraud-detection-lag",
    title: "Detection lag multiplies loss",
    domain: "fraud",
    tags: ["detection", "timeline", "embezzlement", "bank rec"],
    text: "Median detection times for occupational fraud often stretch months. Longer detection lag multiplies cumulative loss. Independent bank reconciliation and surprise cash counts are high-ROI detection controls for dental practices. Cameras help after the fact but do not replace recon.",
    source: "Occupational fraud research summaries (educational)",
  },
  {
    id: "lean-muda-dental",
    title: "Lean muda in dental ops",
    domain: "lean",
    industry: "dental",
    tags: ["lean", "tps", "muda", "waste", "denials"],
    text: "Toyota Production System waste (muda) in dental offices includes rework on insurance claims, waiting for chair turnover, over-processing chart notes, and defects in coding that cause denials. Denial rework is both operational waste and a control risk if write-offs hide unauthorized adjustments. Value-stream map from claim submission to payment.",
    source: "Lean / TPS applied to healthcare admin (educational)",
  },
  {
    id: "lean-mura-muri",
    title: "Mura and muri in staffing",
    domain: "lean",
    tags: ["mura", "muri", "unevenness", "overburden", "staffing"],
    text: "Mura (unevenness) appears when one person owns all billing knowledge and others idle or thrash. Muri (overburden) appears when the office manager carries all SoD roles. Cross-training reduces both waste and knowledge single points of failure.",
    source: "Lean / TPS (educational)",
  },
  {
    id: "continuity-spof",
    title: "Knowledge single points of failure",
    domain: "continuity",
    tags: ["spof", "cross-training", "continuity", "tribal knowledge"],
    text: "Critical knowledge with one expert owner is a continuity and control risk. If the sole expert can also authorize write-offs or vendor changes, process failure and fraud opportunity combine. Document procedures, cross-train a backup, and re-score residual risk after any key person leave.",
    source: "Business continuity for SMBs (educational)",
  },
  {
    id: "insurance-transfer",
    title: "Insurance transfer vs control design",
    domain: "insurance",
    tags: ["insurance", "deductible", "premium", "employee dishonesty"],
    text: "Employee dishonesty / crime coverage transfers some residual financial risk but does not fix process design. Deductible sets retained floor; policy limit caps recovery; control credits (cameras, dual control, bank rec) may reduce premium. Annual cost of risk ≈ net premium + annualized expected retained loss. Raising deductible without improving detection often increases owner residual.",
    source: "Risk transfer basics (educational)",
  },
  {
    id: "ai-shadow-ai",
    title: "Shadow AI and model risk for practices",
    domain: "ai_governance",
    tags: ["ai", "shadow ai", "phi", "model risk", "nist"],
    text: "Small practices adopting AI for notes, coding, or chatbots face model risk, PHI leakage, and shadow AI (uncontrolled tools). Keep an inventory of AI use cases, never paste PHI into unapproved tools, and require human review for financially relevant outputs (write-offs, claim coding overrides). COSO-style oversight applies to AI decisions that affect revenue and cash.",
    source: "NIST AI RMF / COSO GenAI guidance themes (educational)",
  },
  {
    id: "residual-appetite",
    title: "Residual risk appetite language",
    domain: "coso",
    tags: ["residual", "appetite", "accept", "remediate"],
    text: "Owners may accept residual risk deliberately when cost of further control exceeds benefit, but acceptance must be explicit, dated, and re-reviewed after staff or insurance changes. 'We trust our team' without monitoring is not residual acceptance — it is unmeasured residual.",
    source: "Risk appetite practice (educational)",
  },
  {
    id: "dental-writeoffs",
    title: "Write-off and adjustment controls",
    domain: "dental_ops",
    industry: "dental",
    tags: ["write-off", "adjustments", "ar", "pms"],
    text: "Unauthorized write-offs and adjustments are a common dental fraud vector. Controls: reason codes required, threshold requiring doctor/owner approval, monthly aging of adjustments, and no dual role of adjuster + payment poster without compensating review.",
    source: "Dental revenue cycle controls (educational)",
  },
  {
    id: "vendor-master",
    title: "Vendor and AP risk",
    domain: "sod",
    tags: ["vendor", "ap", "payments", "fraud"],
    text: "Vendor master fraud includes fake vendors and address changes to personal accounts. Separate vendor setup from payment release; require dual approval above a dollar threshold; review new vendors monthly. Small practices often let the same person set up vendors and issue checks — high residual.",
    source: "AP controls (educational)",
  },
  {
    id: "leading-indicators",
    title: "Leading indicators of control failure",
    domain: "fraud",
    tags: ["leading indicators", "monitoring", "anomalies"],
    text: "Leading indicators include rising void/adjustment rates, delayed bank reconciliations, sole ownership of critical knowledge, overdue residual acceptance reviews, claims load factor increases, and sudden cash intensity spikes. Leading indicators beat lagging loss discovery.",
    source: "Continuous monitoring themes (educational)",
  },

  // ---- Retail ----
  {
    id: "retail-shrink-sod",
    title: "Retail shrink and POS segregation",
    domain: "retail_ops",
    industry: "retail",
    tags: ["retail", "shrink", "pos", "returns", "sweethearting", "overrides"],
    text: "Retail shrink combines shoplifting, employee theft, and paperwork error. The employee-theft slice concentrates at the POS: no-receipt returns to a personal card, sweethearting (under-ringing friends), price overrides, and voided sales after cash is taken. Controls: manager-only override codes, daily exception report of voids/returns/overrides by cashier, receipt required for cash refunds, and camera coverage synced to POS timestamps.",
    source: "Retail loss prevention basics (educational)",
  },
  {
    id: "retail-cash-drawer",
    title: "Cash drawer accountability",
    domain: "retail_ops",
    industry: "retail",
    tags: ["retail", "cash drawer", "deposit", "over short", "blind count"],
    text: "One cashier per drawer per shift, blind drop counts (the counter does not see the POS expected total), and a cash-over/short log by employee turn skimming into a visible pattern within weeks. The person who counts the drawer should not also prepare the deposit and post it to the books; if the team is too small, the owner reviews the deposit slip against the POS Z-report weekly.",
    source: "Retail cash handling (educational)",
  },
  {
    id: "retail-inventory-receiving",
    title: "Receiving and inventory adjustments",
    domain: "retail_ops",
    industry: "retail",
    tags: ["retail", "inventory", "receiving", "cycle count", "purchase order", "adjustments"],
    text: "Receiving without a purchase-order match lets short shipments and phantom deliveries slide into cost of goods. Require three-way match (PO, packing slip, invoice) above a dollar threshold, second-person spot counts on high-value SKUs, and owner review of inventory adjustment reasons monthly. Large unexplained negative adjustments are a shrink and fraud leading indicator.",
    source: "Retail inventory control (educational)",
  },
  {
    id: "retail-ecom-refunds",
    title: "E-commerce refund and chargeback path",
    domain: "retail_ops",
    industry: "retail",
    tags: ["retail", "ecommerce", "refunds", "chargebacks", "shopify", "platform admin"],
    text: "Online refunds are cash leaving without a physical return. Limit refund permissions to named users, require a return-received scan before refund release above a threshold, and reconcile platform payouts to the bank monthly. Platform admin rights (who can add staff, change payout accounts) belong to the owner only.",
    source: "E-commerce controls (educational)",
  },

  // ---- Restaurant / hospitality ----
  {
    id: "restaurant-tips-cash",
    title: "Tip pooling and nightly cash close",
    domain: "restaurant_ops",
    industry: "restaurant",
    tags: ["restaurant", "tips", "tip pool", "cash out", "nightly close", "deposit", "z report"],
    text: "Restaurant cash leaks at the nightly close: cash tips paid out from the drawer, tip-pool math done by one person, and the deposit prepared by the same closer who runs the Z-report. Controls: a second person verifies the close sheet against the POS Z-report, tip-out calculations are printed and signed, safe drops are logged with two initials, and the owner compares deposits to POS totals weekly.",
    source: "Restaurant cash controls (educational)",
  },
  {
    id: "restaurant-voids-comps",
    title: "Voids, comps, and discounts",
    domain: "restaurant_ops",
    industry: "restaurant",
    tags: ["restaurant", "voids", "comps", "discounts", "manager code", "pos"],
    text: "Voids and comps are the restaurant equivalent of write-offs. A server who can void a paid ticket can pocket the cash. Require manager codes for voids after payment, a reason on every comp, and a nightly void/comp report by employee reviewed by the owner or GM. Rising void rates on one shift or server are a leading indicator, not an accusation.",
    source: "Restaurant POS controls (educational)",
  },
  {
    id: "restaurant-liquor-variance",
    title: "Liquor variance and pour cost",
    domain: "restaurant_ops",
    industry: "restaurant",
    tags: ["restaurant", "bar", "liquor", "pour cost", "variance", "inventory"],
    text: "Liquor is high-value, easy to over-pour, and easy to give away. Weekly bar inventory compared to POS sales (usage vs. sold) produces a variance percentage; anything above a few percent deserves a look. Standard pour sizes, jiggers or measured pourers, and a bar manager who does not also close the bar drawer reduce residual risk.",
    source: "Bar inventory control (educational)",
  },
  {
    id: "restaurant-vendor-ap",
    title: "Food vendor invoices and kickbacks",
    domain: "restaurant_ops",
    industry: "restaurant",
    tags: ["restaurant", "vendor", "food cost", "invoices", "kickback", "receiving"],
    text: "Food and beverage AP is high-volume and easy to pad: duplicate invoices, short deliveries billed in full, and vendor kickbacks to whoever places orders. Separate ordering from receiving from paying where possible; if not, the owner approves new vendors and reviews food-cost percentage weekly. A sudden food-cost jump with flat sales points at receiving or invoicing, not the menu.",
    source: "Restaurant AP controls (educational)",
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
    source: "Professional practice trust accounting (educational)",
  },
  {
    id: "services-billing-writeoffs",
    title: "Time billing, WIP, and write-downs",
    domain: "services_ops",
    industry: "professional_services",
    tags: ["professional services", "billing", "wip", "write-down", "realization", "invoice"],
    text: "Revenue leaks in services firms through unbilled time, silent write-downs, and invoices that never leave. Controls: monthly WIP aging review by the engagement partner, write-downs above a threshold approved by someone other than the biller, and realization rate tracked per client. The billing coordinator who can also apply client payments and issue credits needs an independent monthly review.",
    source: "Professional services revenue cycle (educational)",
  },
  {
    id: "services-expense-reimbursement",
    title: "Expense reports and reimbursement abuse",
    domain: "services_ops",
    industry: "professional_services",
    tags: ["professional services", "expenses", "reimbursement", "receipts", "corporate card"],
    text: "Expense reimbursement fraud is small per instance and large over years: duplicate submissions, personal purchases on the firm card, mileage padding. Require itemized receipts above a low threshold, partner approval for their own staff, and a quarterly sample review of card statements by someone outside the approval chain.",
    source: "Expense controls (educational)",
  },
  {
    id: "services-engagement-scope",
    title: "Engagement letters and scope control",
    domain: "services_ops",
    industry: "professional_services",
    tags: ["professional services", "engagement letter", "scope creep", "change order", "margin"],
    text: "Scope creep is a revenue and quality risk: work delivered without a signed change order is often written off later. Require an engagement letter before time is charged, a change-order note for out-of-scope requests, and a monthly budget-vs-actual check per engagement.",
    source: "Engagement management (educational)",
  },

  // ---- General small business ----
  {
    id: "smb-bank-rec-owner",
    title: "Owner bank reconciliation habit",
    domain: "sod",
    industry: "general",
    tags: ["small business", "bank reconciliation", "owner review", "statements", "positive pay"],
    text: "Owner-first bank statement review breaks the loop in which the person who records payments is also the only one who sees the bank's record. Positive pay (the bank honors only checks you pre-authorize) and dual approval on ACH above a threshold each remove one more path a single person can use alone.",
    source: "SMB internal controls (educational)",
  },
  {
    id: "smb-payroll-ghost",
    title: "Payroll ghost employees and rate changes",
    domain: "fraud",
    industry: "general",
    tags: ["small business", "payroll", "ghost employee", "rate change", "approval"],
    text: "Payroll fraud shows up as ghost employees, unapproved rate increases, and padded hours. Owner approves every new hire in the payroll system, reviews the payroll register total and headcount each cycle, and someone other than the payroll preparer reconciles payroll to the bank debit.",
    source: "Payroll controls (educational)",
  },
];
