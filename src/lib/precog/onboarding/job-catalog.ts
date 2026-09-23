import type { EntitlementId } from "../sod/conflict-rules";
import { ENTITLEMENTS } from "../sod/conflict-rules";

/**
 * Common job titles and the money duties each one typically holds in a
 * business of two to fifty people, so an owner can set up the whole team
 * from a roster instead of ticking duties one person at a time.
 *
 * What stands behind it. Workday, SAP SuccessFactors, and Oracle HCM Cloud
 * ship no public list of job descriptions: every customer builds its own job
 * catalog. What those systems do share is the shape of a worker export (a
 * name, a job title or job profile, a department, a status, a hire date),
 * and the titles that fill them come from the same small pool in a small
 * business. This catalog takes that pool and, where a title corresponds to
 * an occupation in the U.S. Bureau of Labor Statistics Standard Occupational
 * Classification (SOC 2018, the taxonomy O*NET uses), records the code so
 * the mapping can be checked against a public reference.
 *
 * The duties are this app's reading of what such a title usually carries,
 * not a rule. They are a starting point the owner corrects in the grid; a
 * title never grants a duty the owner has unticked.
 */
export type JobFamily =
  | "leadership"
  | "finance"
  | "office"
  | "sales"
  | "clinical"
  | "food"
  | "retail"
  | "trades"
  | "it"
  | "people"
  | "legal"
  | "professional"
  | "hospitality"
  | "automotive"
  | "property"
  | "nonprofit"
  | "marketing"
  | "education";

export interface JobCatalogEntry {
  id: string;
  title: string;
  family: JobFamily;
  /** Other names the same job goes by on rosters and HR exports (lower case). */
  aliases: readonly string[];
  /** SOC 2018 code where the title corresponds to one occupation. */
  soc?: string;
  /** Duties this title typically holds in a small business. */
  entitlements: readonly EntitlementId[];
  /** One sentence on why, so the owner can disagree with a reason in front of them. */
  note: string;
  /**
   * What the job does, in one plain sentence: the standard description an HR
   * system's job profile would carry. Where a SOC code is recorded this
   * paraphrases the Bureau of Labor Statistics definition.
   */
  description: string;
}

export const JOB_FAMILY_LABEL: Record<JobFamily, string> = {
  leadership: "Owners and managers",
  finance: "Finance and accounting",
  office: "Front office and administration",
  sales: "Sales and customer service",
  clinical: "Clinical and patient care",
  food: "Restaurant and food service",
  retail: "Retail",
  trades: "Trades, field, and construction",
  it: "IT and systems",
  people: "Human resources",
  legal: "Legal",
  professional: "Professional and project staff",
  hospitality: "Hotels and hospitality",
  automotive: "Auto dealership and service",
  property: "Property and real estate",
  nonprofit: "Nonprofit and association",
  marketing: "Marketing and communications",
  education: "Education and childcare",
};

const entry = (
  id: string,
  title: string,
  family: JobFamily,
  aliases: readonly string[],
  entitlements: readonly EntitlementId[],
  note: string,
  soc?: string,
): Omit<JobCatalogEntry, "description"> => ({
  id,
  title,
  family,
  aliases,
  entitlements,
  note,
  ...(soc ? { soc } : {}),
});

const RAW_CATALOG: readonly Omit<JobCatalogEntry, "description">[] = [
  // Owners and managers
  entry(
    "owner",
    "Owner / Principal",
    "leadership",
    [
      "owner",
      "proprietor",
      "principal",
      "founder",
      "co-founder",
      "ceo",
      "chief executive officer",
      "president",
      "managing member",
      "managing partner",
      "partner",
      "practice owner",
      "owner dentist",
      "dentist owner",
      "owner operator",
      "co owner",
      "working owner",
      "sole proprietor",
      "franchise owner",
      "franchisee",
      "dealer principal",
      "dealer",
      "franchise dealer",
      "physician owner",
      "owner physician",
      "owner veterinarian",
    ],
    [
      "approve_vendor",
      "approve_payroll",
      "approve_writeoffs",
      "sign_checks",
      "manage_user_access",
      "view_reports_only",
    ],
    "The owner is the approver of last resort and usually the one who signs. Reconciling the bank is left for you to tick: tick it if you check the statement against the books yourself.",
  ),
  entry(
    "general-manager",
    "General / Operations Manager",
    "leadership",
    [
      "general manager",
      "gm",
      "operations manager",
      "ops manager",
      "director of operations",
      "operations director",
      "coo",
      "chief operating officer",
      "practice administrator",
      "business manager",
      "regional manager",
      "district manager",
      "area manager",
      "plant manager",
      "multi unit manager",
      "vp operations",
      "vp of operations",
      "vice president of operations",
      "vice president",
      "vp",
    ],
    [
      "approve_vendor",
      "approve_writeoffs",
      "approve_payroll",
      "order_supplies",
      "manage_user_access",
      "view_reports_only",
    ],
    "A general manager approves spending, write-offs, and payroll and often controls who has system access.",
    "11-1021",
  ),
  entry(
    "office-manager",
    "Office Manager",
    "leadership",
    [
      "office manager",
      "practice manager",
      "office administrator",
      "administrative manager",
      "front office manager",
      "business office manager",
      "clinic manager",
      "office lead",
      "firm administrator",
      "law firm administrator",
      "legal administrator",
      "practice administrator (law)",
    ],
    [
      "post_payments",
      "prepare_deposit",
      "post_adjustments",
      "create_vendor",
      "enter_invoices",
      "release_payment",
      "enter_payroll",
      "pms_admin_roles",
      "view_reports_only",
    ],
    "In a small office the office manager records payments, makes the deposit, pays the bills, runs payroll, and administers the system: the arrangement behind most cases in the library. In a dental or medical office they usually reconcile the bank as well. Untick what someone else does.",
    "43-1011",
  ),
  entry(
    "store-manager",
    "Store / Branch Manager",
    "retail",
    [
      "store manager",
      "retail manager",
      "shop manager",
      "branch manager",
      "assistant store manager",
      "department manager",
      "location manager",
    ],
    [
      "collect_cash",
      "prepare_deposit",
      "issue_refunds",
      "approve_writeoffs",
      "order_supplies",
      "receive_goods",
      "enter_payroll",
      "manage_user_access",
      "view_reports_only",
    ],
    "A store manager takes and banks cash, approves returns and markdowns, orders and receives stock, submits hours, and holds the register's override.",
  ),
  entry(
    "restaurant-manager",
    "Restaurant / Assistant Manager",
    "food",
    [
      "restaurant manager",
      "assistant manager",
      "assistant general manager",
      "agm",
      "dining room manager",
      "floor manager",
      "front of house manager",
      "foh manager",
      "front-of-house manager",
      "asst manager",
      "asst mgr",
      "assistant mgr",
      "foh mgr",
    ],
    [
      "collect_cash",
      "prepare_deposit",
      "issue_refunds",
      "approve_writeoffs",
      "enter_payroll",
      "order_supplies",
      "receive_goods",
      "view_reports_only",
    ],
    "A restaurant manager closes the drawer, makes the deposit, approves voids and comps, submits timecards, and orders and receives goods.",
  ),
  entry(
    "shift-lead",
    "Shift Lead / Key Holder",
    "retail",
    [
      "shift lead",
      "shift leader",
      "shift supervisor",
      "shift manager",
      "key holder",
      "keyholder",
      "lead cashier",
      "head cashier",
      "team lead",
      "team leader",
      "floor supervisor",
      "crew lead",
      "crew leader",
      "night manager",
      "closing manager",
      "opening manager",
      "opening supervisor",
      "closing supervisor",
      "store lead",
    ],
    ["collect_cash", "prepare_deposit", "issue_refunds", "view_reports_only"],
    "A shift lead takes cash, counts and bags the drawer, and can process a refund without a manager present.",
  ),

  // Finance and accounting
  entry(
    "controller",
    "Controller / Finance Manager",
    "finance",
    [
      "controller",
      "comptroller",
      "finance manager",
      "finance director",
      "director of finance",
      "cfo",
      "chief financial officer",
      "fractional cfo",
      "vp finance",
      "vp of finance",
      "accounting manager",
      "head of finance",
      "assistant controller",
      "accounting supervisor",
    ],
    [
      "release_payment",
      "bank_reconcile",
      "post_journal_entries",
      "sign_checks",
      "review_audit_logs",
      "view_reports_only",
    ],
    "A controller releases payments, signs, posts journal entries, and reconciles the bank: a wide seat that the case library shows needs an owner reading the statement. Approving payroll and new suppliers stays with the owner in a small business; add them if your controller does it.",
    "11-3031",
  ),
  entry(
    "accountant",
    "Accountant",
    "finance",
    [
      "accountant",
      "staff accountant",
      "senior accountant",
      "general ledger accountant",
      "gl accountant",
      "cpa",
      "certified public accountant",
      "cost accountant",
      "tax accountant",
      "accounting analyst",
      "financial analyst",
      "acct",
      "reconciliation specialist",
      "reconciliation clerk",
      "bank reconciliation specialist",
      "reconciliation analyst",
      "property accountant",
      "grants accountant",
      "trust accountant",
    ],
    [
      "post_journal_entries",
      "bank_reconcile",
      "post_adjustments",
      "enter_invoices",
      "view_reports_only",
    ],
    "An accountant posts entries and reconciles; whether the same person also pays is the question the map answers.",
    "13-2011",
  ),
  entry(
    "bookkeeper",
    "Bookkeeper",
    "finance",
    [
      "bookkeeper",
      "full charge bookkeeper",
      "full-charge bookkeeper",
      "accounting clerk",
      "accounting assistant",
      "accounting specialist",
      "accounting associate",
      "accounting coordinator",
      "junior accountant",
      "finance assistant",
      "finance coordinator",
      "finance clerk",
      "accounting",
    ],
    [
      "post_payments",
      "enter_invoices",
      "release_payment",
      "bank_reconcile",
      "enter_payroll",
      "post_journal_entries",
      "view_reports_only",
    ],
    "A full-charge bookkeeper in a small business records receipts, pays bills, runs payroll, and reconciles the bank, which is every side of the ledger in one seat.",
    "43-3031",
  ),
  entry(
    "accounts-payable",
    "Accounts Payable Specialist",
    "finance",
    [
      "accounts payable",
      "accounts payable specialist",
      "accounts payable clerk",
      "accounts payable coordinator",
      "accounts payable analyst",
      "ap specialist",
      "ap clerk",
      "ap coordinator",
      "ap analyst",
      "payables clerk",
      "payables specialist",
      "disbursements clerk",
      "ap",
      "ap manager",
      "accounts payable manager",
      "ap supervisor",
      "ap lead",
      "payables manager",
    ],
    ["enter_invoices", "create_vendor", "release_payment", "view_reports_only"],
    "Accounts payable enters invoices, sets up suppliers, and prepares or releases payment; the shell-vendor cases run through this seat.",
    "43-3031",
  ),
  entry(
    "accounts-receivable",
    "Accounts Receivable / Collections",
    "finance",
    [
      "accounts receivable",
      "accounts receivable specialist",
      "accounts receivable clerk",
      "accounts receivable coordinator",
      "ar specialist",
      "ar clerk",
      "ar coordinator",
      "collections specialist",
      "collections",
      "collector",
      "credit and collections",
      "credit analyst",
      "ar",
      "ar manager",
      "accounts receivable manager",
      "credit manager",
      "collections manager",
      "credit and collections manager",
      "cash applications",
      "cash applications specialist",
      "cash application specialist",
      "cash poster",
      "cash posting clerk",
    ],
    ["post_payments", "post_adjustments", "issue_refunds", "view_reports_only"],
    "Receivables posts what customers pay and adjusts what they owe, which is where lapping and write-off cover happen.",
    "43-3031",
  ),
  entry(
    "billing",
    "Billing Specialist",
    "finance",
    [
      "billing specialist",
      "billing coordinator",
      "billing clerk",
      "billing",
      "biller",
      "medical biller",
      "dental biller",
      "revenue cycle specialist",
      "revenue cycle",
      "claims specialist",
      "claims processor",
      "posting clerk",
      "external billing service",
      "billing service",
    ],
    ["submit_claims", "post_payments", "post_adjustments", "view_reports_only"],
    "Billing submits claims or invoices, posts what comes back, and writes off the difference.",
    "43-3021",
  ),
  entry(
    "payroll",
    "Payroll Administrator",
    "finance",
    [
      "payroll administrator",
      "payroll specialist",
      "payroll clerk",
      "payroll coordinator",
      "payroll manager",
      "payroll",
      "payroll and benefits",
      "payroll and benefits administrator",
      "timekeeping clerk",
      "timekeeper",
    ],
    ["enter_payroll", "edit_payroll_master", "view_reports_only"],
    "Payroll enters hours and usually also maintains the employee records the run reads from; the ghost-employee cases need both.",
    "43-3051",
  ),
  entry(
    "treasurer",
    "Treasurer / Cash Manager",
    "finance",
    ["treasurer", "cash manager", "treasury analyst", "treasury"],
    ["sign_checks", "initiate_ach", "bank_reconcile", "view_reports_only"],
    "A treasurer moves the money out and, in a small organisation, often reconciles the account it leaves from.",
  ),
  entry(
    "purchasing",
    "Purchasing / Procurement",
    "finance",
    [
      "purchasing agent",
      "purchasing",
      "buyer",
      "purchasing manager",
      "purchasing coordinator",
      "procurement specialist",
      "procurement manager",
      "procurement",
      "supply chain coordinator",
      "supply chain manager",
      "materials manager",
      "sourcing specialist",
      "procurement coordinator",
    ],
    ["order_supplies", "create_vendor", "approve_vendor", "view_reports_only"],
    "Purchasing chooses and sets up suppliers and places the orders; kickback and shell-vendor cases start here.",
  ),
  entry(
    "receiving",
    "Receiving / Inventory / Warehouse",
    "trades",
    [
      "receiving clerk",
      "receiving",
      "shipping and receiving",
      "shipping/receiving",
      "shipping clerk",
      "inventory clerk",
      "inventory specialist",
      "inventory manager",
      "inventory control",
      "warehouse associate",
      "warehouse worker",
      "warehouse supervisor",
      "warehouse manager",
      "warehouse lead",
      "stock clerk",
      "stocker",
      "materials handler",
      "logistics coordinator",
      "inventory lead",
      "yard manager",
      "yard foreman",
      "yard worker",
      "stock associate",
      "warehouse",
      "stockroom associate",
      "parts runner",
    ],
    ["receive_goods", "view_reports_only"],
    "Receiving confirms what arrived, which is the check on purchasing; a supervisor here also often approves hours.",
  ),

  // Front office and administration
  entry(
    "receptionist",
    "Receptionist / Front Desk",
    "office",
    [
      "receptionist",
      "front desk",
      "front desk coordinator",
      "front desk receptionist",
      "front desk associate",
      "front office coordinator",
      "front office",
      "patient coordinator",
      "scheduling coordinator",
      "scheduler",
      "appointment coordinator",
      "information clerk",
      "greeter",
      "concierge",
      "scheduling manager",
      "hygiene coordinator",
      "front desk lead",
      "front desk supervisor",
      "front office supervisor",
    ],
    ["collect_cash", "post_payments", "edit_patient_master", "view_reports_only"],
    "The front desk takes payments, posts them, and edits customer or patient records: the skimming cases begin at this desk.",
    "43-4171",
  ),
  entry(
    "administrative-assistant",
    "Administrative Assistant",
    "office",
    [
      "administrative assistant",
      "admin assistant",
      "admin",
      "office assistant",
      "office clerk",
      "clerk",
      "secretary",
      "administrative coordinator",
      "administrative specialist",
      "office coordinator",
      "administrative support",
      "office support",
      "data entry",
      "data entry clerk",
      "business assistant",
    ],
    ["order_supplies", "view_reports_only"],
    "An administrative assistant orders supplies and handles paperwork; tick more if they also take payments or pay bills.",
  ),
  entry(
    "executive-assistant",
    "Executive Assistant",
    "office",
    [
      "executive assistant",
      "assistant to the ceo",
      "assistant to the owner",
      "owner assistant",
      "ceo assistant",
      "chief of staff",
      "personal assistant",
      "executive administrative assistant",
    ],
    ["enter_invoices", "release_payment", "view_reports_only"],
    "An executive assistant often holds the owner's card and pays the owner's bills, with the owner's trust standing in for review.",
  ),
  entry(
    "insurance-coordinator",
    "Insurance / Benefits Coordinator",
    "office",
    [
      "insurance coordinator",
      "insurance verification",
      "insurance verification specialist",
      "insurance specialist",
      "benefits coordinator",
      "claims coordinator",
      "eligibility specialist",
      "prior authorization specialist",
      "authorization coordinator",
    ],
    ["submit_claims", "post_adjustments", "view_reports_only"],
    "An insurance coordinator submits claims and adjusts balances when the payer pays less than billed.",
  ),
  entry(
    "treatment-coordinator",
    "Treatment / Financial Coordinator",
    "office",
    [
      "treatment coordinator",
      "treatment plan coordinator",
      "patient care coordinator",
      "care coordinator",
      "case coordinator",
      "financial coordinator",
      "patient financial coordinator",
      "new patient coordinator",
    ],
    ["edit_patient_master", "post_adjustments", "collect_cash", "view_reports_only"],
    "A treatment coordinator presents fees, takes the payment, and adjusts the plan, which touches the record and the money together.",
  ),

  // Sales and customer service
  entry(
    "customer-service",
    "Customer Service Representative",
    "sales",
    [
      "customer service representative",
      "customer service rep",
      "customer service",
      "csr",
      "customer support",
      "customer support representative",
      "support specialist",
      "client services",
      "client service representative",
      "client services coordinator",
      "member services",
      "call center agent",
      "call center representative",
      "account coordinator",
    ],
    ["issue_refunds", "post_adjustments", "edit_patient_master", "view_reports_only"],
    "Customer service issues refunds and credits and edits customer records; refund fraud runs through this seat.",
    "43-4051",
  ),
  entry(
    "sales",
    "Sales / Account Manager",
    "sales",
    [
      "sales manager",
      "sales director",
      "director of sales",
      "account executive",
      "account manager",
      "account representative",
      "sales representative",
      "sales rep",
      "sales",
      "salesperson",
      "business development",
      "business development manager",
      "bdm",
      "inside sales",
      "outside sales",
      "sales consultant",
      "head of sales",
      "used car manager",
      "new car manager",
      "sales lead",
      "comfort advisor",
    ],
    ["approve_writeoffs", "edit_patient_master", "view_reports_only"],
    "Sales grants discounts and credits and maintains customer accounts; whether sales can also record payments decides the risk.",
  ),
  entry(
    "cashier",
    "Cashier / Sales Associate",
    "retail",
    [
      "cashier",
      "checkout",
      "checker",
      "teller",
      "sales associate",
      "retail associate",
      "store associate",
      "sales clerk",
      "retail sales",
      "counter staff",
      "counter associate",
      "customer service associate",
      "front end associate",
      "register",
      "counter sales",
      "sales floor associate",
      "grocery associate",
      "deli associate",
      "floor associate",
    ],
    ["collect_cash", "view_reports_only"],
    "A cashier takes payment; the controls are the count, the deposit, and who can void or refund.",
    "41-2011",
  ),

  // Clinical and patient care
  entry(
    "provider",
    "Provider (dentist, physician, practitioner)",
    "clinical",
    [
      "dentist",
      "associate dentist",
      "doctor",
      "physician",
      "provider",
      "dds",
      "dmd",
      "md",
      "do",
      "nurse practitioner",
      "np",
      "physician assistant",
      "pa",
      "veterinarian",
      "dvm",
      "chiropractor",
      "optometrist",
      "therapist",
      "psychologist",
      "orthodontist",
      "periodontist",
      "oral surgeon",
      "pa c",
      "physical therapist",
      "occupational therapist",
      "speech therapist",
    ],
    ["view_reports_only"],
    "An employed provider treats patients and stays out of the money: billing, adjustments, and write-off approval belong to the office and the owner. Tick write-off approval if this provider owns the practice or grants courtesy discounts.",
  ),
  entry(
    "dental-hygienist",
    "Dental Hygienist",
    "clinical",
    ["dental hygienist", "hygienist", "rdh", "registered dental hygienist"],
    ["view_reports_only"],
    "A hygienist holds no money duty; they appear on the map for continuity, not conflicts.",
    "29-1292",
  ),
  entry(
    "dental-assistant",
    "Dental Assistant",
    "clinical",
    [
      "dental assistant",
      "da",
      "rda",
      "eda",
      "efda",
      "registered dental assistant",
      "expanded functions dental assistant",
      "sterilization technician",
      "sterilization tech",
      "cda",
      "certified dental assistant",
      "assistant dental",
    ],
    ["view_reports_only"],
    "A dental assistant holds no money duty; they appear on the map for continuity, not conflicts.",
    "31-9091",
  ),
  entry(
    "medical-assistant",
    "Medical Assistant / Nurse / Technician",
    "clinical",
    [
      "medical assistant",
      "ma",
      "cma",
      "rma",
      "clinical assistant",
      "nurse",
      "rn",
      "lpn",
      "lvn",
      "registered nurse",
      "licensed practical nurse",
      "lab technician",
      "lab tech",
      "vet tech",
      "veterinary technician",
      "veterinary assistant",
      "phlebotomist",
      "radiology technician",
      "x-ray technician",
      "physical therapist assistant",
      "pta",
      "optician",
      "cna",
      "certified nursing assistant",
      "nursing supervisor",
      "nurse supervisor",
      "charge nurse",
      "head nurse",
      "assistant medical",
    ],
    ["edit_patient_master", "view_reports_only"],
    "Clinical staff update the chart and demographics but should not touch payments or claims.",
  ),
  entry(
    "medical-secretary",
    "Medical Office Specialist",
    "clinical",
    [
      "medical secretary",
      "medical office assistant",
      "medical office specialist",
      "medical receptionist",
      "patient services representative",
      "patient service representative",
      "patient access representative",
      "patient access",
      "patient registrar",
      "registrar",
      "unit clerk",
      "health unit coordinator",
      "medical records clerk",
      "medical records specialist",
      "health information technician",
    ],
    ["collect_cash", "post_payments", "edit_patient_master", "submit_claims", "view_reports_only"],
    "A medical office specialist takes copays, posts them, edits the patient record, and often files the claim.",
    "43-6013",
  ),
  entry(
    "clinic-director",
    "Clinic / Practice Director",
    "clinical",
    [
      "clinical director",
      "director of nursing",
      "practice director",
      "medical director",
      "director of clinical operations",
      "nurse manager",
      "clinical manager",
    ],
    ["approve_vendor", "approve_writeoffs", "manage_user_access", "view_reports_only"],
    "A clinical director approves suppliers and write-offs and decides who has system access.",
  ),

  // Restaurant and food service
  entry(
    "chef",
    "Chef / Kitchen Manager",
    "food",
    [
      "executive chef",
      "head chef",
      "chef",
      "kitchen manager",
      "sous chef",
      "chef de cuisine",
      "head cook",
      "pastry chef",
      "back of house manager",
      "boh manager",
      "kitchen lead",
      "kitchen supervisor",
      "chef de partie",
      "station chef",
      "boh lead",
    ],
    ["order_supplies", "receive_goods", "view_reports_only"],
    "The kitchen orders food and receives the delivery, so the check on the supplier is the same person who chose it.",
  ),
  entry(
    "server",
    "Server / Host",
    "food",
    [
      "server",
      "waiter",
      "waitress",
      "wait staff",
      "waitstaff",
      "food server",
      "host",
      "hostess",
      "busser",
      "barista",
      "counter server",
      "food runner",
      "runner",
      "catering server",
      "banquet server",
    ],
    ["collect_cash", "view_reports_only"],
    "A server takes payment at the table; the controls are the closed check, the tip-out, and who can void.",
    "35-3031",
  ),
  entry(
    "bartender",
    "Bartender",
    "food",
    ["bartender", "barback", "mixologist", "bar staff", "bar lead", "bar back"],
    ["collect_cash", "view_reports_only"],
    "A bartender takes cash all night; the control is the pour count and the drawer count.",
    "35-3011",
  ),
  entry(
    "bar-manager",
    "Bar / Beverage Manager",
    "food",
    ["bar manager", "beverage manager", "beverage director", "sommelier", "wine director"],
    ["collect_cash", "prepare_deposit", "order_supplies", "receive_goods", "view_reports_only"],
    "A bar manager orders and receives liquor and closes the bar drawer; inventory theft and skimming share the seat.",
  ),

  // Trades, field, and construction
  entry(
    "estimator",
    "Estimator",
    "trades",
    ["estimator", "cost estimator", "project estimator", "sales estimator", "estimating"],
    ["change_fee_schedule", "view_reports_only"],
    "An estimator sets the price and the discount on each bid; writing off what a customer owes belongs to someone else.",
  ),
  entry(
    "dispatcher",
    "Dispatcher / Service Coordinator",
    "trades",
    [
      "dispatcher",
      "dispatch",
      "service coordinator",
      "service dispatcher",
      "scheduling dispatcher",
      "fleet coordinator",
      "dispatcher csr",
      "csr dispatcher",
    ],
    ["edit_patient_master", "collect_cash", "view_reports_only"],
    "A dispatcher, or the CSR who books and dispatches the calls, maintains customer records and takes phone payments; refunds and credits go to the office. The field cases where a tech and dispatcher split a cash job start here.",
  ),
  entry(
    "field-technician",
    "Field Technician / Crew",
    "trades",
    [
      "field technician",
      "service technician",
      "service tech",
      "installer",
      "crew member",
      "laborer",
      "labourer",
      "apprentice",
      "journeyman",
      "plumber",
      "electrician",
      "hvac technician",
      "hvac tech",
      "operator",
      "equipment operator",
      "carpenter",
      "painter",
      "roofer",
      "install technician",
      "installation technician",
      "hvac install technician",
      "pipefitter",
      "helper",
      "trade helper",
      "apprentice technician",
    ],
    ["collect_cash", "view_reports_only"],
    "A technician who collects at the job holds cash the office never sees until it is deposited.",
  ),
  entry(
    "foreman",
    "Foreman / Superintendent",
    "trades",
    [
      "foreman",
      "superintendent",
      "site supervisor",
      "site manager",
      "construction manager",
      "project superintendent",
      "lead technician",
      "lead tech",
      "field supervisor",
      "operations supervisor",
      "production supervisor",
      "production manager",
      "crew chief",
      "crew foreman",
      "install manager",
      "installation manager",
    ],
    ["receive_goods", "order_supplies", "view_reports_only"],
    "A foreman orders and receives material and signs off the crew's timesheets, which the office then enters into payroll: the ghost-timesheet cases run through this seat.",
  ),

  // IT and systems
  entry(
    "it-administrator",
    "IT Administrator",
    "it",
    [
      "it administrator",
      "systems administrator",
      "system administrator",
      "sysadmin",
      "it manager",
      "it director",
      "network administrator",
      "it support",
      "it support specialist",
      "help desk",
      "helpdesk",
      "it specialist",
      "it technician",
      "managed service provider",
      "msp",
      "cto",
      "chief technology officer",
      "it",
      "information technology",
      "database administrator",
      "dba",
      "i t",
      "i t manager",
      "i t director",
      "i t support",
      "desktop support",
      "it support technician",
      "systems engineer",
    ],
    [
      "pms_admin_roles",
      "manage_user_access",
      "manage_backups",
      "export_bulk_data",
      "review_audit_logs",
      "view_reports_only",
    ],
    "IT administers the system, grants access, holds the backups, and can export everything; the data-theft and data-destruction cases sit here.",
  ),

  // Human resources
  entry(
    "hr",
    "Human Resources",
    "people",
    [
      "hr generalist",
      "hr manager",
      "hr director",
      "human resources",
      "human resources manager",
      "human resources generalist",
      "hr specialist",
      "hr coordinator",
      "hr administrator",
      "hr assistant",
      "hr",
      "people operations",
      "people ops",
      "people manager",
      "hr business partner",
      "hrbp",
      "recruiter",
      "talent acquisition",
      "benefits administrator",
      "benefits manager",
      "people and culture manager",
      "people and culture",
      "talent manager",
      "hr and payroll administrator",
    ],
    ["edit_payroll_master", "view_reports_only"],
    "HR adds employees and changes pay rates and bank details; the check is that someone else runs the payroll that reads them.",
  ),

  // Legal
  entry(
    "paralegal",
    "Paralegal / Legal Assistant",
    "legal",
    [
      "paralegal",
      "legal assistant",
      "legal secretary",
      "law clerk",
      "litigation assistant",
      "litigation paralegal",
      "legal administrative assistant",
      "intake specialist",
      "intake coordinator",
    ],
    ["enter_invoices", "post_payments", "view_reports_only"],
    "A paralegal enters the bill and posts the client's payment; trust-account handling needs its own line if they hold it.",
  ),
  entry(
    "attorney",
    "Attorney",
    "legal",
    [
      "attorney",
      "lawyer",
      "associate attorney",
      "counsel",
      "of counsel",
      "senior associate",
      "general counsel",
      "solicitor",
    ],
    ["approve_writeoffs", "view_reports_only"],
    "An attorney approves write-downs on their own matters; billing and trust deposits belong to someone else.",
  ),

  // Professional and project staff
  entry(
    "project-manager",
    "Project Manager",
    "professional",
    [
      "project manager",
      "pm",
      "project coordinator",
      "program manager",
      "project lead",
      "account director",
      "delivery manager",
      "engagement manager",
    ],
    ["view_reports_only"],
    "A project manager approves subcontractor invoices and change orders against the job budget, which no duty here names; entering the bills, paying them, and approving new suppliers belong to the office and the owner. Add ordering supplies and services if they place the orders.",
  ),
  entry(
    "consultant",
    "Consultant / Engineer / Analyst",
    "professional",
    [
      "consultant",
      "senior consultant",
      "engineer",
      "software engineer",
      "developer",
      "designer",
      "analyst",
      "architect",
      "specialist",
      "advisor",
      "adviser",
      "associate consultant",
      "trainer",
      "instructor",
      "coach",
      "stylist",
      "esthetician",
      "massage therapist",
      "tech lead",
      "technical lead",
      "engineering lead",
      "dev lead",
      "development lead",
      "design lead",
      "product manager",
      "product owner",
      "scrum master",
      "qa lead",
      "nail technician",
    ],
    ["view_reports_only"],
    "Fee-earning staff usually hold no money duty; tick collect payment if they take it at the chair or the desk.",
  ),
  // Hotels and hospitality
  entry(
    "hotel-front-desk",
    "Hotel Front Desk Agent",
    "hospitality",
    [
      "hotel front desk",
      "front desk agent",
      "desk clerk",
      "guest services agent",
      "guest service agent",
      "guest services representative",
      "guest service representative",
      "reservations agent",
      "reservationist",
      "reservations",
    ],
    ["collect_cash", "post_payments", "issue_refunds", "edit_patient_master", "view_reports_only"],
    "A desk agent takes payment, posts it to the folio, adjusts the folio, and can refund; the folio is the record and the money together.",
    "43-4081",
  ),
  entry(
    "night-auditor",
    "Night Auditor",
    "hospitality",
    ["night auditor", "night audit", "night audit clerk", "overnight front desk"],
    ["post_payments", "post_adjustments", "bank_reconcile", "view_reports_only"],
    "The night auditor posts the day's charges and balances them, alone and overnight: the one seat that both writes the day's record and checks it.",
  ),
  entry(
    "housekeeping-supervisor",
    "Housekeeping Supervisor",
    "hospitality",
    [
      "housekeeping supervisor",
      "executive housekeeper",
      "housekeeping manager",
      "head housekeeper",
      "janitorial supervisor",
      "custodial supervisor",
    ],
    ["order_supplies", "enter_payroll", "view_reports_only"],
    "Housekeeping orders supplies and submits the crew's hours; the check is that someone else approves the run.",
    "37-1011",
  ),
  entry(
    "hotel-manager",
    "Hotel / Lodging Manager",
    "hospitality",
    [
      "hotel manager",
      "lodging manager",
      "resort manager",
      "innkeeper",
      "hospitality manager",
      "rooms division manager",
      "guest services manager",
      "front office manager (hotel)",
    ],
    [
      "approve_writeoffs",
      "issue_refunds",
      "prepare_deposit",
      "approve_vendor",
      "enter_payroll",
      "manage_user_access",
      "view_reports_only",
    ],
    "A lodging manager approves rate adjustments and refunds, banks the deposit, approves suppliers, and holds the property system's admin.",
  ),

  // Auto dealership and service
  entry(
    "service-advisor",
    "Service Advisor / Writer",
    "automotive",
    ["service advisor", "service writer", "service consultant", "shop advisor"],
    [
      "collect_cash",
      "post_adjustments",
      "approve_writeoffs",
      "edit_patient_master",
      "view_reports_only",
    ],
    "A service advisor writes the repair order, adjusts it, grants goodwill, and takes the customer's payment at the counter.",
  ),
  entry(
    "parts",
    "Parts Manager / Counter",
    "automotive",
    [
      "parts manager",
      "parts counter",
      "parts specialist",
      "parts advisor",
      "parts clerk",
      "parts associate",
      "parts counterperson",
      "counterperson",
      "parts counter person",
      "parts sales",
    ],
    ["order_supplies", "receive_goods", "collect_cash", "view_reports_only"],
    "Parts orders stock, receives it, and sells it over the counter, which is ordering, receiving, and cash in one seat.",
  ),
  entry(
    "fi-manager",
    "Finance and Insurance Manager",
    "automotive",
    [
      "f&i manager",
      "f and i manager",
      "finance and insurance manager",
      "finance & insurance manager",
      "f&i",
      "dealership finance manager",
    ],
    ["collect_cash", "approve_writeoffs", "edit_patient_master", "view_reports_only"],
    "The F&I office takes down payments, structures the deal, and adjusts what the customer pays; the deal jacket is the control.",
  ),
  entry(
    "title-clerk",
    "Title / Deal Clerk",
    "automotive",
    [
      "title clerk",
      "deal clerk",
      "dmv clerk",
      "tag and title clerk",
      "deal processor",
      "title and registration clerk",
      "title registration clerk",
      "registration clerk",
      "tag and title",
    ],
    ["post_payments", "post_adjustments", "view_reports_only"],
    "A title clerk posts the deal and its adjustments after the sale; the money has usually moved before the record is written.",
  ),

  // Property and real estate
  entry(
    "property-manager",
    "Property Manager",
    "property",
    [
      "property manager",
      "community manager",
      "community association manager",
      "association manager",
      "hoa manager",
      "apartment manager",
      "leasing manager",
      "portfolio manager",
      "asset manager",
    ],
    [
      "collect_cash",
      "post_payments",
      "approve_vendor",
      "release_payment",
      "approve_writeoffs",
      "view_reports_only",
    ],
    "A property manager collects rent, posts it, chooses and pays the contractors, and writes off balances: custody, recording, and approval in one seat.",
  ),
  entry(
    "leasing-agent",
    "Leasing Agent",
    "property",
    [
      "leasing agent",
      "leasing consultant",
      "leasing specialist",
      "rental agent",
      "leasing associate",
    ],
    ["collect_cash", "edit_patient_master", "view_reports_only"],
    "A leasing agent takes deposits and application fees and sets up the tenant record.",
  ),
  entry(
    "real-estate-agent",
    "Real Estate Agent / Broker",
    "property",
    [
      "real estate agent",
      "realtor",
      "real estate broker",
      "real estate salesperson",
      "listing agent",
      "buyer's agent",
    ],
    ["collect_cash", "view_reports_only"],
    "An agent handles earnest money and fees on the way to escrow; the control is that deposits go to the trust account the same day.",
    "41-9022",
  ),
  entry(
    "transaction-coordinator",
    "Transaction / Closing Coordinator",
    "property",
    [
      "transaction coordinator",
      "closing coordinator",
      "escrow assistant",
      "escrow officer",
      "closing agent",
      "settlement agent",
      "escrow manager",
    ],
    ["post_payments", "edit_patient_master", "view_reports_only"],
    "A closing coordinator records the funds that move through a transaction and maintains the parties' records.",
  ),

  // Nonprofit and association
  entry(
    "executive-director",
    "Executive Director",
    "nonprofit",
    [
      "executive director",
      "ed",
      "nonprofit director",
      "association executive",
      "chief executive (nonprofit)",
    ],
    [
      "approve_vendor",
      "approve_payroll",
      "approve_writeoffs",
      "sign_checks",
      "manage_user_access",
      "view_reports_only",
    ],
    "An executive director approves suppliers, payroll, and write-offs and signs; a board treasurer who reads the statement is the check.",
  ),
  entry(
    "development-director",
    "Development / Fundraising",
    "nonprofit",
    [
      "development director",
      "director of development",
      "fundraising manager",
      "fundraiser",
      "development coordinator",
      "development associate",
      "donor relations",
      "advancement director",
      "major gifts officer",
      "membership coordinator",
      "membership manager",
    ],
    ["collect_cash", "edit_patient_master", "view_reports_only"],
    "Development receives gifts and maintains donor records; a gift that reaches the donor database but not the bank is the case pattern.",
  ),
  entry(
    "grants-manager",
    "Grants Manager",
    "nonprofit",
    [
      "grants manager",
      "grant writer",
      "grants coordinator",
      "grant administrator",
      "grants administrator",
      "grant manager",
    ],
    ["submit_claims", "view_reports_only"],
    "A grants manager bills funders for reimbursement, which is a claim against a payer.",
  ),
  entry(
    "board-treasurer",
    "Board Treasurer",
    "nonprofit",
    ["board treasurer", "volunteer treasurer", "finance committee chair"],
    ["sign_checks", "bank_reconcile", "approve_payroll", "view_reports_only"],
    "A volunteer treasurer signs and reads the statement; when the treasurer also keeps the books there is no second reader.",
  ),
  entry(
    "volunteer-coordinator",
    "Volunteer / Program Coordinator",
    "nonprofit",
    [
      "volunteer coordinator",
      "volunteer manager",
      "outreach coordinator",
      "community coordinator",
      "program coordinator",
      "program assistant",
      "case worker",
      "social worker",
    ],
    ["view_reports_only"],
    "Program staff hold no money duty; they appear on the map for continuity.",
  ),

  // Marketing and communications
  entry(
    "marketing",
    "Marketing / Communications",
    "marketing",
    [
      "marketing manager",
      "marketing director",
      "director of marketing",
      "marketing coordinator",
      "marketing specialist",
      "marketing",
      "marketing associate",
      "social media manager",
      "social media coordinator",
      "content manager",
      "communications manager",
      "communications director",
      "communications coordinator",
      "digital marketing manager",
      "brand manager",
      "cmo",
      "chief marketing officer",
      "public relations",
      "pr manager",
      "community manager social media",
      "social media community manager",
      "online community manager",
      "community engagement manager",
    ],
    ["order_supplies", "view_reports_only"],
    "Marketing buys agency, print, and ad-platform services, often on a card the owner never itemises; entering and paying the bills belong to the office.",
    "11-2021",
  ),

  // Insurance, tax, lending
  entry(
    "insurance-agent",
    "Insurance Agent / Producer",
    "sales",
    [
      "insurance agent",
      "insurance producer",
      "producer",
      "insurance broker",
      "agency owner",
      "insurance account manager",
      "insurance csr",
    ],
    ["collect_cash", "edit_patient_master", "view_reports_only"],
    "An agent takes premiums and maintains the policyholder record; premium diversion is the case pattern.",
    "41-3021",
  ),
  entry(
    "tax-preparer",
    "Tax Preparer",
    "finance",
    [
      "tax preparer",
      "tax professional",
      "tax associate",
      "tax senior",
      "enrolled agent",
      "tax advisor",
    ],
    ["collect_cash", "view_reports_only"],
    "A preparer takes the client's fee; the refund itself should never pass through the firm.",
    "13-2082",
  ),
  entry(
    "auditor",
    "Auditor",
    "finance",
    [
      "auditor",
      "staff auditor",
      "audit senior",
      "audit associate",
      "internal auditor",
      "audit manager",
    ],
    ["review_audit_logs", "view_reports_only"],
    "An auditor reads the logs and the records and should hold no transaction duty.",
  ),
  entry(
    "loan-officer",
    "Loan Officer / Processor",
    "finance",
    [
      "loan officer",
      "mortgage loan officer",
      "loan processor",
      "underwriter",
      "credit officer",
      "lending officer",
      "mortgage broker",
    ],
    ["edit_patient_master", "view_reports_only"],
    "Lending staff maintain the borrower record; funding and disbursement belong to someone else.",
  ),

  // Pharmacy and health administration
  entry(
    "pharmacist",
    "Pharmacist",
    "clinical",
    ["pharmacist", "pharmacy manager", "pharmacist in charge", "pic", "clinical pharmacist"],
    ["order_supplies", "receive_goods", "approve_writeoffs", "view_reports_only"],
    "The pharmacist orders stock, receives it, and approves adjustments; controlled-substance counts are the added control.",
  ),
  entry(
    "pharmacy-technician",
    "Pharmacy Technician",
    "clinical",
    [
      "pharmacy technician",
      "pharmacy tech",
      "cpht",
      "pharmacy clerk",
      "pharmacy assistant",
      "pharmacy cashier",
    ],
    ["collect_cash", "submit_claims", "receive_goods", "view_reports_only"],
    "A technician rings the sale, adjudicates the claim, and often checks in the order.",
  ),
  entry(
    "medical-coder",
    "Medical Coder",
    "clinical",
    [
      "medical coder",
      "coder",
      "coding specialist",
      "cpc",
      "certified professional coder",
      "medical records coder",
    ],
    ["submit_claims", "post_adjustments", "view_reports_only"],
    "A coder decides what is billed and adjusts what was denied.",
  ),
  entry(
    "billing-manager",
    "Billing / Revenue Cycle Manager",
    "clinical",
    [
      "billing manager",
      "revenue cycle manager",
      "patient accounts manager",
      "business office manager (medical)",
    ],
    [
      "submit_claims",
      "post_payments",
      "post_adjustments",
      "approve_writeoffs",
      "issue_refunds",
      "view_reports_only",
    ],
    "A billing manager bills, posts, adjusts, writes off, and refunds: the whole receivable in one seat.",
  ),
  entry(
    "credentialing",
    "Credentialing / Provider Enrollment",
    "clinical",
    [
      "credentialing specialist",
      "credentialing coordinator",
      "provider enrollment specialist",
      "provider enrollment",
      "credentialing",
    ],
    ["view_reports_only"],
    "Credentialing keeps providers enrolled with payers and holds no money duty.",
  ),

  // Education and childcare
  entry(
    "center-director",
    "Center / School Director",
    "education",
    [
      "center director",
      "childcare director",
      "daycare director",
      "preschool director",
      "school director",
      "head of school",
      "academy director",
      "site director",
      "school principal",
      "principal (school)",
      "assistant principal",
    ],
    [
      "collect_cash",
      "prepare_deposit",
      "approve_vendor",
      "enter_payroll",
      "manage_user_access",
      "view_reports_only",
    ],
    "A director takes tuition, makes the deposit, approves suppliers, and submits hours, usually with no one above them on site.",
  ),
  entry(
    "teacher",
    "Teacher / Caregiver",
    "education",
    [
      "teacher",
      "lead teacher",
      "assistant teacher",
      "teacher assistant",
      "teacher aide",
      "tutor",
      "childcare worker",
      "caregiver",
      "aide",
      "educator",
      "paraprofessional",
    ],
    ["view_reports_only"],
    "Teaching staff hold no money duty; they appear on the map for continuity.",
  ),

  // Field, fleet, projects, facilities
  entry(
    "driver",
    "Driver / Delivery",
    "trades",
    [
      "driver",
      "delivery driver",
      "truck driver",
      "cdl driver",
      "courier",
      "route driver",
      "route sales",
      "route salesperson",
      "delivery",
      "route sales rep",
      "route sales representative",
    ],
    ["collect_cash", "view_reports_only"],
    "A driver who collects on delivery holds cash and checks until the route settles.",
  ),
  entry(
    "fleet-manager",
    "Fleet / Logistics Manager",
    "trades",
    [
      "fleet manager",
      "transportation manager",
      "logistics manager",
      "dispatch manager",
      "distribution manager",
      "routing manager",
    ],
    ["approve_vendor", "order_supplies", "receive_goods", "enter_payroll", "view_reports_only"],
    "A fleet manager approves fuel, repair, and equipment suppliers and submits drivers' hours.",
  ),
  entry(
    "project-accountant",
    "Project / Job Cost Accountant",
    "finance",
    [
      "project accountant",
      "job cost accountant",
      "construction accountant",
      "job cost",
      "project controller",
      "billing accountant",
    ],
    [
      "post_journal_entries",
      "enter_invoices",
      "post_adjustments",
      "submit_claims",
      "view_reports_only",
    ],
    "A project accountant bills progress, enters subcontractor invoices, and posts the entries that move cost between jobs.",
  ),
  entry(
    "contracts-administrator",
    "Contracts Administrator",
    "professional",
    [
      "contracts administrator",
      "contract administrator",
      "contracts manager",
      "contract manager",
      "subcontract administrator",
      "procurement administrator",
    ],
    ["create_vendor", "approve_vendor", "enter_invoices", "view_reports_only"],
    "A contracts administrator sets up and approves subcontractors and enters their invoices against the contract.",
  ),
  entry(
    "compliance",
    "Compliance / Quality / Safety",
    "professional",
    [
      "compliance officer",
      "compliance manager",
      "compliance specialist",
      "risk manager",
      "quality manager",
      "quality assurance manager",
      "qa manager",
      "safety manager",
      "safety coordinator",
      "ehs manager",
      "privacy officer",
      "security officer (compliance)",
    ],
    ["review_audit_logs", "view_reports_only"],
    "Compliance reads the logs and tests the controls and should hold no transaction duty.",
  ),
  entry(
    "facilities",
    "Facilities / Maintenance Manager",
    "trades",
    [
      "facilities manager",
      "facility manager",
      "building manager",
      "maintenance manager",
      "maintenance supervisor",
      "plant engineer",
      "building engineer",
      "facilities coordinator",
      "maintenance coordinator",
      "maintenance scheduler",
    ],
    ["order_supplies", "receive_goods", "approve_vendor", "enter_invoices", "view_reports_only"],
    "Facilities chooses the contractors, orders the parts, confirms the work, and enters the invoice.",
  ),
  entry(
    "security",
    "Security / Loss Prevention",
    "retail",
    [
      "security guard",
      "security officer",
      "loss prevention",
      "loss prevention officer",
      "asset protection",
      "asset protection associate",
      "security",
    ],
    ["view_reports_only"],
    "Security watches the premises and the registers and holds no money duty of its own.",
    "33-9032",
  ),

  // Retail and restaurant additions
  entry(
    "ecommerce",
    "E-commerce / Fulfillment",
    "retail",
    [
      "e-commerce specialist",
      "ecommerce specialist",
      "ecommerce manager",
      "e-commerce manager",
      "online sales",
      "marketplace manager",
      "fulfillment associate",
      "fulfillment specialist",
      "order fulfillment",
      "fulfillment",
    ],
    ["issue_refunds", "post_adjustments", "view_reports_only"],
    "Online fulfilment issues refunds and credits against orders nobody else sees.",
  ),
  entry(
    "merchandiser",
    "Merchandiser / Category Manager",
    "retail",
    [
      "visual merchandiser",
      "merchandiser",
      "merchandising manager",
      "category manager",
      "planner",
      "allocator",
    ],
    ["order_supplies", "view_reports_only"],
    "A merchandiser decides what is bought; receiving and paying belong to others.",
  ),
  entry(
    "catering-manager",
    "Catering / Events Manager",
    "food",
    [
      "catering manager",
      "events manager",
      "event manager",
      "event coordinator",
      "banquet manager",
      "sales and catering",
      "catering sales",
      "private events",
    ],
    ["collect_cash", "post_adjustments", "approve_writeoffs", "view_reports_only"],
    "Events takes deposits, adjusts the bill, and comps: money and its record in one seat, usually off the main register.",
  ),
  entry(
    "kitchen-staff",
    "Kitchen Staff",
    "food",
    [
      "dishwasher",
      "kitchen staff",
      "kitchen assistant",
      "kitchen porter",
      "steward",
      "kitchen helper",
      "food prep",
      "prep",
      "expo",
      "expeditor",
      "food expeditor",
      "cook",
      "line cook",
      "prep cook",
      "cook line",
      "grill cook",
      "fry cook",
    ],
    ["view_reports_only"],
    "Kitchen staff hold no money duty; they appear on the map for continuity.",
  ),

  // General
  entry(
    "intern",
    "Intern / Volunteer",
    "professional",
    ["intern", "volunteer", "student worker", "work study", "co-op student", "apprentice (office)"],
    ["view_reports_only"],
    "An intern holds no money duty by default; tick anything they actually do.",
  ),
  entry(
    "cash-office",
    "Cash Office / Deposit Clerk",
    "retail",
    [
      "cash office",
      "cash office associate",
      "cash office clerk",
      "cash office lead",
      "cash room clerk",
      "cash room",
      "deposit clerk",
      "vault teller",
      "cash control clerk",
      "cash handler",
    ],
    ["collect_cash", "prepare_deposit", "view_reports_only"],
    "A cash-office clerk counts the drawers and makes up the deposit; whoever reconciles the bank account must be someone else.",
  ),
  entry(
    "custodial",
    "Cleaner / Custodian / Groundskeeper",
    "trades",
    [
      "cleaner",
      "custodian",
      "janitor",
      "janitorial",
      "groundskeeper",
      "landscaper",
      "maintenance",
      "maintenance worker",
      "maintenance technician",
      "maintenance tech",
      "porter",
      "building attendant",
    ],
    ["view_reports_only"],
    "Cleaning, grounds and maintenance staff hold no money duty by default; tick anything they actually do.",
  ),
  entry(
    "board-member",
    "Board Member / Trustee",
    "nonprofit",
    [
      "board member",
      "trustee",
      "director (board)",
      "board director",
      "board chair",
      "board president",
      "board secretary",
      "board vice chair",
    ],
    ["view_reports_only"],
    "A board member approves budgets and reads reports; signing, reconciling and approving payroll belong to the treasurer if a board member holds them.",
  ),
  entry(
    "service-manager",
    "Service Manager (repair, dealership)",
    "automotive",
    [
      "service manager",
      "service department manager",
      "fixed operations manager",
      "fixed ops manager",
      "service director",
    ],
    ["approve_writeoffs", "enter_payroll", "order_supplies", "receive_goods", "view_reports_only"],
    "A service manager approves goodwill and warranty write-offs, submits the technicians' hours, and orders and receives parts.",
  ),
  entry(
    "automotive-support",
    "Lot / Detail / BDC Staff",
    "automotive",
    [
      "detailer",
      "lot attendant",
      "lot porter",
      "bdc",
      "bdc representative",
      "bdc rep",
      "bdc agent",
      "business development center",
      "car washer",
    ],
    ["view_reports_only"],
    "Lot, detail and business-development-center staff hold no money duty by default; tick anything they actually do.",
  ),
  entry(
    "housekeeping-staff",
    "Housekeeping / Room Attendant",
    "hospitality",
    [
      "housekeeper",
      "room attendant",
      "housekeeping attendant",
      "housekeeping aide",
      "laundry attendant",
      "houseman",
      "houseperson",
      "housekeeping",
    ],
    ["view_reports_only"],
    "Housekeeping staff hold no money duty by default; tick anything they actually do.",
  ),
  entry(
    "shop-technician",
    "Shop / Automotive Technician",
    "automotive",
    [
      "shop technician",
      "automotive technician",
      "auto technician",
      "auto tech",
      "mechanic",
      "diesel technician",
      "lube technician",
      "tire technician",
      "master technician",
      "ase technician",
      "technician a",
      "technician b",
      "technician c",
      "line technician",
      "flat rate technician",
      "body technician",
      "collision technician",
    ],
    ["view_reports_only"],
    "A shop technician works the repair order; the advisor or cashier takes the money, so the technician holds no money duty by default.",
  ),
];

/**
 * The standard description of each job, in one plain sentence. Kept apart
 * from the entries so the whole set can be read and corrected in one place.
 * Where the entry carries a SOC code the sentence paraphrases the Bureau of
 * Labor Statistics definition; elsewhere it is this app's wording.
 */
const DESCRIPTIONS: Record<string, string> = {
  owner:
    "Owns the business, sets its policies, and holds final authority over spending, hiring, and pay.",
  "general-manager":
    "Plans, directs, and coordinates the operations of the business, including budgeting, purchasing, and staffing, without a single functional specialty.",
  "office-manager":
    "Supervises the office and administrative staff and, in a small business, runs the daily money work: payments, deposits, bills, and payroll.",
  "store-manager":
    "Supervises and coordinates the retail staff of a store or department, including purchasing, budgeting, and cash handling.",
  "restaurant-manager":
    "Runs the dining room and the shift: seats and serves guests, closes the register, approves voids, schedules staff, and orders stock.",
  "shift-lead":
    "Leads a shift or a station, opens and closes the register, and stands in for the manager when none is present.",
  controller:
    "Plans, directs, and coordinates the accounting, reporting, and banking of the business and prepares its financial statements.",
  accountant:
    "Examines, analyzes, and interprets accounting records, prepares financial statements, and posts the entries that keep the ledger true.",
  bookkeeper:
    "Computes, classifies, and records financial transactions, keeps the ledger, and in a small business also pays bills and runs payroll.",
  "accounts-payable":
    "Enters supplier invoices, sets up suppliers, matches invoices to orders and receipts, and prepares payments for release.",
  "accounts-receivable":
    "Records customer payments, follows up on unpaid balances, and posts the adjustments and credits that settle accounts.",
  billing:
    "Compiles and posts charges, prepares invoices or claims, and posts what comes back from customers and payers.",
  payroll:
    "Compiles employee time and pay data, enters and processes payroll, and maintains the employee records payroll reads from.",
  treasurer:
    "Manages the cash of the business: signs or releases payments, moves funds between accounts, and reconciles the bank.",
  purchasing:
    "Buys goods and services for the business, selects and sets up suppliers, and places and follows orders.",
  receiving: "Verifies and records incoming and outgoing shipments and keeps the inventory count.",
  receptionist:
    "Greets and directs callers and visitors, schedules, takes payments at the desk, and keeps customer or patient records.",
  "administrative-assistant":
    "Performs routine administrative work such as correspondence, scheduling, filing, ordering supplies, and answering calls.",
  "executive-assistant":
    "Provides high-level administrative support to the owner or executive, including correspondence, scheduling, travel, and often the executive's expenses.",
  "insurance-coordinator":
    "Verifies coverage and eligibility, submits and follows claims, and adjusts balances to what the payer allowed.",
  "treatment-coordinator":
    "Presents treatment plans and fees, arranges financing, takes payment, and keeps the patient's plan current.",
  "customer-service":
    "Handles customer inquiries, complaints, orders, returns, and account changes, and issues refunds and credits within limits.",
  sales:
    "Sells the business's products or services, manages customer accounts, and grants discounts and credits to close and keep business.",
  cashier: "Receives and disburses money at a register, records the sale, and makes change.",
  provider:
    "Delivers the clinical or professional service the business sells; billing, adjustments, and payments belong to the office.",
  "dental-hygienist":
    "Provides preventive dental care, cleans teeth, examines patients for oral disease, and educates patients on oral hygiene.",
  "dental-assistant":
    "Performs limited clinical duties under the direction of a dentist, prepares patients and instruments, and assists chairside.",
  "medical-assistant":
    "Performs clinical and administrative tasks under a provider's direction, including intake, vitals, charting, and specimen handling.",
  "medical-secretary":
    "Performs secretarial duties using knowledge of medical terminology: schedules, registers patients, takes copays, and files claims.",
  "clinic-director":
    "Plans, directs, and coordinates the medical or clinical services of a practice or clinic and its staff.",
  chef: "Directs food preparation and the kitchen staff, plans menus, and orders and receives food and supplies.",
  server:
    "Takes orders and serves food and drink to guests, presents the check, and collects payment.",
  bartender:
    "Mixes and serves drinks, takes payment at the bar, and keeps the bar's stock and drawer.",
  "bar-manager":
    "Runs the bar: orders and receives liquor, sets the pour, schedules bar staff, and closes the bar's drawer.",
  estimator: "Prepares cost estimates and prices for jobs, bids, and change orders.",
  dispatcher:
    "Schedules and dispatches technicians and drivers, keeps customer and job records, and takes payments by phone.",
  "field-technician":
    "Performs the trade or service work in the field or on site and may collect payment from the customer on completion.",
  foreman:
    "Supervises and coordinates the crew on site, orders and receives materials, and approves the crew's hours.",
  "it-administrator":
    "Installs, configures, and maintains the business's systems, networks, user accounts, and backups.",
  hr: "Recruits, hires, and onboards staff, maintains employee records, and administers pay changes and benefits.",
  paralegal:
    "Assists attorneys by preparing documents, organizing files, and handling client billing and payments.",
  attorney:
    "Represents clients, gives legal advice, and is responsible for the matters and the fees billed on them.",
  "project-manager":
    "Plans and delivers projects, manages the budget and the subcontractors, and approves work and invoices against it.",
  consultant:
    "Delivers professional, technical, or personal services to clients and bills time or fees for the work.",
  "hotel-front-desk":
    "Registers guests, assigns rooms, keeps guest accounts, makes and confirms reservations, and collects payment at checkout.",
  "night-auditor":
    "Works the overnight desk, posts the day's charges and payments, and balances the day's accounts before the morning shift.",
  "housekeeping-supervisor":
    "Supervises and coordinates the cleaning staff, inspects rooms and areas, and orders cleaning supplies.",
  "hotel-manager":
    "Plans, directs, and coordinates the operations of a hotel or lodging property and its staff.",
  "service-advisor":
    "Greets service customers, writes the repair order, quotes and adjusts the work, and takes payment.",
  parts: "Orders, receives, stocks, and sells parts over the counter and to the shop.",
  "fi-manager":
    "Arranges financing and sells protection products on vehicle sales, structures the deal, and collects down payments.",
  "title-clerk":
    "Processes the paperwork on vehicle sales: titles, registrations, and the posting of the deal to the books.",
  "property-manager":
    "Manages residential or commercial property for owners: collects rent, hires and pays contractors, and keeps the accounts.",
  "leasing-agent":
    "Shows units, takes applications, deposits, and fees, and sets up tenant records.",
  "real-estate-agent":
    "Rents, buys, or sells property for clients, shows listings, negotiates terms, and handles earnest money to escrow.",
  "transaction-coordinator":
    "Manages the documents, deadlines, and funds of a real estate transaction from contract to closing.",
  "executive-director":
    "Leads a nonprofit or association, directs its programs and staff, and holds final authority over its spending.",
  "development-director":
    "Raises funds from donors, members, and events and maintains the donor and member records.",
  "grants-manager":
    "Finds, writes, and administers grants and bills funders for reimbursable costs.",
  "board-treasurer":
    "Serves on the board, oversees the finances, signs or approves payments, and reviews the bank statements.",
  "volunteer-coordinator":
    "Recruits and schedules volunteers and delivers the organization's programs.",
  marketing:
    "Plans and runs marketing and communications, manages agencies and ad spend, and maintains the brand.",
  "insurance-agent": "Sells insurance policies, services policyholders, and collects premiums.",
  "tax-preparer": "Prepares tax returns for individuals or small businesses and collects the fee.",
  auditor:
    "Examines records and controls, tests transactions, and reports findings; holds no transaction duty.",
  "loan-officer":
    "Evaluates, authorizes, or recommends approval of loan applications and maintains borrower records.",
  pharmacist:
    "Dispenses medications, counsels patients, manages inventory including controlled substances, and supervises technicians.",
  "pharmacy-technician":
    "Prepares medications under a pharmacist's supervision, rings sales, and processes insurance claims.",
  "medical-coder":
    "Assigns diagnosis and procedure codes for billing and resolves denied or adjusted claims.",
  "billing-manager":
    "Manages the revenue cycle: claims, posting, adjustments, write-offs, refunds, and the billing staff.",
  credentialing: "Enrolls and re-credentials providers with payers and licensing bodies.",
  "center-director":
    "Directs a childcare center or school: enrollment, tuition, staffing, suppliers, and compliance.",
  teacher: "Teaches or cares for children or students and holds no financial duty.",
  driver: "Drives delivery or service routes and may collect payment on delivery.",
  "fleet-manager": "Manages vehicles, drivers, routing, fuel, and repair suppliers.",
  "project-accountant":
    "Tracks cost and billing by job or project, bills progress, and posts the entries that allocate cost.",
  "contracts-administrator":
    "Prepares, sets up, and administers contracts and subcontracts and their invoices.",
  compliance:
    "Monitors compliance with laws, standards, and internal policy; tests controls and reads the logs.",
  facilities:
    "Maintains buildings and equipment, hires and directs contractors, and orders parts and supplies.",
  security:
    "Guards, patrols, or monitors premises to prevent theft, violence, or infractions of rules.",
  ecommerce: "Runs online sales channels and fulfils orders, including returns and refunds.",
  merchandiser: "Plans and selects the products the business carries and how they are presented.",
  "catering-manager": "Sells and runs catered events, takes deposits, and settles event bills.",
  "kitchen-staff":
    "Prepares ingredients, washes, and supports the kitchen; holds no financial duty.",
  intern: "Works in a temporary or learning role and holds no financial duty unless assigned one.",
  "cash-office":
    "Counts register drawers, prepares the bank deposit, and keeps the cash-office records for a store or branch.",
  custodial: "Cleans, maintains and repairs the premises and grounds; holds no financial duty.",
  "board-member":
    "Serves on the governing board of a nonprofit or association, approving budgets and policies and reading financial reports.",
  "service-manager":
    "Runs a repair or dealership service department: schedules the shop, approves goodwill and warranty write-offs, submits technicians' hours, and orders parts.",
  "automotive-support":
    "Prepares, moves and cleans vehicles or sets sales and service appointments at a dealership; holds no financial duty.",
  "housekeeping-staff":
    "Cleans and services guest rooms and public areas of a hotel or property; holds no financial duty.",
  "shop-technician":
    "Diagnoses and repairs vehicles or equipment in a shop against a repair order; holds no financial duty.",
};

export const JOB_CATALOG: readonly JobCatalogEntry[] = RAW_CATALOG.map((e) => ({
  ...e,
  description: DESCRIPTIONS[e.id] ?? "",
}));

/** Ids in the catalog with no description, for the tests. */
export function jobCatalogMissingDescriptions(): string[] {
  return JOB_CATALOG.filter((e) => !e.description).map((e) => e.id);
}

/** Words that describe seniority or schedule, not the job. */
/** Words that join a title's parts and carry no meaning of their own. */
const STOP_WORDS = new Set(["the", "of", "and", "for", "to", "s"]);

/** Seniority, schedule and contract words: "Senior AP Clerk (part-time)" is an AP clerk. */
const DECORATION_WORDS = new Set([
  "senior",
  "sr",
  "junior",
  "jr",
  "i",
  "ii",
  "iii",
  "iv",
  "1",
  "2",
  "3",
  "part",
  "full",
  "time",
  "pt",
  "ft",
  "temp",
  "temporary",
  "interim",
  "acting",
  "seasonal",
  "contract",
  "contractor",
  "trainee",
  "volunteer",
]);

/**
 * Level and department words that say nothing about money duties on their
 * own. A title the catalog does not know as a whole ("Nursing Supervisor",
 * "Product Manager") must not fall back to the money duties of a job that
 * merely shares one of these words with it.
 */
const GENERIC_ROLE_WORDS = new Set([
  "manager",
  "mgr",
  "supervisor",
  "lead",
  "leader",
  "associate",
  "assistant",
  "asst",
  "clerk",
  "admin",
  "administrator",
  "technician",
  "tech",
  "operator",
  "aide",
  "coordinator",
  "director",
  "officer",
  "agent",
  "representative",
  "rep",
  "worker",
  "staff",
  "member",
  "head",
  "chief",
  "executive",
  "runner",
  "host",
  "partner",
  "principal",
  "president",
  "founder",
  "vp",
  "professional",
  "generalist",
  "support",
  "service",
  "services",
  "sales",
  "team",
  "crew",
  "specialist",
  "analyst",
]);

/** Abbreviations HR and payroll systems write, expanded to the words the catalog uses. */
const ABBREVIATIONS: Record<string, string> = {
  mgr: "manager",
  mgmt: "management",
  asst: "assistant",
  assoc: "associate",
  acctg: "accounting",
  accts: "accounts",
  dir: "director",
  ops: "operations",
  coord: "coordinator",
  spec: "specialist",
  tech: "technician",
  exec: "executive",
  ofc: "office",
  svc: "service",
  pres: "president",
  proj: "project",
  eng: "engineer",
  supv: "supervisor",
  supt: "superintendent",
  rep: "representative",
  recept: "receptionist",
  maint: "maintenance",
  mktg: "marketing",
  cust: "customer",
};

/**
 * "Acct" read by the word after it. Before a sales word it is an account
 * ("Acct Exec", "Key Acct Manager"); before a clerical word it is accounting
 * ("Acct Clerk"); before payable or receivable it is accounts; on its own or
 * last ("Sr. Acct", "Staff Acct") it is an accountant.
 */
const ACCT_BEFORE: Record<string, string> = {
  exec: "account",
  executive: "account",
  manager: "account",
  mgr: "account",
  rep: "account",
  representative: "account",
  director: "account",
  dir: "account",
  coordinator: "account",
  coord: "account",
  payable: "accounts",
  receivable: "accounts",
  clerk: "accounting",
  assistant: "accounting",
  asst: "accounting",
  specialist: "accounting",
  spec: "accounting",
  analyst: "accounting",
  associate: "accounting",
  assoc: "accounting",
  supervisor: "accounting",
  supv: "accounting",
  technician: "accounting",
  tech: "accounting",
};

/** "A/P Clerk", "A/R Specialist", "I.T. Manager": the letters are one word. */
function joinLetterPairs(value: string): string {
  return value
    .replace(/\ba\s*\/\s*p\b/gi, "AP")
    .replace(/\ba\s*\/\s*r\b/gi, "AR")
    .replace(/\bi\.?\s*t\.?(?=\s|$)/gi, "IT");
}

function tokens(value: string): string[] {
  const raw = joinLetterPairs(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
  return raw.map((t, i) =>
    t === "acct" ? (ACCT_BEFORE[raw[i + 1]] ?? "accountant") : (ABBREVIATIONS[t] ?? t),
  );
}

/** The same title with seniority, schedule and contract words removed. */
function undecorated(words: readonly string[]): string[] {
  return words.filter((t) => !DECORATION_WORDS.has(t));
}

/**
 * Every name the catalog knows, as written, joined with single spaces.
 * Decoration words are not removed from the names themselves: "contract
 * manager" must stay a contracts administrator and not become "manager".
 */
const ALIAS_INDEX: { alias: string; entry: JobCatalogEntry }[] = JOB_CATALOG.flatMap((e) =>
  [e.title, ...e.aliases].map((alias) => ({ alias: tokens(alias).join(" "), entry: e })),
)
  .filter((a) => a.alias.length > 0)
  // Longest alias first, so "accounts payable clerk" wins over "clerk".
  .sort((a, b) => b.alias.length - a.alias.length);

const EXACT_ALIAS = new Map<string, JobCatalogEntry>();
for (const a of ALIAS_INDEX) if (!EXACT_ALIAS.has(a.alias)) EXACT_ALIAS.set(a.alias, a.entry);

const catalogEntry = (id: string): JobCatalogEntry => JOB_CATALOG.find((e) => e.id === id)!;

/**
 * Last words that name a learner's or helper's seat: "Accounting Student" is
 * a student and "Marketing Intern" an intern, not an accountant or a
 * marketer. "Trainee" is not here: a payroll trainee or a manager trainee
 * does the job while learning it.
 */
const LEARNER_WORDS = new Set(["intern", "volunteer", "apprentice", "aide", "student"]);

/** The intern's seat when the last word of a longer title names a learner. */
function learnerSeat(words: readonly string[]): JobCatalogEntry | undefined {
  return words.length > 1 && LEARNER_WORDS.has(words[words.length - 1])
    ? catalogEntry("intern")
    : undefined;
}

/**
 * Words that name the owner's seat. After "to", "for", "of" or "reports to",
 * or as a possessive, they name the person a job serves ("Assistant to the
 * Owner", "Owner's Rep", "Bookkeeper (Owner's son)"), never the job itself.
 */
const OWNER_WORDS =
  "owners?|ceo|president|founder|co-founder|proprietor|principal|managing partner|partner|chief executive officer|chief executive|boss";
const PATRON_CLAUSE = new RegExp(
  `\\b(?:(?:reports?|reporting)\\s+to|to|for|of)\\s+(?:the\\s+)?(?:${OWNER_WORDS})(?:\\s*(?:/|&|,|\\band\\b)\\s*(?:the\\s+)?(?:${OWNER_WORDS}))*\\b`,
  "gi",
);
const PATRON_POSSESSIVE = new RegExp(`\\b(?:${OWNER_WORDS})['’]s?(?=\\s)`, "gi");

/** Words that, left alone once the owner is taken out, describe an assistant to the owner. */
const ASSISTANT_WORDS = new Set([
  "assistant",
  "executive",
  "personal",
  "administrative",
  "admin",
  "secretary",
]);

/** A single-word owner name that counts only as the whole title: a card dealer owns nothing. */
const WHOLE_TITLE_ONLY = new Set(["dealer"]);

const carriesMoneyDuty = (e: JobCatalogEntry) =>
  e.entitlements.some((d) => d !== "view_reports_only");

/** The whole title, as written or with its decorations removed, is a known name. */
function exactMatch(words: readonly string[]): JobCatalogEntry | undefined {
  return EXACT_ALIAS.get(words.join(" ")) ?? EXACT_ALIAS.get(undecorated(words).join(" "));
}

/**
 * One part of a combined title. A part that is only a level word ("Clerk" in
 * "Clerk, Accounts Receivable") names no seat on its own when it would carry
 * money duties; the other part does.
 */
function partMatch(words: readonly string[]): JobCatalogEntry | undefined {
  const bare = undecorated(words);
  if (bare.length === 1 && GENERIC_ROLE_WORDS.has(bare[0])) {
    const e = EXACT_ALIAS.get(bare[0]);
    return e && !carriesMoneyDuty(e) ? e : undefined;
  }
  return (
    EXACT_ALIAS.get(words.join(" ")) ??
    learnerSeat(words) ??
    exactMatch(words) ??
    containedMatch(words)
  );
}

/**
 * A known name appears inside a longer title. A name of several words counts
 * wherever it sits ("Assistant Front Desk Coordinator"). A single word counts
 * wherever it sits too ("Senior Buyer", "Billing Supervisor"), unless it is a
 * level word on a job that carries money duties: "Nursing Supervisor" is not
 * a shift lead who prepares deposits, and stays unknown for the owner to
 * tick by hand. A single word naming the owner counts only as the last word
 * ("Salon Owner", not "Owner Relations Manager").
 */
function containedMatch(words: readonly string[]): JobCatalogEntry | undefined {
  const forms = [words, undecorated(words)].map((w) => ` ${w.join(" ")} `);
  for (const a of ALIAS_INDEX) {
    if (!a.alias.includes(" ")) continue;
    if (forms.some((f) => f.includes(` ${a.alias} `))) return a.entry;
  }
  const learner = learnerSeat(words);
  if (learner) return learner;
  const bare = undecorated(words);
  for (const [i, w] of bare.entries()) {
    const e = EXACT_ALIAS.get(w);
    if (!e || WHOLE_TITLE_ONLY.has(w)) continue;
    if (GENERIC_ROLE_WORDS.has(w) && carriesMoneyDuty(e)) continue;
    if (e.id === "owner" && i !== bare.length - 1) continue;
    return e;
  }
  return undefined;
}

export interface JobMatch {
  /** The seat the title names; for a combined title, its first known part (the owner if any part is the owner). */
  entry: JobCatalogEntry;
  /** exact: the whole title is a known name; partial: a known name appears inside a longer or combined title. */
  confidence: "exact" | "partial";
  /** The duties the title carries: for "Office Manager / Bookkeeper", both seats' duties together. */
  entitlements: EntitlementId[];
}

/**
 * A bare title that means one seat in one line of business: "Associate" is
 * an attorney in a law firm and a sales associate in a store; "Assistant" is
 * a dental assistant in a dental office; a "Crew Lead" runs a field crew in a
 * general or trades business and a shift in a store or restaurant; a
 * "Business Assistant" is the front desk of a dental office. Anywhere else
 * the catalog's own reading stands (or, for a level word, nothing).
 */
const INDUSTRY_HINTS: Record<string, Record<string, string>> = {
  associate: { professional_services: "attorney", retail: "cashier", restaurant: "server" },
  assistant: { dental: "dental-assistant" },
  technician: { dental: "dental-assistant" },
  partner: { professional_services: "owner" },
  "crew lead": { general: "foreman" },
  "crew leader": { general: "foreman" },
  "business assistant": { dental: "receptionist" },
};

/**
 * Duties a seat carries in one line of business on top of its usual ones.
 * In a dental or medical office the office manager usually keeps the
 * practice's books, bank reconciliation included.
 */
const INDUSTRY_DUTIES: Record<string, Record<string, readonly EntitlementId[]>> = {
  dental: { "office-manager": ["bank_reconcile"] },
};

/** A seat's usual duties in this line of business. */
export function seatDuties(entry: JobCatalogEntry, industry?: string): EntitlementId[] {
  const extra = (industry && INDUSTRY_DUTIES[industry]?.[entry.id]) || [];
  return Array.from(new Set([...entry.entitlements, ...extra]));
}

function seatMatch(
  entries: readonly JobCatalogEntry[],
  confidence: JobMatch["confidence"],
  industry?: string,
): JobMatch {
  const entry = entries.find((e) => e.id === "owner") ?? entries[0];
  const entitlements = Array.from(new Set(entries.flatMap((e) => seatDuties(e, industry))));
  return { entry, confidence, entitlements };
}

/**
 * Takes out a clause or possessive naming the owner as the person a job
 * serves. Returns the rest of the title, or undefined when there is none.
 */
function withoutPatron(title: string): string | undefined {
  const rest = title
    .replace(PATRON_CLAUSE, " ")
    .replace(PATRON_POSSESSIVE, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/[\s/,;|\-–—(]+$/u, "")
    .trim();
  return rest === title.trim() ? undefined : rest;
}

/**
 * Finds the catalog entry for a roster title. Seniority and schedule words
 * are ignored ("Senior AP Clerk (part-time)" is an AP clerk). A title with
 * several parts ("Office Manager / Bookkeeper", "Chef/Owner") names every
 * seat it lists and carries all of their duties, because that is exactly the
 * concentration the map exists to show. A title that names the owner only as
 * the person served ("Owner's Assistant", "Office Manager - reports to
 * Owner") never takes the owner's seat. Returns undefined when nothing
 * matches, so the caller can leave the duties for the owner to tick rather
 * than guess.
 */
export function matchJobTitle(title: string, industry?: string): JobMatch | undefined {
  const words = tokens(title);
  if (words.length === 0) return undefined;
  const bare = undecorated(words);
  if (industry) {
    const hinted = INDUSTRY_HINTS[bare.join(" ")]?.[industry];
    if (hinted) return seatMatch([catalogEntry(hinted)], "partial", industry);
  }
  const literal = EXACT_ALIAS.get(words.join(" "));
  if (literal) return seatMatch([literal], "exact", industry);

  const rest = withoutPatron(title);
  if (rest !== undefined) {
    const restWords = undecorated(tokens(rest));
    if (restWords.length === 0) return undefined;
    if (restWords.every((w) => ASSISTANT_WORDS.has(w))) {
      return seatMatch([catalogEntry("executive-assistant")], "partial", industry);
    }
    const served = matchJobTitle(rest, industry);
    return served && { ...served, confidence: "partial" };
  }

  // Slashes, commas, brackets, dashes and "and" join seats: "Chef/Owner",
  // "Owner-Operator", "Payroll & HR Administrator".
  const joined = joinLetterPairs(title);
  const parts = joined
    .split(/[/,;()|\-–—]|\s(?:and|&)\s/i)
    .map(tokens)
    .filter((p) => p.length > 0);
  // A learner's last word counts in a one-part title ("Accounting Student");
  // "Bookkeeper (Volunteer)" is a bookkeeper who is not paid.
  const learner = parts.length === 1 ? learnerSeat(words) : undefined;
  if (learner) return seatMatch([learner], "partial", industry);
  const whole = exactMatch(words);
  if (whole) return seatMatch([whole], "exact", industry);
  const matched: JobCatalogEntry[] = [];
  if (parts.length === 2) {
    // "Clerk, Accounts Receivable" is an accounts receivable clerk.
    const reversed = exactMatch([...parts[1], ...parts[0]]);
    if (reversed) return seatMatch([reversed], "partial", industry);
  }
  // Two parts joined by "and" or a slash share words: "Office & HR Manager"
  // borrows the last word of the other part, "Accounts Payable and
  // Receivable Clerk" its first. Not for "(Property)" after a title, which
  // qualifies it. A borrowed seat replaces a part that reads alone only as a
  // level word with no money duty ("Receivable Specialist").
  const shared = parts.length === 2 && /\s(?:and|&)\s|\//i.test(joined);
  if (parts.length > 1) {
    for (const [i, part] of parts.entries()) {
      const own = partMatch(part);
      const other = parts[1 - i];
      const borrowed = shared
        ? (exactMatch([...part, other[other.length - 1]]) ?? exactMatch([other[0], ...part]))
        : undefined;
      const hit = borrowed && (!own || !carriesMoneyDuty(own)) ? borrowed : own;
      if (hit && !matched.includes(hit)) matched.push(hit);
    }
  }
  if (matched.length === 0) {
    const hit = containedMatch(words);
    if (hit) matched.push(hit);
  }
  if (matched.length === 0) return undefined;
  return seatMatch(matched, "partial", industry);
}

/** Duties the catalog suggests for a title, or an empty list when the title is unknown. */
export function entitlementsForTitle(title: string, industry?: string): EntitlementId[] {
  return matchJobTitle(title, industry)?.entitlements ?? [];
}

export function jobCatalogEntry(id: string): JobCatalogEntry | undefined {
  return JOB_CATALOG.find((e) => e.id === id);
}

/** Every entitlement id the catalog cites exists in the rulebook; checked by the tests. */
export function jobCatalogUnknownEntitlements(): string[] {
  const known = new Set<string>(ENTITLEMENTS.map((e) => e.id));
  return JOB_CATALOG.flatMap((e) => e.entitlements.filter((id) => !known.has(id)));
}

/**
 * Column names the common systems of record put on a worker export, as
 * their documentation and standard reports show them. The roster importer
 * reads any of these. Kept here so the in-app help and the importer agree.
 */
export const ROSTER_COLUMN_GUIDE: { system: string; columns: string }[] = [
  {
    system: "Workday (worker report or Excel export)",
    columns: "Worker, Employee ID, Business Title, Job Profile, Manager, Hire Date, Cost Center",
  },
  {
    system: "SAP SuccessFactors Employee Central (employee export)",
    columns:
      "Person ID External, User ID, First Name, Last Name, Job Title, Position, Department, Employment Status",
  },
  {
    system: "Oracle HCM Cloud (worker extract)",
    columns:
      "Person Number, Display Name, Job Name, Position Name, Department Name, Assignment Status, Hire Date",
  },
  {
    system: "ADP Workforce Now",
    columns:
      "Payroll Name, Position ID, Position Description, Home Department, Position Status, Hire Date",
  },
  {
    system: "Payroll providers (Gusto, Paychex, QuickBooks, Paycom, Paylocity)",
    columns:
      "Employee Name or First Name and Last Name, Employee ID, Job Title, Department or Cost Center 1, Status, Hire Date",
  },
  {
    system: "HR tools (BambooHR, Rippling)",
    columns:
      "Employee #, First Name, Last Name, Full name, Job Title, Department, Employment Status, Status, Start date",
  },
  {
    system: "Scheduling and point of sale (Square, Homebase, 7shifts, Toast)",
    columns:
      "Given name, Family name, Team member ID, Job title, Roles, Departments, Locations, Active, Status",
  },
  {
    system: "Practice management (Dentrix, Open Dental)",
    columns: "Staff ID, Name, Position, Status; EmployeeNum, LName, FName, IsHidden",
  },
  {
    system: "A plain list",
    columns:
      "Name, Title on each line, separated by a comma, a tab, a dash, a pipe, a colon or parentheses",
  },
];
