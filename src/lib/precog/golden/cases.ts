/**
 * The golden evaluation dataset for Precog's deterministic advice engine:
 * fixed team configurations with the outcomes a CPA agrees with. Every
 * change to the duty rulebook, the first-step ranking, the procedure
 * recommendations or the local brief runs against these in golden.test.ts.
 *
 * Data only. Test-only import: no screen or engine module reads this file,
 * so it never reaches the client bundle (see README.md in this folder).
 *
 * Expectations are sets and orderings that follow from rule severity and
 * from published control guidance and prosecuted cases, never from
 * hand-weighted scores. Each case's `basis` summarises its sources and names
 * the bodies behind them (for example the GAO Green Book, the Washington
 * State Auditor's segregation-of-duties guide, the ADA, a U.S. Attorney's
 * Office release); the research notes those lines condense live outside the
 * repository. Where the engine disagrees with a
 * CPA-defensible expectation, the expectation stands and `knownGap` records
 * what the engine does today; the test reports that check as a todo.
 */
import type { IndustryId } from "../industry";
import type { EntitlementId } from "../sod/conflict-rules";

/** One row of the setup grid, as `buildOwnTeam` reads it. */
export interface GoldenTeamRow {
  name: string;
  role: string;
  duties: EntitlementId[];
}

/** The checks golden.test.ts runs for a case; a known gap names the one it fails. */
export type GoldenCheck = "open" | "closed" | "pairs" | "firstStep" | "procedures" | "action";

export interface GoldenCase {
  id: string;
  /** One line: the team shape and what a CPA expects. */
  name: string;
  /** The business's name on the brief. */
  business: string;
  industry: IndustryId;
  /** The calendar day the engine runs on (YYYY-MM-DD). */
  today: string;
  team: GoldenTeamRow[];
  /** The duty pairs at issue and the guidance or cases behind them. */
  basis: string;
  /** Rule ids that must be open findings. */
  expectOpenRuleIds: string[];
  /** Rule ids that must not be open findings (the owner's own pair, or a pair nobody holds). */
  expectClosedRuleIds: string[];
  /**
   * Duty pairs that must appear in an open finding under any rule, named or
   * family. For pairs the guidance names that have no rule id of their own.
   */
  expectOpenPairs?: [EntitlementId, EntitlementId][];
  /** The rule the first "Do these first" step is named for: the most severe open pair. */
  expectFirstStepRuleId?: string;
  /** The duty the first step moves, when the first step is the split step. */
  expectFirstStepDutyId?: EntitlementId;
  /** Library ids (via RULE_PROCEDURE) the Procedures tab must rank as fitting this business. */
  expectRecommendedProcedureIds: string[];
  /** A pattern at least one decision's action in the local brief must match. */
  expectActionPattern?: RegExp;
  /** What the engine does today for a check, and why the expectation stands. */
  knownGap?: Partial<Record<GoldenCheck, string>>;
}

const TODAY = "2026-10-01";

export const GOLDEN_CASES: readonly GoldenCase[] = [
  // ---------------------------------------------------------------- dental
  {
    id: "dental-owner-plus-front-desk",
    name: "Solo dentist with one front-desk person who takes payments, posts them, prepares the deposit and enters write-offs",
    business: "Lakeside Family Dental",
    industry: "dental",
    today: TODAY,
    team: [
      {
        name: "Dr. Amara Osei",
        role: "Owner / Dentist",
        duties: ["sign_checks", "bank_reconcile", "approve_writeoffs"],
      },
      {
        name: "Priya Natarajan",
        role: "Business Assistant",
        duties: ["collect_cash", "post_payments", "prepare_deposit", "post_adjustments"],
      },
    ],
    basis:
      "Dental note 1c pairs 2 and 3 (ADA: no one person handles both patient payments and bank deposits) and pair 1 (posts payments and posts adjustments on the same accounts; American Academy of Pediatric Dentistry, 2014). The dentist's own check signing plus reconciliation is the design, not a theft path (canon 4.2, GAO Green Book 10.03).",
    expectOpenRuleIds: [
      "rule-collect-post",
      "rule-deposit-post",
      "rule-collect-adjust",
      "rule-payments-adjust",
    ],
    expectClosedRuleIds: ["rule-sign-rec", "rule-custody-rec", "rule-cash-rec", "rule-writeoff"],
    expectRecommendedProcedureIds: ["lib-cash-deposit", "lib-refund-review"],
    expectActionPattern: /^Move .+ away from Priya Natarajan: it closes \d+/,
  },
  {
    id: "dental-office-manager-does-everything",
    name: "Three-person office whose office manager collects, posts, adjusts, refunds, bills, pays and reconciles",
    business: "Cedar Grove Dental",
    industry: "dental",
    today: TODAY,
    team: [
      {
        name: "Dr. Luis Herrera",
        role: "Owner / Dentist",
        duties: ["sign_checks", "approve_payroll", "approve_writeoffs"],
      },
      {
        name: "Marisol Ortega",
        role: "Office Manager",
        duties: [
          "collect_cash",
          "post_payments",
          "post_adjustments",
          "issue_refunds",
          "submit_claims",
          "enter_invoices",
          "release_payment",
          "bank_reconcile",
          "pms_admin_roles",
        ],
      },
      { name: "Kenji Watanabe", role: "Dental Hygienist", duties: [] },
    ],
    basis:
      "Dental note 1c pairs 1, 2, 8 and 10 (NSKT: owner reconciles bank accounts monthly; Open Dental: administrator rights apart from daily posting) and canon 4.3 cash receipts (Washington SAO guide). Pair 4 (submits insurance claims and posts the insurer's payment) enabled the phantom-procedure case D4.",
    expectOpenRuleIds: [
      "rule-cash-rec",
      "rule-custody-rec",
      "rule-release-rec",
      "rule-invoice-pay",
      "rule-refund-adjust",
      "rule-collect-post",
      "rule-collect-adjust",
      "rule-payments-adjust",
      "rule-cash-refund",
      "rule-refund-post",
      "rule-cash-admin",
      "rule-admin-writeoff",
      "rule-admin-pay",
    ],
    expectClosedRuleIds: ["rule-writeoff", "rule-payroll", "rule-sign-rec"],
    expectFirstStepDutyId: "bank_reconcile",
    expectRecommendedProcedureIds: [
      "lib-bank-rec",
      "lib-release-payments",
      "lib-refund-review",
      "lib-cash-deposit",
    ],
    expectActionPattern: /away from Marisol Ortega: it closes \d+/,
    knownGap: {
      firstStep:
        "The split step picks the move that lowers the open count the most (sod/duty-split chooseDutySplit: net, then count, then critical count). Moving cash collection to the hygienist closes one critical and four high pairs (net 5), so it beats moving the bank reconciliation, which closes three critical pairs (net 3) and leaves the office manager collecting, paying and reconciling. The canon puts the independent reconciliation first (GAO Green Book 10.12; Minnesota OSA Exhibit A; Washington SAO guide).",
    },
  },
  {
    id: "dental-eight-person-partial-separation",
    name: "Eight-person practice with a separate biller and front desk, a practice manager who administers the system and reviews its logs, and a bookkeeper who reconciles and posts journals",
    business: "Harborview Dental Group",
    industry: "dental",
    today: TODAY,
    team: [
      {
        name: "Dr. Renee Alvarez",
        role: "Owner / Dentist",
        duties: [
          "sign_checks",
          "approve_vendor",
          "approve_payroll",
          "approve_writeoffs",
          "approve_expenses",
        ],
      },
      {
        name: "Dana Kowalski",
        role: "Practice Manager",
        duties: [
          "manage_user_access",
          "review_audit_logs",
          "export_bulk_data",
          "enter_payroll",
          "edit_payroll_master",
          "hold_company_card",
          "review_card_statement",
        ],
      },
      {
        name: "Tom Beckett",
        role: "Billing Coordinator",
        duties: ["submit_claims", "post_payments", "post_adjustments", "issue_refunds"],
      },
      {
        name: "Aisha Rahman",
        role: "Front Desk",
        duties: ["collect_cash", "prepare_deposit"],
      },
      {
        name: "Gloria Fenn",
        role: "Bookkeeper",
        duties: ["bank_reconcile", "enter_invoices", "post_journal_entries"],
      },
      { name: "Dr. Samuel Price", role: "Associate Dentist", duties: [] },
      { name: "Nina Castellano", role: "Dental Hygienist", duties: [] },
      { name: "Omar Siddiqui", role: "Dental Assistant", duties: [] },
    ],
    basis:
      "Dental note 1c pairs 1 and 5 (posts payments and adjustments; processes refunds and reviews the statement), pair 8 (administrator rights), canon 4.3 user access (NIST AC-5 via UpGuard; UNT annual access review), canon 4.3 journal entries (Penn OACP: reconciling the bank while booking the related entries) and payroll (Washington SAO guide).",
    expectOpenRuleIds: [
      "rule-access-log",
      "rule-access-export",
      "rule-payroll-master-run",
      "rule-card-review",
      "rule-payments-adjust",
      "rule-refund-adjust",
      "rule-refund-post",
      "rule-je-rec",
    ],
    expectClosedRuleIds: [
      "rule-cash-rec",
      "rule-custody-rec",
      "rule-collect-post",
      "rule-release-rec",
      "rule-vendor-create-pay",
      "rule-payroll",
      "rule-card-approve",
    ],
    expectRecommendedProcedureIds: [
      "lib-leaver-access",
      "lib-refund-review",
      "lib-bank-rec",
      "lib-payroll",
      "lib-card-review",
      "lib-journal-review",
      "lib-access-review",
    ],
    expectActionPattern:
      /^Move .+ away from (Dana Kowalski|Tom Beckett|Gloria Fenn): it closes \d+/,
  },

  // ---------------------------------------------------------------- retail
  {
    id: "retail-owner-plus-store-manager",
    name: "Owner-operator with one store manager who rings sales, voids, refunds, posts and makes the deposit",
    business: "Birch & Vine Mercantile",
    industry: "retail",
    today: TODAY,
    team: [
      {
        name: "Helen Marsh",
        role: "Owner",
        duties: ["bank_reconcile", "sign_checks", "approve_writeoffs"],
      },
      {
        name: "Jordan Reyes",
        role: "Store Manager",
        duties: [
          "collect_cash",
          "post_payments",
          "issue_refunds",
          "post_adjustments",
          "prepare_deposit",
        ],
      },
    ],
    basis:
      "Retail note 3c pairs 1, 2 and 4 (rings sales and voids own transactions; processes refunds and picks the tender; closes the register, prepares the deposit and banks it) and canon 4.3 credit memos (UM System APM 2.25.55: someone other than the issuer approves credits). The refund-plus-adjustment pair is the critical one.",
    expectOpenRuleIds: [
      "rule-refund-adjust",
      "rule-collect-post",
      "rule-collect-adjust",
      "rule-cash-refund",
      "rule-refund-post",
      "rule-payments-adjust",
      "rule-deposit-post",
    ],
    expectClosedRuleIds: ["rule-custody-rec", "rule-sign-rec", "rule-cash-void", "rule-writeoff"],
    expectFirstStepRuleId: "rule-refund-adjust",
    expectRecommendedProcedureIds: ["lib-refund-review", "lib-cash-deposit", "lib-drawer-close"],
    expectActionPattern: /away from Jordan Reyes(?: to [^:]+)?: it closes \d+/,
  },
  {
    id: "retail-three-person-bookkeeper",
    name: "Three-person shop whose office manager enters bills, sets up suppliers, pays them, runs payroll, posts journals and reconciles",
    business: "Northfield Outfitters",
    industry: "retail",
    today: TODAY,
    team: [
      {
        name: "Victor Nkemelu",
        role: "Owner",
        duties: ["approve_vendor", "sign_checks", "approve_payroll"],
      },
      {
        name: "Beth Carlucci",
        role: "Office Manager",
        duties: [
          "enter_invoices",
          "create_vendor",
          "release_payment",
          "bank_reconcile",
          "post_journal_entries",
          "enter_payroll",
        ],
      },
      { name: "Sana Qureshi", role: "Sales Associate", duties: ["collect_cash"] },
    ],
    basis:
      "Retail note 3c pair 10 and general note 3c (Prager Metis, GrowthForce: the monthly reconciliation is done by someone who neither deposits nor initiates disbursements; Aptora: the bookkeeper cannot sign checks). Canon 4.3 disbursements (Ramp, Corpay, Strategic CFO) and journal entries (Penn OACP). The first step answers the critical release-plus-reconcile pair (canon 5: the owner opens the bank statement first).",
    expectOpenRuleIds: [
      "rule-invoice-pay",
      "rule-release-rec",
      "rule-release-je",
      "rule-je-rec",
      "rule-vendor-create-pay",
      "rule-vendor-create-invoice",
      "rule-payroll-release",
      "rule-payroll-rec",
    ],
    expectClosedRuleIds: [
      "rule-sign-rec",
      "rule-vendor-create-approve",
      "rule-payroll",
      "rule-collect-post",
      "rule-custody-rec",
    ],
    expectFirstStepRuleId: "rule-release-rec",
    expectRecommendedProcedureIds: [
      "lib-release-payments",
      "lib-bank-rec",
      "lib-vendor-bank-change",
      "lib-payroll",
      "lib-journal-review",
      "lib-new-vendor",
    ],
    expectActionPattern: /away from Beth Carlucci: it closes \d+/,
  },
  {
    id: "retail-ten-person-partial-separation",
    name: "Ten-person store with two cashiers, a stock lead who orders and receives, a bookkeeper who sets up suppliers and pays them, and a manager who holds the card and approves spending",
    business: "Copperline Home & Garden",
    industry: "retail",
    today: TODAY,
    team: [
      {
        name: "Grace Lindqvist",
        role: "Owner",
        duties: ["sign_checks", "bank_reconcile", "approve_vendor", "approve_payroll"],
      },
      {
        name: "Marcus Hale",
        role: "Store Manager",
        duties: [
          "approve_writeoffs",
          "approve_expenses",
          "hold_company_card",
          "review_card_statement",
          "manage_user_access",
          "pms_admin_roles",
        ],
      },
      {
        name: "Elena Petrova",
        role: "Stock Lead",
        duties: ["order_supplies", "receive_goods", "enter_invoices"],
      },
      {
        name: "Rosa Delgado",
        role: "Bookkeeper",
        duties: ["post_payments", "create_vendor", "release_payment", "enter_payroll"],
      },
      { name: "Tyler Brooks", role: "Cashier", duties: ["collect_cash", "issue_refunds"] },
      { name: "Mei Lin", role: "Cashier", duties: ["collect_cash"] },
      { name: "Andre Fontaine", role: "Sales Associate", duties: [] },
      { name: "Jade Okoro", role: "Sales Associate", duties: [] },
      { name: "Liam Doyle", role: "Web Store Coordinator", duties: [] },
      { name: "Sofia Marin", role: "Visual Merchandiser", duties: [] },
    ],
    basis:
      "Canon 4.3 vendor master (Ramp: whoever adds vendors does not release payments to them) and the fictitious-vendor path in the case library make the critical pair; retail note 3c pairs 2 and 8 (refund tender; receives inventory and approves the invoice), canon 5 company card review (nonprofit note N6 pattern), payroll (Washington SAO guide).",
    expectOpenRuleIds: [
      "rule-vendor-create-pay",
      "rule-card-review",
      "rule-card-approve",
      "rule-order-receive",
      "rule-payroll-release",
      "rule-cash-refund",
    ],
    expectClosedRuleIds: [
      "rule-collect-post",
      "rule-invoice-pay",
      "rule-cash-void",
      "rule-sign-rec",
      "rule-release-rec",
    ],
    expectFirstStepRuleId: "rule-vendor-create-pay",
    expectRecommendedProcedureIds: [
      "lib-vendor-bank-change",
      "lib-card-review",
      "lib-receiving",
      "lib-payroll",
      "lib-refund-review",
      "lib-new-vendor",
    ],
    expectActionPattern: /^Move release payments away from Rosa Delgado: it closes \d+/,
  },

  // ------------------------------------------------- professional services
  {
    id: "professional-attorney-plus-bookkeeper",
    name: "Solo attorney with one bookkeeper who records trust transactions, enters and pays bills by ACH, posts journals and reconciles",
    business: "Whitcombe Law, PLLC",
    industry: "professional_services",
    today: TODAY,
    team: [
      {
        name: "Eleanor Whitcombe",
        role: "Attorney / Owner",
        duties: ["sign_checks", "approve_invoices", "approve_payroll"],
      },
      {
        name: "Paul Dziedzic",
        role: "Bookkeeper",
        duties: [
          "post_payments",
          "enter_invoices",
          "release_payment",
          "initiate_ach",
          "bank_reconcile",
          "post_journal_entries",
        ],
      },
    ],
    basis:
      "Professional note 2c: disburses from trust and performs the three-way reconciliation (cases L4, L7, L8; Florida Rule 5-1.2(c)); a non-lawyer bookkeeper as signatory is prohibited in New York (Rule 1.15(e)), so the brief moves payment release to the lawyer. The first step answers the critical disburse-plus-reconcile pair (canon 5: the owner opens the bank statement first; Florida Rule 5-1.2(c) names the lawyer who oversees the reconciliation).",
    expectOpenRuleIds: [
      "rule-cash-rec",
      "rule-release-rec",
      "rule-release-je",
      "rule-je-rec",
      "rule-invoice-pay",
      "rule-ach-release",
    ],
    expectClosedRuleIds: ["rule-sign-rec", "rule-vendor-create-pay", "rule-payroll"],
    expectFirstStepRuleId: "rule-release-rec",
    expectRecommendedProcedureIds: ["lib-bank-rec", "lib-release-payments", "lib-journal-review"],
    expectActionPattern: /^Move release payments away from Paul Dziedzic: it closes \d+/,
  },
  {
    id: "professional-two-partners",
    name: "Two-partner firm where the managing partner releases payments and reconciles, the other partner holds the card and reads its statement, and an office manager collects and posts",
    business: "Reyes & Thornbury Advisors",
    industry: "professional_services",
    today: TODAY,
    team: [
      {
        name: "Carla Reyes",
        role: "Managing Partner",
        duties: ["sign_checks", "bank_reconcile", "approve_payroll", "release_payment"],
      },
      {
        name: "David Thornbury",
        role: "Partner",
        duties: ["sign_checks", "approve_invoices", "hold_company_card", "review_card_statement"],
      },
      {
        name: "Maya Pillai",
        role: "Office Manager",
        duties: ["collect_cash", "post_payments", "enter_invoices", "enter_payroll"],
      },
    ],
    basis:
      "With two owners nobody is the person who cannot steal from themselves (sod/owner-role), so the managing partner's release-plus-reconcile pair is open (canon 4.3 bank reconciliation: the reconciler has no payment authority; Corpay, Penn OACP). The card holder reading their own statement is the Bellevue and Hutchinson pattern (rule-card-review).",
    expectOpenRuleIds: ["rule-release-rec", "rule-card-review", "rule-collect-post"],
    expectClosedRuleIds: ["rule-sign-rec", "rule-invoice-pay", "rule-card-approve", "rule-payroll"],
    expectFirstStepRuleId: "rule-release-rec",
    expectRecommendedProcedureIds: ["lib-bank-rec", "lib-card-review", "lib-cash-deposit"],
    expectActionPattern: /away from Carla Reyes: it closes \d+/,
  },
  {
    id: "professional-eight-person-therapy-practice",
    name: "Eight-person therapy practice: front desk collects copays, posts and adjusts ledgers and prepares the deposit; a billing manager posts remittances and refunds; an office manager runs payroll, changes pay rates and approves payroll",
    business: "Meadowbrook Therapy Associates",
    industry: "professional_services",
    today: TODAY,
    team: [
      {
        name: "Dr. Hannah Kessler",
        role: "Owner / Clinical Director",
        duties: ["sign_checks", "approve_writeoffs", "approve_vendor", "bank_reconcile"],
      },
      {
        name: "Chloe Bannister",
        role: "Front Desk",
        duties: ["collect_cash", "post_payments", "post_adjustments", "prepare_deposit"],
      },
      {
        name: "Raj Venkataraman",
        role: "Billing Manager",
        duties: [
          "submit_claims",
          "post_payments",
          "issue_refunds",
          "post_adjustments",
          "change_fee_schedule",
        ],
      },
      {
        name: "Linda Szabo",
        role: "Office Manager",
        duties: [
          "enter_payroll",
          "edit_payroll_master",
          "approve_payroll",
          "manage_user_access",
          "pms_admin_roles",
        ],
      },
      { name: "Dr. Ivan Petrov", role: "Therapist", duties: [] },
      { name: "Dr. Olivia Grant", role: "Therapist", duties: [] },
      { name: "Dr. Noor Haddad", role: "Therapist", duties: [] },
      { name: "Dr. Ben Okonkwo", role: "Therapist", duties: [] },
    ],
    basis:
      "Professional note 2c: collects copays, posts payments and adjustments and prepares the deposit (cases M1, M2, M3); write-off and refund rights in the PM system beside cash (M2); runs payroll and approves own pay and rate changes (M1 Keller, $185K of self-raises and ghost employees).",
    expectOpenRuleIds: [
      "rule-collect-post",
      "rule-collect-adjust",
      "rule-payments-adjust",
      "rule-deposit-post",
      "rule-refund-post",
      "rule-refund-adjust",
      "rule-payroll-master-run",
      "rule-payroll",
    ],
    expectClosedRuleIds: ["rule-cash-rec", "rule-custody-rec", "rule-sign-rec", "rule-access-log"],
    expectOpenPairs: [["edit_payroll_master", "approve_payroll"]],
    expectRecommendedProcedureIds: ["lib-refund-review", "lib-cash-deposit", "lib-payroll"],
    expectActionPattern:
      /^Move .+ away from (Chloe Bannister|Raj Venkataraman|Linda Szabo): it closes \d+/,
    knownGap: {
      pairs:
        "No rule pairs changing employee records (pay rates, bank details, new names) with approving payroll, and the family catch-all leaves master-data duties out (sod/rule-match familiesConflict). The person who can add a name or raise a rate and then approve the run approves their own change; the professional note's M1 Keller case ($185K of self-raises) and the nonprofit note's N7 Northcutt case ran this way.",
    },
  },

  // ------------------------------------------------------------ restaurant
  {
    id: "restaurant-chef-owner-plus-general-manager",
    name: "Chef-owner with one general manager who runs the register, approves voids, prepares the deposit, keys sales into the books and enters payroll",
    business: "Ember Lane Kitchen",
    industry: "restaurant",
    today: TODAY,
    team: [
      {
        name: "Antoine Dubois",
        role: "Chef/Owner",
        duties: ["sign_checks", "approve_payroll", "bank_reconcile"],
      },
      {
        name: "Keisha Thompson",
        role: "General Manager",
        duties: [
          "collect_cash",
          "prepare_deposit",
          "post_payments",
          "approve_writeoffs",
          "enter_payroll",
        ],
      },
    ],
    basis:
      "Restaurant note 1c: running the register and reconciling receipts at close (Plante Moran), voiding a check after taking the cash for it (QSRweb; cases R5 to R8), and the derived pair closes the drawer and makes the deposit. Payroll entry apart from approval keeps rule-payroll closed; the construction note's cases C4 (a Chickasha bookkeeper with unreviewed payroll-add rights) and C5 (a Greenfield office manager who raised her own pay 466 times) show the pair this split avoids.",
    expectOpenRuleIds: ["rule-collect-post", "rule-deposit-post", "rule-cash-void"],
    expectClosedRuleIds: ["rule-payroll", "rule-custody-rec", "rule-cash-rec", "rule-sign-rec"],
    expectRecommendedProcedureIds: ["lib-cash-deposit", "lib-drawer-close", "lib-refund-review"],
    expectActionPattern: /away from Keisha Thompson(?: to [^:]+)?: it closes \d+/,
  },
  {
    id: "restaurant-three-person-bookkeeper-and-bar",
    name: "Three-person restaurant: a bookkeeper who enters bills, sets up suppliers, pays them, enters payroll and reconciles; a bar manager who orders, receives and holds the card",
    business: "The Copper Pot",
    industry: "restaurant",
    today: TODAY,
    team: [
      {
        name: "Giulia Romano",
        role: "Owner",
        duties: ["sign_checks", "approve_vendor", "approve_payroll"],
      },
      {
        name: "Walter Simms",
        role: "Bookkeeper",
        duties: [
          "enter_invoices",
          "create_vendor",
          "release_payment",
          "bank_reconcile",
          "enter_payroll",
        ],
      },
      {
        name: "Diego Alvarez",
        role: "Bar Manager",
        duties: ["order_supplies", "receive_goods", "hold_company_card"],
      },
    ],
    basis:
      "Restaurant note 1c: receiving inventory and processing vendor payments (FSR Magazine), ordering and receiving and approving payment (BTCPA); bank signatory as sole keeper of the check register (case R1). General note 3c (Aptora): the bookkeeper cannot sign or release checks, so payment release moves to the owner first.",
    expectOpenRuleIds: [
      "rule-invoice-pay",
      "rule-release-rec",
      "rule-vendor-create-pay",
      "rule-vendor-create-invoice",
      "rule-payroll-release",
      "rule-payroll-rec",
      "rule-order-receive",
    ],
    expectClosedRuleIds: [
      "rule-card-review",
      "rule-sign-rec",
      "rule-payroll",
      "rule-vendor-create-approve",
    ],
    expectFirstStepDutyId: "release_payment",
    expectRecommendedProcedureIds: [
      "lib-release-payments",
      "lib-bank-rec",
      "lib-vendor-bank-change",
      "lib-payroll",
      "lib-receiving",
      "lib-new-vendor",
    ],
    expectActionPattern: /^Move release payments away from Walter Simms: it closes \d+/,
  },
  {
    id: "restaurant-twelve-person-partial-separation",
    name: "Twelve-person restaurant: shift leads void and refund, servers ring, a kitchen manager orders and receives, an office manager runs payroll, posts and reconciles",
    business: "Harbor Street Grill",
    industry: "restaurant",
    today: TODAY,
    team: [
      {
        name: "Patrick O'Neill",
        role: "Owner",
        duties: ["sign_checks", "approve_vendor", "approve_payroll", "release_payment"],
      },
      {
        name: "Yolanda Cruz",
        role: "Office Manager",
        duties: [
          "enter_payroll",
          "edit_payroll_master",
          "bank_reconcile",
          "post_payments",
          "enter_invoices",
          "create_vendor",
        ],
      },
      {
        name: "Sam Whitaker",
        role: "Kitchen Manager",
        duties: ["order_supplies", "receive_goods"],
      },
      {
        name: "Tara Nguyen",
        role: "Shift Lead",
        duties: ["collect_cash", "approve_writeoffs", "issue_refunds"],
      },
      { name: "Leo Brandt", role: "Shift Lead", duties: ["collect_cash", "approve_writeoffs"] },
      { name: "Ava Kim", role: "Server", duties: ["collect_cash"] },
      { name: "Jonah Feld", role: "Server", duties: ["collect_cash"] },
      { name: "Priya Shah", role: "Server", duties: ["collect_cash"] },
      { name: "Marco Bellini", role: "Server", duties: ["collect_cash"] },
      { name: "Hana Yusuf", role: "Server", duties: ["collect_cash"] },
      { name: "Eli Morgan", role: "Line Cook", duties: [] },
      { name: "Rosa Iglesias", role: "Line Cook", duties: [] },
    ],
    basis:
      "Restaurant note 1c: handling cash and reconciling sales (BTCPA), voids approved by the person who took the cash (QSRweb), ordering and receiving (BTCPA). Canon 4.3 cash receipts: posting and reconciling in one pair of hands is the critical pair (Washington SAO guide; Minnesota OSA), so it leads.",
    expectOpenRuleIds: [
      "rule-cash-rec",
      "rule-payroll-rec",
      "rule-payroll-master-run",
      "rule-vendor-create-invoice",
      "rule-order-receive",
      "rule-cash-void",
      "rule-cash-refund",
    ],
    expectClosedRuleIds: [
      "rule-vendor-approve-pay",
      "rule-sign-rec",
      "rule-release-rec",
      "rule-invoice-pay",
      "rule-payroll",
    ],
    expectFirstStepRuleId: "rule-cash-rec",
    expectRecommendedProcedureIds: [
      "lib-bank-rec",
      "lib-payroll",
      "lib-receiving",
      "lib-refund-review",
      "lib-drawer-close",
      "lib-vendor-bank-change",
      "lib-new-vendor",
    ],
    expectActionPattern: /^Move reconcile the bank account away from Yolanda Cruz: it closes \d+/,
  },

  // ---------------------------------------------------------- construction
  {
    id: "construction-owner-plus-spouse-bookkeeper",
    name: "Owner-operator contractor with a spouse-bookkeeper who enters bills, pays by ACH, runs payroll and changes pay records, holds the card and reconciles",
    business: "Ridgeback Builders",
    industry: "construction",
    today: TODAY,
    team: [
      {
        name: "Mike Dorsey",
        role: "Owner / General Contractor",
        duties: ["sign_checks", "approve_invoices", "approve_payroll"],
      },
      {
        name: "Janet Dorsey",
        role: "Bookkeeper (spouse)",
        duties: [
          "enter_invoices",
          "initiate_ach",
          "release_payment",
          "bank_reconcile",
          "enter_payroll",
          "edit_payroll_master",
          "hold_company_card",
          "review_card_statement",
        ],
      },
    ],
    basis:
      "Construction note 2c: bookkeeper with online-bank payment authority and no owner bank-statement review (cases C1, C2), payroll add/edit rights beside the card statements (C4, C5), single signature on EFTs (Construction Business Owner: dual approval), so payment release moves to the owner, who already signs. Canon 5 first compensating control: the owner opens the bank statement first (NY OSC; Dean Dorton).",
    expectOpenRuleIds: [
      "rule-invoice-pay",
      "rule-ach-release",
      "rule-release-rec",
      "rule-payroll-release",
      "rule-payroll-rec",
      "rule-payroll-master-release",
      "rule-payroll-master-run",
      "rule-card-review",
    ],
    expectClosedRuleIds: [
      "rule-sign-rec",
      "rule-card-approve",
      "rule-payroll",
      "rule-vendor-create-pay",
    ],
    expectRecommendedProcedureIds: [
      "lib-release-payments",
      "lib-bank-rec",
      "lib-payroll",
      "lib-card-review",
    ],
    expectActionPattern: /^Owner opens the bank statement first, before anyone else handles it/,
  },
  {
    id: "construction-three-person-controller",
    name: "Three-person general contractor: a controller who sets up and approves subcontractors, approves pay applications, releases payment, posts journals and reconciles; a project manager who orders and receives",
    business: "Summit Line Construction",
    industry: "construction",
    today: TODAY,
    team: [
      {
        name: "Ray Castillo",
        role: "Owner / General Contractor",
        duties: ["sign_checks", "approve_payroll"],
      },
      {
        name: "Denise Park",
        role: "Controller",
        duties: [
          "create_vendor",
          "approve_vendor",
          "approve_invoices",
          "release_payment",
          "bank_reconcile",
          "post_journal_entries",
        ],
      },
      {
        name: "Chris Lundgren",
        role: "Project Manager",
        duties: ["order_supplies", "receive_goods"],
      },
    ],
    basis:
      "Construction note 2c: vendor setup and payment approval and bank reconciliation (LBMC; Construction Business Owner), receiving materials on site and approving the supplier invoice. Canon 4.3 disbursements (Ramp: approving an invoice and releasing its payment are kept apart) and journal entries (Penn OACP).",
    expectOpenRuleIds: [
      "rule-vendor-create-pay",
      "rule-vendor-create-approve",
      "rule-vendor-approve-pay",
      "rule-release-rec",
      "rule-release-je",
      "rule-je-rec",
      "rule-order-receive",
    ],
    expectClosedRuleIds: ["rule-sign-rec", "rule-invoice-pay", "rule-payroll", "rule-cash-rec"],
    expectOpenPairs: [["approve_invoices", "release_payment"]],
    expectRecommendedProcedureIds: [
      "lib-vendor-bank-change",
      "lib-bank-rec",
      "lib-release-payments",
      "lib-receiving",
      "lib-journal-review",
      "lib-new-vendor",
    ],
    expectActionPattern: /away from Denise Park: it closes \d+/,
    knownGap: {
      pairs:
        "No named rule pairs approving bills for payment with releasing payments. The family catch-all (authorization plus custody in the payables process) would flag it, but the detector turns the catch-all off for a team of three or fewer (sod/detect familyFindings), so a three-person company gets nothing for the pair canon 4.3 lists first under disbursements.",
    },
  },
  {
    id: "construction-ten-person-partial-separation",
    name: "Ten-person contractor: a payroll clerk who adds employees and enters payroll, an AP clerk who enters bills and sets up vendors, a controller who approves bills, releases payment, reconciles and manages sign-ins, and foremen with fuel cards",
    business: "Keystone Site Services",
    industry: "construction",
    today: TODAY,
    team: [
      {
        name: "Frank Mahoney",
        role: "Owner",
        duties: ["sign_checks", "approve_vendor", "approve_payroll", "approve_expenses"],
      },
      {
        name: "Susan Albright",
        role: "Controller",
        duties: [
          "approve_invoices",
          "release_payment",
          "bank_reconcile",
          "review_card_statement",
          "manage_user_access",
        ],
      },
      { name: "Carlos Mendes", role: "AP Clerk", duties: ["enter_invoices", "create_vendor"] },
      {
        name: "Tina Baxter",
        role: "Payroll Clerk",
        duties: ["enter_payroll", "edit_payroll_master"],
      },
      {
        name: "Dwayne Carter",
        role: "Foreman",
        duties: ["hold_company_card", "order_supplies", "receive_goods"],
      },
      { name: "Luis Ortiz", role: "Foreman", duties: ["hold_company_card", "receive_goods"] },
      { name: "Ben Kowalczyk", role: "Estimator", duties: [] },
      { name: "Amy Chen", role: "Project Coordinator", duties: [] },
      { name: "Pete Russo", role: "Laborer", duties: [] },
      { name: "Jamal Wright", role: "Laborer", duties: [] },
    ],
    basis:
      "Construction note 2c: single signature on EFTs with the signer reconciling (cases C1, C2), payroll add/edit rights beside payroll entry (C9, C10 certified payroll), vendor setup beside bill entry (LBMC), receives materials on site and approves the supplier invoice. Canon 4.3 disbursements: approving an invoice and releasing its payment (Ramp).",
    expectOpenRuleIds: [
      "rule-release-rec",
      "rule-access-release",
      "rule-vendor-create-invoice",
      "rule-payroll-master-run",
      "rule-order-receive",
    ],
    expectClosedRuleIds: [
      "rule-card-review",
      "rule-invoice-pay",
      "rule-payroll",
      "rule-sign-rec",
      "rule-vendor-create-pay",
    ],
    expectOpenPairs: [["approve_invoices", "release_payment"]],
    expectFirstStepRuleId: "rule-release-rec",
    expectRecommendedProcedureIds: [
      "lib-bank-rec",
      "lib-release-payments",
      "lib-vendor-bank-change",
      "lib-payroll",
      "lib-receiving",
      "lib-leaver-access",
      "lib-new-vendor",
    ],
    expectActionPattern: /^Move release payments away from Susan Albright: it closes \d+/,
    knownGap: {
      pairs:
        "No named rule pairs approving bills for payment with releasing payments, and on a team above three the family catch-all skips a pair once either duty is already in a named finding for that person (sod/detect familyFindings), so a controller who releases, reconciles and approves bills is never told that approving and releasing is a pair (canon 4.3 disbursements).",
    },
  },

  // ------------------------------------------------------------ automotive
  {
    id: "automotive-owner-plus-service-writer",
    name: "Owner-operator repair shop with one service writer who writes repair orders, takes payment, posts it, voids and prepares the deposit",
    business: "Fairmont Auto Repair",
    industry: "automotive",
    today: TODAY,
    team: [
      {
        name: "Gus Antonelli",
        role: "Shop Owner",
        duties: ["bank_reconcile", "sign_checks", "approve_writeoffs"],
      },
      {
        name: "Derek Vance",
        role: "Service Writer",
        duties: [
          "submit_claims",
          "collect_cash",
          "post_payments",
          "post_adjustments",
          "prepare_deposit",
        ],
      },
    ],
    basis:
      "Auto note 2c pair 1 (writes and closes the RO, takes payment and can void it; cases A4, A5, A8) and pair 2 (takes cash at the counter and closes out the drawer; NCJRS retail guide). The owner's reconciliation beside check signing is the design (canon 4.2).",
    expectOpenRuleIds: [
      "rule-collect-post",
      "rule-collect-adjust",
      "rule-payments-adjust",
      "rule-deposit-post",
    ],
    expectClosedRuleIds: ["rule-custody-rec", "rule-sign-rec", "rule-cash-void", "rule-writeoff"],
    expectRecommendedProcedureIds: ["lib-cash-deposit", "lib-refund-review"],
    expectActionPattern: /away from Derek Vance: it closes \d+/,
  },
  {
    id: "automotive-three-person-office-manager",
    name: "Three-person shop whose office manager signs checks, holds the card and reads its statement, enters bills, posts, enters payroll, posts journals and reconciles",
    business: "Granger Motors & Service",
    industry: "automotive",
    today: TODAY,
    team: [
      {
        name: "Bill Hargrove",
        role: "Owner",
        duties: ["approve_vendor", "approve_payroll"],
      },
      {
        name: "Carol Jensen",
        role: "Office Manager",
        duties: [
          "sign_checks",
          "hold_company_card",
          "review_card_statement",
          "enter_invoices",
          "post_payments",
          "bank_reconcile",
          "post_journal_entries",
          "enter_payroll",
        ],
      },
      { name: "Ray Dominguez", role: "Technician", duties: [] },
    ],
    basis:
      "Auto note 2c pair 6 (writes checks, holds the company card, records them and reconciles; cases A1 and A3; FenderBender CPA) and pair 8 (runs payroll and keeps the books). Canon 4.3 bank reconciliation: the reconciler signs no checks (Oregon DOJ; Penn OACP), so the reconciliation moves first.",
    expectOpenRuleIds: [
      "rule-sign-rec",
      "rule-cash-rec",
      "rule-je-rec",
      "rule-invoice-pay",
      "rule-release-je",
      "rule-card-review",
      "rule-payroll-rec",
      "rule-payroll-release",
    ],
    expectClosedRuleIds: [
      "rule-card-approve",
      "rule-vendor-create-pay",
      "rule-payroll",
      "rule-custody-rec",
    ],
    expectFirstStepDutyId: "bank_reconcile",
    expectRecommendedProcedureIds: [
      "lib-bank-rec",
      "lib-release-payments",
      "lib-card-review",
      "lib-payroll",
      "lib-journal-review",
    ],
    expectActionPattern: /\b[Mm]ove reconcile the bank account away from Carol Jensen\b/,
  },
  {
    id: "automotive-nine-person-dealership",
    name: "Nine-person dealership: a parts manager who orders, receives and enters bills; a cashier who takes payment and refunds; an office manager who posts, adjusts, administers the DMS and runs payroll; a controller who releases payment, approves bills and reconciles",
    business: "Millbrook Motors",
    industry: "automotive",
    today: TODAY,
    team: [
      {
        name: "Harold Brennan",
        role: "Owner / Dealer Principal",
        duties: ["sign_checks", "approve_vendor", "approve_payroll", "approve_writeoffs"],
      },
      {
        name: "Nancy Whitfield",
        role: "Controller",
        duties: ["release_payment", "bank_reconcile", "approve_invoices", "review_audit_logs"],
      },
      {
        name: "Kevin Marsh",
        role: "Office Manager",
        duties: [
          "post_payments",
          "post_adjustments",
          "pms_admin_roles",
          "manage_user_access",
          "enter_payroll",
          "edit_payroll_master",
        ],
      },
      {
        name: "Steve Kowalski",
        role: "Parts Manager",
        duties: ["order_supplies", "receive_goods", "enter_invoices"],
      },
      { name: "Brianna Lopez", role: "Cashier", duties: ["collect_cash", "issue_refunds"] },
      { name: "Tom Reilly", role: "Sales Consultant", duties: [] },
      { name: "Dana Hughes", role: "Sales Consultant", duties: [] },
      { name: "Miguel Santos", role: "Technician", duties: [] },
      { name: "Jess Carter", role: "Technician", duties: [] },
    ],
    basis:
      "Auto note 2c pairs 3 (edits amounts received in the system and deposits; case A2), 4 (orders parts, receives them, approves the statement) and 6 (the Granger, Iowa office manager who wired himself $1.4 million and balanced the books: sending money out and reconciling is the critical pair, so it leads). Canon 4.3 user access (system administration beside transaction processing).",
    expectOpenRuleIds: [
      "rule-release-rec",
      "rule-payments-adjust",
      "rule-admin-pay",
      "rule-admin-writeoff",
      "rule-payroll-master-run",
      "rule-order-receive",
      "rule-cash-refund",
    ],
    expectClosedRuleIds: [
      "rule-invoice-pay",
      "rule-cash-rec",
      "rule-vendor-create-pay",
      "rule-access-log",
    ],
    expectFirstStepRuleId: "rule-release-rec",
    expectRecommendedProcedureIds: [
      "lib-bank-rec",
      "lib-refund-review",
      "lib-payroll",
      "lib-receiving",
      "lib-leaver-access",
    ],
    expectActionPattern: /^Move .+ away from (Nancy Whitfield|Kevin Marsh): it closes \d+/,
    knownGap: {
      firstStep:
        "The split step picks the move that lowers the open count the most (sod/duty-split chooseDutySplit: net, then count, then critical count). Taking system administration from the office manager closes two high pairs (net 2), so it beats taking payment release or the reconciliation from the controller, which closes the one critical pair (net 1). A CPA fixes the critical release-plus-reconcile pair first (canon 4.3 bank reconciliation; the Granger, Iowa dealership case).",
    },
  },

  // ------------------------------------------------------------- nonprofit
  {
    id: "nonprofit-church-volunteer-treasurer",
    name: "Small church whose volunteer treasurer counts the offering, deposits it, posts it, enters bills, signs checks, posts journals and reconciles; the pastor approves",
    business: "Grace Fellowship Church",
    industry: "nonprofit",
    today: TODAY,
    team: [
      {
        name: "Rev. Michael Adeyemi",
        role: "Pastor",
        duties: ["approve_invoices", "approve_expenses", "approve_payroll"],
      },
      {
        name: "Harold Finch",
        role: "Volunteer Treasurer",
        duties: [
          "collect_cash",
          "prepare_deposit",
          "post_payments",
          "enter_invoices",
          "sign_checks",
          "bank_reconcile",
          "post_journal_entries",
        ],
      },
    ],
    basis:
      "Nonprofit note 1c: counts the offering and is treasurer (Michigan UMC), signs checks and reconciles the bank statement (cases N4, N5, N10; Oregon DOJ: the reconciler does not issue or sign checks), keeps the books and receives the statement. A nonprofit has no owner, so every pair is open. The reconciliation moves first (canon 5, NY OSC: a board member reviews statements).",
    expectOpenRuleIds: [
      "rule-sign-rec",
      "rule-custody-rec",
      "rule-cash-rec",
      "rule-je-rec",
      "rule-invoice-pay",
      "rule-release-je",
      "rule-collect-post",
      "rule-deposit-post",
    ],
    expectClosedRuleIds: ["rule-payroll", "rule-card-review", "rule-vendor-create-pay"],
    expectFirstStepDutyId: "bank_reconcile",
    expectRecommendedProcedureIds: [
      "lib-bank-rec",
      "lib-cash-deposit",
      "lib-release-payments",
      "lib-mailed-checks",
      "lib-journal-review",
    ],
    expectActionPattern: /away from Harold Finch(?: to [^:]+)?: it closes \d+/,
  },
  {
    id: "nonprofit-three-person-executive-director",
    name: "Three-person charity whose executive director releases payments, signs checks and reconciles; a bookkeeper enters bills, sets up vendors, posts and enters payroll; a development director takes donations and prepares the deposit",
    business: "Riverside Youth Alliance",
    industry: "nonprofit",
    today: TODAY,
    team: [
      {
        name: "Dana Whitfield",
        role: "Executive Director",
        duties: ["release_payment", "sign_checks", "bank_reconcile", "approve_payroll"],
      },
      {
        name: "Ravi Menon",
        role: "Bookkeeper",
        duties: ["enter_invoices", "post_payments", "enter_payroll", "create_vendor"],
      },
      {
        name: "Lena Ortiz",
        role: "Development Director",
        duties: ["collect_cash", "prepare_deposit"],
      },
    ],
    basis:
      "Nonprofit note 1c: signs checks or has online banking and reconciles (cases N4, N5, N10; Oregon DOJ); the executive director is an employee the board oversees (industry.ts industryHasOwner), so the pair is open. Canon 4.3 vendor master (Ramp, Corpay) for the bookkeeper. Canon 5: a board member opens the bank statement first (NY OSC).",
    expectOpenRuleIds: ["rule-release-rec", "rule-vendor-create-invoice"],
    expectClosedRuleIds: ["rule-sign-rec", "rule-payroll", "rule-collect-post", "rule-invoice-pay"],
    expectFirstStepRuleId: "rule-release-rec",
    expectRecommendedProcedureIds: ["lib-bank-rec", "lib-vendor-bank-change", "lib-new-vendor"],
    expectActionPattern:
      /^A board member opens the bank statement first, before anyone else handles it/,
  },
  {
    id: "nonprofit-eight-person-partial-separation",
    name: "Eight-person nonprofit: the executive director releases payments, holds the card, approves expenses and manages sign-ins; a finance manager enters bills, posts, runs payroll and sets up vendors; a volunteer board treasurer reconciles and approves; a program director orders and receives; a development director takes donations, deposits and posts them",
    business: "Northern Lights Community Center",
    industry: "nonprofit",
    today: TODAY,
    team: [
      {
        name: "Teresa Lindgren",
        role: "Executive Director",
        duties: [
          "release_payment",
          "hold_company_card",
          "approve_expenses",
          "approve_payroll",
          "manage_user_access",
        ],
      },
      {
        name: "Owen Blackwood",
        role: "Finance Manager",
        duties: [
          "enter_invoices",
          "post_payments",
          "enter_payroll",
          "edit_payroll_master",
          "create_vendor",
          "review_card_statement",
        ],
      },
      {
        name: "Margaret Hsu",
        role: "Board Treasurer (volunteer)",
        duties: ["bank_reconcile", "approve_invoices", "approve_vendor"],
      },
      {
        name: "Derek Oyelaran",
        role: "Program Director",
        duties: ["order_supplies", "receive_goods"],
      },
      {
        name: "Sophie Marchand",
        role: "Development Director",
        duties: ["collect_cash", "prepare_deposit", "post_payments"],
      },
      { name: "Alex Rivera", role: "Program Coordinator", duties: [] },
      { name: "Jun Park", role: "Program Coordinator", duties: [] },
      { name: "Fatima Noor", role: "Volunteer Coordinator", duties: [] },
    ],
    basis:
      "Nonprofit note 1c: holds the debit card and approves card spend (case N6 DiFlorio), opens the mail and posts donations and prepares the deposit (Oregon DOJ; Nonprofit Accounting Basics), sole online-banking user who controls access. Payroll master beside payroll entry (Washington SAO guide). Vendor master beside bill entry (canon 4.3).",
    expectOpenRuleIds: [
      "rule-card-approve",
      "rule-access-release",
      "rule-vendor-create-invoice",
      "rule-payroll-master-run",
      "rule-order-receive",
      "rule-collect-post",
      "rule-deposit-post",
    ],
    expectClosedRuleIds: [
      "rule-card-review",
      "rule-invoice-pay",
      "rule-release-rec",
      "rule-payroll",
    ],
    expectRecommendedProcedureIds: [
      "lib-card-review",
      "lib-release-payments",
      "lib-vendor-bank-change",
      "lib-payroll",
      "lib-receiving",
      "lib-cash-deposit",
      "lib-leaver-access",
      "lib-new-vendor",
    ],
    expectActionPattern:
      /^A board member opens the bank statement first, before anyone else handles it/,
  },

  // --------------------------------------------------------------- general
  {
    id: "general-owner-plus-part-time-bookkeeper",
    name: "Owner-operator with a part-time bookkeeper who administers the accounting system, enters bills, pays them, posts receipts, reads the card statement and reconciles",
    business: "Pinecrest Landscaping",
    industry: "general",
    today: TODAY,
    team: [
      {
        name: "Doug Whitaker",
        role: "Owner",
        duties: ["sign_checks", "approve_invoices", "approve_payroll", "hold_company_card"],
      },
      {
        name: "Linda Marsh",
        role: "Bookkeeper",
        duties: [
          "pms_admin_roles",
          "enter_invoices",
          "release_payment",
          "bank_reconcile",
          "post_payments",
          "review_card_statement",
        ],
      },
    ],
    basis:
      "General note 3c: enters bills, pays them and reconciles (Prager Metis; GrowthForce), the bookkeeper cannot sign or release checks and someone other than the bookkeeper reconciles (Aptora), accounting-system admin beside day-to-day bookkeeping (Intuit roles). The first step answers the critical release-plus-reconcile pair (Aptora: someone other than the bookkeeper reconciles); the brief moves payment release to the owner, who already signs.",
    expectOpenRuleIds: ["rule-invoice-pay", "rule-release-rec", "rule-cash-rec", "rule-admin-pay"],
    expectClosedRuleIds: [
      "rule-card-review",
      "rule-sign-rec",
      "rule-card-approve",
      "rule-vendor-create-pay",
    ],
    expectFirstStepRuleId: "rule-release-rec",
    expectRecommendedProcedureIds: ["lib-release-payments", "lib-bank-rec", "lib-leaver-access"],
    expectActionPattern: /^Move release payments away from Linda Marsh: it closes \d+/,
  },
  {
    id: "general-three-person-office-manager-payroll-and-card",
    name: "Three-person business whose office manager holds the card and reads its statement, approves expense claims, enters payroll, changes pay records and approves payroll; a technician takes and posts payments",
    business: "Clearwater Plumbing",
    industry: "general",
    today: TODAY,
    team: [
      {
        name: "Sarah Donnelly",
        role: "Owner",
        duties: ["sign_checks", "bank_reconcile", "approve_vendor"],
      },
      {
        name: "Chen Wei",
        role: "Office Manager",
        duties: [
          "hold_company_card",
          "review_card_statement",
          "approve_expenses",
          "enter_payroll",
          "edit_payroll_master",
          "approve_payroll",
        ],
      },
      {
        name: "Marcus Bell",
        role: "Technician",
        duties: ["collect_cash", "post_payments"],
      },
    ],
    basis:
      "General note 3c: holds company cards and receives and edits the card statements (cases G3, G4, C4), runs payroll with direct-deposit rights and is the only person who sees the register (G1, G2, G5, G7, G8), handling cash and recording cash (Doeren Mayhew). Nonprofit note N7: sets own pay and approves it.",
    expectOpenRuleIds: [
      "rule-card-review",
      "rule-card-approve",
      "rule-payroll-master-run",
      "rule-payroll",
      "rule-collect-post",
    ],
    expectClosedRuleIds: ["rule-sign-rec", "rule-custody-rec", "rule-cash-rec", "rule-invoice-pay"],
    expectOpenPairs: [["edit_payroll_master", "approve_payroll"]],
    expectRecommendedProcedureIds: ["lib-card-review", "lib-payroll", "lib-cash-deposit"],
    expectActionPattern: /away from Chen Wei: it closes \d+/,
    knownGap: {
      pairs:
        "No rule pairs changing employee records with approving payroll, and the family catch-all leaves master-data duties out (sod/rule-match familiesConflict), so the person who can raise their own rate and approve the run is told only about entering payroll. General note 3c (cases G1, G2, G5) and nonprofit note N7 Northcutt ran this way.",
    },
  },
  {
    id: "general-eleven-person-partial-separation",
    name: "Eleven-person business: an AR clerk who posts, adjusts and refunds; an AP clerk who enters bills, sets up vendors and holds a card; a controller who releases payment by ACH, reconciles, posts journals and administers access; a payroll administrator; a warehouse lead who orders and receives",
    business: "Tristate Industrial Supply",
    industry: "general",
    today: TODAY,
    team: [
      {
        name: "Robert Hansen",
        role: "Owner",
        duties: [
          "sign_checks",
          "approve_vendor",
          "approve_payroll",
          "approve_writeoffs",
          "approve_expenses",
        ],
      },
      {
        name: "Patricia Ngo",
        role: "Controller",
        duties: [
          "release_payment",
          "initiate_ach",
          "bank_reconcile",
          "post_journal_entries",
          "manage_user_access",
          "review_audit_logs",
          "approve_invoices",
        ],
      },
      {
        name: "Jamie Foster",
        role: "AP Clerk",
        duties: ["enter_invoices", "create_vendor", "hold_company_card"],
      },
      {
        name: "Nadia Petrosyan",
        role: "AR Clerk",
        duties: ["post_payments", "post_adjustments", "issue_refunds", "edit_patient_master"],
      },
      {
        name: "Greg Oduya",
        role: "Payroll Administrator",
        duties: ["enter_payroll", "edit_payroll_master"],
      },
      {
        name: "Hector Ramirez",
        role: "Warehouse Lead",
        duties: ["order_supplies", "receive_goods"],
      },
      { name: "Kim Larsen", role: "Sales Representative", duties: [] },
      { name: "Paul Egan", role: "Sales Representative", duties: [] },
      { name: "Angela Moss", role: "Customer Service", duties: [] },
      { name: "Sven Holm", role: "Driver", duties: [] },
      { name: "Tasha Green", role: "Driver", duties: [] },
    ],
    basis:
      "General note 3c: receiving funds, disbursing, signing and reconciling are split (Prager Metis), accounting-system admin beside bookkeeping (Intuit), vendor record updates beside payment release (Kognitos). Canon 4.3 user access (NIST AC-5; UNT) and journal entries (Penn OACP). The owner already signs, so the controller's payment release moves to the owner first.",
    expectOpenRuleIds: [
      "rule-release-rec",
      "rule-ach-release",
      "rule-release-je",
      "rule-je-rec",
      "rule-access-log",
      "rule-access-release",
      "rule-vendor-create-invoice",
      "rule-payments-adjust",
      "rule-refund-post",
      "rule-refund-adjust",
      "rule-payroll-master-run",
      "rule-order-receive",
    ],
    expectClosedRuleIds: [
      "rule-invoice-pay",
      "rule-cash-rec",
      "rule-vendor-create-pay",
      "rule-card-review",
      "rule-payroll",
      "rule-sign-rec",
    ],
    expectFirstStepDutyId: "release_payment",
    expectRecommendedProcedureIds: [
      "lib-release-payments",
      "lib-bank-rec",
      "lib-leaver-access",
      "lib-refund-review",
      "lib-vendor-bank-change",
      "lib-payroll",
      "lib-receiving",
      "lib-journal-review",
      "lib-access-review",
      "lib-new-vendor",
    ],
    expectActionPattern: /^Move release payments away from Patricia Ngo: it closes \d+/,
  },
];
