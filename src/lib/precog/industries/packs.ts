import type { IndustryPack } from "./types";

/**
 * Industry packs.
 *
 * Each pack's role templates encode how duties actually cluster in that trade,
 * which is what produces realistic findings. The concentrations below are not
 * worst-case constructions: they describe the ordinary staffing of a business
 * of that size, which is precisely why the resulting conflicts are worth an
 * owner's attention rather than an auditor's.
 */

const dental: IndustryPack = {
  id: "dental",
  sampleName: "Ridgeview Family Dental",
  label: "Dental practice",
  blurb: "One or two chairs, a front desk, and insurance billing.",
  sector: "dental",
  entitlementLabels: {
    collect_cash: "Take payment from patients",
    post_payments: "Record payments in the practice software",
    bank_reconcile: "Reconcile the bank to the practice software",
    submit_claims: "Submit insurance claims",
    pms_admin_roles: "Practice software administration and user roles",
    approve_writeoffs: "Approve account write-offs",
    post_adjustments: "Enter account write-offs",
  },
  roleTemplates: {
    "Owner / Dentist": [
      "approve_writeoffs",
      "approve_vendor",
      "approve_payroll",
      "bank_reconcile",
      "view_reports_only",
      "pms_admin_roles",
    ],
    "Office Manager": [
      "post_payments",
      "prepare_deposit",
      "post_adjustments",
      "create_vendor",
      "release_payment",
      "enter_payroll",
      "approve_writeoffs",
      "pms_admin_roles",
      "submit_claims",
      "view_reports_only",
    ],
    "Front Desk Lead": [
      "collect_cash",
      "post_payments",
      "prepare_deposit",
      "submit_claims",
      "post_adjustments",
    ],
    Hygienist: ["view_reports_only"],
    "Dental Assistant": ["view_reports_only"],
    "Billing Specialist": [
      "submit_claims",
      "post_adjustments",
      "post_payments",
      "approve_writeoffs",
      "view_reports_only",
    ],
  },
  people: [
    { id: "p1", name: "Dr. Elena Vargas", role: "Owner / Dentist", active: true, tenureYears: 12 },
    { id: "p2", name: "Maya Chen", role: "Office Manager", active: true, tenureYears: 7 },
    { id: "p3", name: "Jordan Blake", role: "Front Desk Lead", active: true, tenureYears: 5 },
    { id: "p4", name: "Sam Ortiz", role: "Hygienist", active: true, tenureYears: 4 },
    { id: "p5", name: "Riley Kim", role: "Dental Assistant", active: true, tenureYears: 2 },
    { id: "p6", name: "Chris Patel", role: "Billing Specialist", active: true, tenureYears: 3 },
  ],
  watchFor: [
    "Insurance checks arriving as paper and being handled by the same person who records them. Two cases in this library ran for four and six years on exactly this.",
    "Write-off and adjustment authority sitting with whoever posts the adjustment, which makes a diverted payment disappear from the ledger.",
    "Practice software administration held by the office manager, which lets a single role grant itself any permission it lacks.",
  ],
};

const medical: IndustryPack = {
  id: "medical",
  sampleName: "Northgate Family Medicine",
  label: "Medical or veterinary practice",
  blurb: "Clinical staff, a front desk, and third-party billing.",
  sector: "medical",
  entitlementLabels: {
    collect_cash: "Take payment from patients",
    post_payments: "Record payments in the practice software",
    bank_reconcile: "Reconcile the bank to the practice software",
    submit_claims: "Submit insurance or payer claims",
    pms_admin_roles: "Practice software administration and user roles",
    approve_writeoffs: "Approve account write-offs",
    post_adjustments: "Enter account write-offs",
  },
  roleTemplates: {
    "Owner / Physician": [
      "approve_writeoffs",
      "approve_vendor",
      "approve_payroll",
      "bank_reconcile",
      "view_reports_only",
    ],
    "Practice Manager": [
      "post_payments",
      "prepare_deposit",
      "post_adjustments",
      "create_vendor",
      "release_payment",
      "enter_payroll",
      "approve_writeoffs",
      "pms_admin_roles",
      "view_reports_only",
    ],
    Receptionist: ["collect_cash", "post_payments", "prepare_deposit"],
    "Billing Coordinator": [
      "submit_claims",
      "post_adjustments",
      "post_payments",
      "view_reports_only",
    ],
    "Clinical Staff": ["view_reports_only"],
  },
  people: [
    { id: "p1", name: "Dr. Amara Osei", role: "Owner / Physician", active: true, tenureYears: 15 },
    { id: "p2", name: "Dana Whitfield", role: "Practice Manager", active: true, tenureYears: 8 },
    { id: "p3", name: "Tomas Reyes", role: "Receptionist", active: true, tenureYears: 2 },
    { id: "p4", name: "Priya Nandakumar", role: "Billing Coordinator", active: true, tenureYears: 6 },
    { id: "p5", name: "Kelly Brandt", role: "Clinical Staff", active: true, tenureYears: 3 },
  ],
  watchFor: [
    "A receptionist role is not a low-access role. One case here shows a receptionist taking $446,000 in insurer checks over four years.",
    "Payer remittances that arrive as paper cheques rather than electronic transfers give one desk both custody and the record.",
    "Refunds to patients are an outbound payment channel that rarely gets the scrutiny vendor payments receive.",
  ],
};

const restaurant: IndustryPack = {
  id: "restaurant",
  sampleName: "The Copper Kettle",
  label: "Restaurant, café, or bar",
  blurb: "Tills, shift staff, food and beverage suppliers.",
  sector: "restaurant",
  entitlementLabels: {
    collect_cash: "Take payment at the till",
    post_payments: "Record sales in the point-of-sale system",
    prepare_deposit: "Count the till and prepare the deposit",
    bank_reconcile: "Reconcile the bank to the till",
    post_adjustments: "Enter voids, comps, or discounts",
    approve_writeoffs: "Approve voids, comps, or discounts",
    submit_claims: "Process delivery-platform settlements",
    pms_admin_roles: "Point-of-sale administration and user roles",
    create_vendor: "Set up suppliers",
    release_payment: "Pay suppliers",
  },
  roleTemplates: {
    "Owner / Operator": [
      "approve_writeoffs",
      "approve_vendor",
      "approve_payroll",
      "bank_reconcile",
      "view_reports_only",
    ],
    "General Manager": [
      "collect_cash",
      "post_payments",
      "prepare_deposit",
      "post_adjustments",
      "approve_writeoffs",
      "create_vendor",
      "release_payment",
      "enter_payroll",
      "pms_admin_roles",
      "view_reports_only",
    ],
    "Shift Supervisor": [
      "collect_cash",
      "post_payments",
      "prepare_deposit",
      "post_adjustments",
      "approve_writeoffs",
    ],
    Bookkeeper: [
      "post_payments",
      "bank_reconcile",
      "create_vendor",
      "release_payment",
      "enter_payroll",
      "view_reports_only",
    ],
    Server: ["collect_cash", "post_adjustments"],
  },
  people: [
    { id: "p1", name: "Nico Arvanitis", role: "Owner / Operator", active: true, tenureYears: 9 },
    { id: "p2", name: "Bea Lindqvist", role: "General Manager", active: true, tenureYears: 4 },
    { id: "p3", name: "Marcus Idowu", role: "Shift Supervisor", active: true, tenureYears: 3 },
    { id: "p4", name: "Helen Vasquez", role: "Bookkeeper", active: true, tenureYears: 6 },
    { id: "p5", name: "Tariq Haddad", role: "Server", active: true, tenureYears: 1 },
  ],
  watchFor: [
    "Voids, comps, and no-sales are the classic concealment tool at a till, because they are also a normal, necessary function. Review them weekly grouped by employee, not case by case.",
    "Supplier invoices are high-volume, low-value, and irregular, which is exactly the profile a fabricated vendor hides in. One case here ran $336,000 of invented suppliers past a multi-site operator over five years.",
    "Across several locations, compare the same cost line site by site. An outlier location is the fastest signal a multi-unit owner has.",
  ],
};

const construction: IndustryPack = {
  id: "construction",
  sampleName: "Kowalczyk Building Co.",
  label: "Construction, trades, or home services",
  blurb: "Crews in the field, an office handling billing and payables.",
  sector: "construction",
  entitlementLabels: {
    post_payments: "Record customer payments",
    submit_claims: "Submit progress billings and draw requests",
    bank_reconcile: "Reconcile the bank to the job ledger",
    post_adjustments: "Enter credits or change orders",
    approve_writeoffs: "Approve credits or change orders",
    pms_admin_roles: "Accounting system administration and user roles",
    create_vendor: "Set up subcontractors and suppliers",
    release_payment: "Release payments to subcontractors and suppliers",
  },
  roleTemplates: {
    "Owner / Principal": [
      "approve_writeoffs",
      "approve_vendor",
      "approve_payroll",
      "bank_reconcile",
      "view_reports_only",
    ],
    "Office Manager": [
      "post_payments",
      "prepare_deposit",
      "post_adjustments",
      "create_vendor",
      "release_payment",
      "enter_payroll",
      "approve_writeoffs",
      "pms_admin_roles",
      "submit_claims",
      "view_reports_only",
    ],
    Controller: [
      "post_payments",
      "bank_reconcile",
      "create_vendor",
      "release_payment",
      "enter_payroll",
      "post_adjustments",
      "pms_admin_roles",
      "view_reports_only",
    ],
    "Project Manager": ["submit_claims", "approve_vendor", "view_reports_only"],
    "Field Crew": ["view_reports_only"],
  },
  people: [
    { id: "p1", name: "Ray Kowalczyk", role: "Owner / Principal", active: true, tenureYears: 20 },
    { id: "p2", name: "Lena Ferraro", role: "Controller", active: true, tenureYears: 11 },
    { id: "p3", name: "Dee Ncube", role: "Office Manager", active: true, tenureYears: 7 },
    { id: "p4", name: "Owen Brightwater", role: "Project Manager", active: true, tenureYears: 5 },
    { id: "p5", name: "Sal Moretti", role: "Field Crew", active: true, tenureYears: 4 },
  ],
  watchFor: [
    "A controller who holds payroll, receivables, payables, the company cards, and the bank accounts holds the entire cash cycle. The largest loss in this library, $2.06 million over six years, ran on exactly that concentration.",
    "Long tenure is not a control. One case here involves an office manager of twenty-seven years who raised her own pay $1,000 a week, then $2,000.",
    "Subcontractor setup and payment in the same hands is the trade's version of the fake-vendor scheme, and the volume of legitimate one-off subs makes it easy to hide.",
  ],
};

const professionalServices: IndustryPack = {
  id: "professional-services",
  sampleName: "Boaz & Lem LLP",
  label: "Professional services firm",
  blurb: "Law, accounting, design, consulting — partners billing time.",
  sector: "professional-services",
  entitlementLabels: {
    post_payments: "Record client payments",
    submit_claims: "Issue client invoices",
    post_adjustments: "Enter fee write-downs",
    approve_writeoffs: "Approve fee write-downs",
    pms_admin_roles: "Practice or accounting system administration",
  },
  roleTemplates: {
    "Managing Partner": [
      "approve_writeoffs",
      "approve_vendor",
      "approve_payroll",
      "bank_reconcile",
      "view_reports_only",
    ],
    "Office Administrator": [
      "collect_cash",
      "post_payments",
      "prepare_deposit",
      "post_adjustments",
      "create_vendor",
      "release_payment",
      "enter_payroll",
      "submit_claims",
      "pms_admin_roles",
      "view_reports_only",
    ],
    "Billing Clerk": ["submit_claims", "post_payments", "post_adjustments"],
    Partner: ["approve_writeoffs", "view_reports_only"],
    Associate: ["view_reports_only"],
  },
  people: [
    { id: "p1", name: "Harriet Boaz", role: "Managing Partner", active: true, tenureYears: 18 },
    { id: "p2", name: "Colin Ashgrove", role: "Office Administrator", active: true, tenureYears: 9 },
    { id: "p3", name: "Nadia Farrouk", role: "Billing Clerk", active: true, tenureYears: 3 },
    { id: "p4", name: "Victor Lem", role: "Partner", active: true, tenureYears: 12 },
    { id: "p5", name: "Ines Trebor", role: "Associate", active: true, tenureYears: 2 },
  ],
  watchFor: [
    "Irregular billing cycles are the core weakness. When invoices go out whenever a matter closes, a payment that never arrives does not look late — it looks normal.",
    "A fee write-down is indistinguishable from a diverted payment unless someone other than the biller approves it.",
    "Partners focused on client work delegate the entire back office to one administrator, often for years. The architecture-firm case in this library, at nearly $280,000, sat in exactly that arrangement.",
  ],
};

const retail: IndustryPack = {
  id: "retail",
  sampleName: "Solberg Home Goods",
  label: "Retail shop",
  blurb: "A counter, stock on shelves, and suppliers.",
  sector: "retail",
  entitlementLabels: {
    collect_cash: "Take payment at the counter",
    post_payments: "Record sales in the point-of-sale system",
    prepare_deposit: "Count the till and prepare the deposit",
    bank_reconcile: "Reconcile the bank to the till",
    post_adjustments: "Enter refunds, voids, or discounts",
    approve_writeoffs: "Approve refunds, voids, or stock write-offs",
    submit_claims: "Process online-channel settlements",
    pms_admin_roles: "Point-of-sale administration and user roles",
    create_vendor: "Set up suppliers",
    release_payment: "Pay suppliers",
  },
  roleTemplates: {
    "Owner / Operator": [
      "approve_writeoffs",
      "approve_vendor",
      "approve_payroll",
      "bank_reconcile",
      "view_reports_only",
    ],
    "Store Manager": [
      "collect_cash",
      "post_payments",
      "prepare_deposit",
      "post_adjustments",
      "approve_writeoffs",
      "create_vendor",
      "release_payment",
      "pms_admin_roles",
      "view_reports_only",
    ],
    "Assistant Manager": [
      "collect_cash",
      "post_payments",
      "prepare_deposit",
      "post_adjustments",
    ],
    Bookkeeper: [
      "post_payments",
      "bank_reconcile",
      "create_vendor",
      "release_payment",
      "enter_payroll",
      "view_reports_only",
    ],
    "Sales Assistant": ["collect_cash", "post_adjustments"],
  },
  people: [
    { id: "p1", name: "Mira Solberg", role: "Owner / Operator", active: true, tenureYears: 11 },
    { id: "p2", name: "Darnell Pryce", role: "Store Manager", active: true, tenureYears: 5 },
    { id: "p3", name: "Yuki Tanaka", role: "Assistant Manager", active: true, tenureYears: 3 },
    { id: "p4", name: "Grace Okonjo", role: "Bookkeeper", active: true, tenureYears: 7 },
    { id: "p5", name: "Leo Barrett", role: "Sales Assistant", active: true, tenureYears: 1 },
  ],
  watchFor: [
    "Refunds are an outbound payment channel that sits in the hands of whoever works the counter. Review refunds by employee, not by transaction.",
    "Company card statements are where retail losses hide, because a consumer marketplace charge looks like any other supplier line. One case here ran 1,800 unauthorized personal orders through the company card.",
    "The deputy manager usually inherits full system access with none of the oversight the manager's role attracts. The hardware-retail case in this library, $1.4 million over nine years, was an assistant office manager.",
  ],
};

const nonprofit: IndustryPack = {
  id: "nonprofit",
  sampleName: "Riverbend Community Trust",
  label: "Nonprofit or association",
  blurb: "A small staff, a volunteer board, and restricted funds.",
  sector: "nonprofit",
  entitlementLabels: {
    collect_cash: "Receive donations and event cash",
    post_payments: "Record donations and grants received",
    submit_claims: "Submit grant claims and reimbursement requests",
    post_adjustments: "Enter fund reclassifications",
    approve_writeoffs: "Approve fund reclassifications",
    create_vendor: "Set up payees and suppliers",
    approve_vendor: "Approve new payees and suppliers",
    release_payment: "Release payments",
    pms_admin_roles: "Accounting and donor system administration",
  },
  roleTemplates: {
    "Board Treasurer": ["approve_vendor", "approve_payroll", "bank_reconcile", "view_reports_only"],
    "Executive Director": [
      "approve_writeoffs",
      "approve_vendor",
      "create_vendor",
      "release_payment",
      "enter_payroll",
      "post_adjustments",
      "pms_admin_roles",
      "view_reports_only",
    ],
    "Operations Manager": [
      "collect_cash",
      "post_payments",
      "prepare_deposit",
      "post_adjustments",
      "create_vendor",
      "release_payment",
      "submit_claims",
      "view_reports_only",
    ],
    "Program Staff": ["collect_cash", "view_reports_only"],
  },
  people: [
    { id: "p1", name: "Frances Okwuosa", role: "Board Treasurer", active: true, tenureYears: 3 },
    { id: "p2", name: "Gideon Marsh", role: "Executive Director", active: true, tenureYears: 6 },
    { id: "p3", name: "Aurelia Banks", role: "Operations Manager", active: true, tenureYears: 4 },
    { id: "p4", name: "Tobias Renn", role: "Program Staff", active: true, tenureYears: 2 },
  ],
  watchFor: [
    "A board that meets quarterly and reads a summary is not a control over the executive director's own spending. One case here ran $836,000 over five years under exactly that arrangement.",
    "A control that is documented but never performed is worse than none, because it stops anyone asking the question. One founder in this library went as far as fabricating a board of directors to supply the approvals.",
    "Restricted funds create a second failure mode beyond theft: money spent on the wrong purpose is a grant-compliance problem even when nobody took anything.",
  ],
};

/** Every sample business name, so the app can tell a sample from a real one. */
export const SAMPLE_NAMES: ReadonlySet<string> = new Set([
  "Ridgeview Family Dental",
  "Northgate Family Medicine",
  "The Copper Kettle",
  "Kowalczyk Building Co.",
  "Boaz & Lem LLP",
  "Solberg Home Goods",
  "Riverbend Community Trust",
]);

export const INDUSTRY_PACKS: IndustryPack[] = [
  dental,
  medical,
  restaurant,
  construction,
  professionalServices,
  retail,
  nonprofit,
];

export const DEFAULT_PACK_ID = "dental" as const;

export function packById(id: string): IndustryPack {
  return INDUSTRY_PACKS.find((p) => p.id === id) ?? dental;
}
