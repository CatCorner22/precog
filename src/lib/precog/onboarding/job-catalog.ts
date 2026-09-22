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
  | "professional";

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
};

const entry = (
  id: string,
  title: string,
  family: JobFamily,
  aliases: readonly string[],
  entitlements: readonly EntitlementId[],
  note: string,
  soc?: string,
): JobCatalogEntry => ({ id, title, family, aliases, entitlements, note, ...(soc ? { soc } : {}) });

export const JOB_CATALOG: readonly JobCatalogEntry[] = [
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
    ],
    [
      "approve_vendor",
      "approve_payroll",
      "approve_writeoffs",
      "sign_checks",
      "bank_reconcile",
      "manage_user_access",
      "view_reports_only",
    ],
    "The owner is the approver of last resort and, in a small business, usually the one who signs and should be the one who reads the bank statement.",
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
    "In a small office the office manager records payments, makes the deposit, pays the bills, runs payroll, and administers the system: the arrangement behind most cases in the library. Untick what someone else does.",
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
      "service manager",
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
      "supervisor",
      "floor supervisor",
      "crew lead",
      "crew leader",
      "lead",
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
    ],
    [
      "approve_vendor",
      "release_payment",
      "bank_reconcile",
      "post_journal_entries",
      "approve_payroll",
      "sign_checks",
      "review_audit_logs",
      "view_reports_only",
    ],
    "A controller approves suppliers, releases payments, posts journal entries, and reconciles the bank: a wide seat that the case library shows needs an owner reading the statement.",
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
    ["treasurer", "cash manager", "treasury analyst", "treasury", "cash applications"],
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
      "front desk agent",
      "front office coordinator",
      "front office",
      "patient coordinator",
      "scheduling coordinator",
      "scheduler",
      "appointment coordinator",
      "information clerk",
      "greeter",
      "concierge",
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
      "ea",
      "assistant to the ceo",
      "assistant to the owner",
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
    ],
    ["approve_writeoffs", "view_reports_only"],
    "A provider approves courtesy write-offs on their own patients and otherwise stays out of the money.",
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
      "technician",
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
      "cook",
      "line cook",
      "prep cook",
      "pastry chef",
      "back of house manager",
      "boh manager",
      "kitchen lead",
      "kitchen supervisor",
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
      "delivery driver",
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
    ["bartender", "barback", "mixologist", "bar staff", "bar lead"],
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
    ["approve_writeoffs", "view_reports_only"],
    "An estimator sets the price and the discount, which is an approval in everything but name.",
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
      "service writer",
      "service advisor",
      "fleet coordinator",
    ],
    ["edit_patient_master", "collect_cash", "view_reports_only"],
    "A dispatcher maintains customer records and takes phone payments; the field cases where a tech and dispatcher split a cash job start here.",
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
      "mechanic",
      "auto technician",
      "driver",
      "operator",
      "equipment operator",
      "carpenter",
      "painter",
      "roofer",
      "landscaper",
      "groundskeeper",
      "cleaner",
      "janitor",
      "maintenance technician",
      "maintenance",
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
    ],
    ["receive_goods", "order_supplies", "enter_payroll", "view_reports_only"],
    "A foreman orders and receives material and approves the crew's hours: the ghost-timesheet cases run through this seat.",
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
      "office and hr manager",
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
      "case manager",
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
      "associate",
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
    ["approve_vendor", "enter_invoices", "view_reports_only"],
    "A project manager approves subcontractors and their invoices against the budget they own.",
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
    ],
    ["view_reports_only"],
    "Fee-earning staff usually hold no money duty; tick collect payment if they take it at the chair or the desk.",
  ),
];

/** Words that describe seniority or schedule, not the job. */
const NOISE_TOKENS = new Set([
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
  "the",
  "of",
  "and",
]);

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeTitle(value: string): string {
  return tokens(value)
    .filter((t) => !NOISE_TOKENS.has(t))
    .join(" ");
}

const ALIAS_INDEX: { alias: string; entry: JobCatalogEntry }[] = JOB_CATALOG.flatMap((e) =>
  [e.title, ...e.aliases].map((alias) => ({ alias: normalizeTitle(alias), entry: e })),
)
  .filter((a) => a.alias.length > 0)
  // Longest alias first, so "accounts payable clerk" wins over "clerk".
  .sort((a, b) => b.alias.length - a.alias.length);

export interface JobMatch {
  entry: JobCatalogEntry;
  /** exact: the whole title is a known name; partial: a known name appears inside a longer title. */
  confidence: "exact" | "partial";
}

/**
 * Finds the catalog entry for a roster title. Seniority and schedule words
 * are ignored ("Senior AP Clerk (part-time)" is an AP clerk). A title with
 * several parts ("Office Manager / Bookkeeper") matches on its first part
 * that the catalog knows. Returns undefined when nothing matches, so the
 * caller can leave the duties for the owner to tick rather than guess.
 */
export function matchJobTitle(title: string): JobMatch | undefined {
  const whole = normalizeTitle(title);
  if (!whole) return undefined;
  const exact = ALIAS_INDEX.find((a) => a.alias === whole);
  if (exact) return { entry: exact.entry, confidence: "exact" };
  const parts = title
    .split(/[/,;()|]|\s[-–—]\s/)
    .map(normalizeTitle)
    .filter(Boolean);
  for (const part of parts) {
    const hit = ALIAS_INDEX.find((a) => a.alias === part);
    if (hit) return { entry: hit.entry, confidence: parts.length > 1 ? "partial" : "exact" };
  }
  const padded = ` ${whole} `;
  const inside = ALIAS_INDEX.find((a) => a.alias.includes(" ") && padded.includes(` ${a.alias} `));
  if (inside) return { entry: inside.entry, confidence: "partial" };
  // A single-word alias only counts when it is the title's last word ("Senior
  // Buyer"), so "Sales Associate" does not become "Associate" (attorney).
  const last = whole.split(" ").at(-1) ?? "";
  const tail = ALIAS_INDEX.find((a) => !a.alias.includes(" ") && a.alias === last);
  if (tail) return { entry: tail.entry, confidence: "partial" };
  return undefined;
}

/** Duties the catalog suggests for a title, or an empty list when the title is unknown. */
export function entitlementsForTitle(title: string): EntitlementId[] {
  const match = matchJobTitle(title);
  return match ? [...match.entry.entitlements] : [];
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
      "Person ID External, User ID, Job Title, Position, Department, Manager, Employment Status",
  },
  {
    system: "Oracle HCM Cloud (worker extract)",
    columns:
      "Person Number, Display Name, Job Name, Position Name, Department Name, Assignment Status",
  },
  {
    system: "Payroll providers (ADP, Gusto, Paychex, QuickBooks)",
    columns: "Employee Name, Job Title, Department, Status, Hire Date",
  },
  {
    system: "A plain list",
    columns: "Name, Title on each line, separated by a comma or a tab",
  },
];
