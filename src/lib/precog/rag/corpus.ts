/**
 * Curated knowledge corpus for Pioneer RAG.
 * Chunks are educational (COSO, SoD, Lean, dental ops) — not legal advice.
 */

export interface KnowledgeChunk {
  id: string;
  title: string;
  domain:
    | "coso"
    | "sod"
    | "lean"
    | "dental_ops"
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
