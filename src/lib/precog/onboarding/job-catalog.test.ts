import { describe, expect, it } from "vitest";
import {
  JOB_CATALOG,
  entitlementsForTitle,
  jobCatalogMissingDescriptions,
  jobCatalogUnknownEntitlements,
  matchJobTitle,
} from "./job-catalog";

describe("job catalog", () => {
  it("cites only duties the rulebook defines, and every entry carries at least one", () => {
    expect(jobCatalogUnknownEntitlements()).toEqual([]);
    for (const e of JOB_CATALOG) expect(e.entitlements.length, e.id).toBeGreaterThan(0);
  });

  it("describes every job in one bounded sentence and records only well-formed SOC codes", () => {
    expect(jobCatalogMissingDescriptions()).toEqual([]);
    for (const e of JOB_CATALOG) {
      expect(e.description.length, e.id).toBeLessThanOrEqual(220);
      expect(e.description.endsWith("."), e.id).toBe(true);
      if (e.soc) expect(e.soc, e.id).toMatch(/^\d{2}-\d{4}$/);
    }
    expect(JOB_CATALOG.length).toBeGreaterThanOrEqual(80);
  });

  it("reads the hospitality, dealership, property, and nonprofit titles HR systems carry", () => {
    expect(matchJobTitle("Night Auditor")?.entry.id).toBe("night-auditor");
    expect(matchJobTitle("Guest Services Agent")?.entry.id).toBe("hotel-front-desk");
    expect(matchJobTitle("Service Advisor")?.entry.id).toBe("service-advisor");
    expect(matchJobTitle("F&I Manager")?.entry.id).toBe("fi-manager");
    expect(matchJobTitle("Delivery Driver")?.entry.id).toBe("driver");
    expect(matchJobTitle("Community Association Manager")?.entry.id).toBe("property-manager");
    expect(matchJobTitle("Director of Development")?.entry.id).toBe("development-director");
    expect(matchJobTitle("Assistant Controller")?.entry.id).toBe("controller");
    expect(matchJobTitle("Revenue Cycle Manager")?.entry.id).toBe("billing-manager");
  });

  it("keeps ids and aliases unique across entries", () => {
    const ids = JOB_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const seen = new Map<string, string>();
    for (const e of JOB_CATALOG) {
      for (const alias of new Set([e.title.toLowerCase(), ...e.aliases])) {
        expect(
          seen.get(alias),
          `alias "${alias}" in ${e.id} and ${seen.get(alias)}`,
        ).toBeUndefined();
        seen.set(alias, e.id);
      }
    }
  });

  it("matches exact titles, aliases, and seniority variants", () => {
    expect(matchJobTitle("Bookkeeper")?.entry.id).toBe("bookkeeper");
    expect(matchJobTitle("Full-Charge Bookkeeper")?.entry.id).toBe("bookkeeper");
    expect(matchJobTitle("Senior AP Clerk (part-time)")?.entry.id).toBe("accounts-payable");
    expect(matchJobTitle("Accounts Payable Specialist II")?.entry.id).toBe("accounts-payable");
    expect(matchJobTitle("Sr. Payroll & Benefits Administrator")?.entry.id).toBe("payroll");
    expect(matchJobTitle("RDH")?.entry.id).toBe("dental-hygienist");
  });

  it("reads the first known part of a combined title and reports partial confidence", () => {
    const combo = matchJobTitle("Office Manager / Bookkeeper");
    expect(combo?.entry.id).toBe("office-manager");
    expect(combo?.confidence).toBe("partial");
    expect(matchJobTitle("Front Desk - Evenings")?.entry.id).toBe("receptionist");
  });

  it("does not let a single-word alias swallow a longer title it does not describe", () => {
    expect(matchJobTitle("Sales Associate")?.entry.id).toBe("cashier");
    expect(matchJobTitle("Associate Attorney")?.entry.id).toBe("attorney");
    expect(matchJobTitle("Dental Assistant")?.entry.id).toBe("dental-assistant");
    expect(matchJobTitle("Assistant Manager")?.entry.id).toBe("assistant-manager");
  });

  it("gives no money duties to a level word the catalog does not know as a whole title", () => {
    for (const title of [
      "Associate",
      "Manager",
      "Director",
      "Supervisor",
      "Case Manager",
      "Lab Manager",
      "Tax Manager",
      "Assistant",
    ]) {
      expect(matchJobTitle(title), title).toBeUndefined();
    }
    // A single word that names a seat still counts wherever it sits.
    expect(matchJobTitle("Billing Supervisor")?.entry.id).toBe("billing");
    expect(entitlementsForTitle("Nursing Supervisor")).not.toContain("prepare_deposit");
    expect(matchJobTitle("Clerk, Accounts Receivable")?.entry.id).toBe("accounts-receivable");
    expect(matchJobTitle("Specialist, Accounts Payable")?.entry.id).toBe("accounts-payable");
    expect(matchJobTitle("Marketing Intern")?.entry.id).toBe("intern");
    expect(matchJobTitle("Sr. Acct")?.entry.id).toBe("accountant");
    expect(matchJobTitle("A/P Clerk")?.entry.id).toBe("accounts-payable");
    expect(matchJobTitle("Payroll & HR Administrator")?.entitlements).toEqual(
      expect.arrayContaining(["enter_payroll", "edit_payroll_master"]),
    );
    expect(matchJobTitle("Line Cook")?.entry.id).toBe("kitchen-staff");
    expect(matchJobTitle("Room Attendant")?.entry.id).toBe("housekeeping-staff");
    expect(matchJobTitle("Social Media Community Manager")?.entry.id).toBe("marketing");
    expect(matchJobTitle("Senior Buyer")?.entry.id).toBe("purchasing");
    expect(matchJobTitle("Payroll and Benefits Supervisor")?.entry.id).toBe("payroll");
    // A level word on a seat with no money duties is harmless and keeps the label.
    expect(matchJobTitle("Security Supervisor")?.entry.id).toBe("security");
    expect(matchJobTitle("Sales Engineer")?.entry.id).toBe("consultant");
    expect(matchJobTitle("Product Manager")?.entry.id).toBe("consultant");
    expect(matchJobTitle("Payroll Analyst")?.entry.id).toBe("payroll");
    expect(matchJobTitle("Dealer Principal")?.entry.id).toBe("owner");
    expect(matchJobTitle("Parts Counterperson")?.entry.id).toBe("parts");
    expect(matchJobTitle("Firm Administrator")?.entry.id).toBe("firm-administrator");
    expect(entitlementsForTitle("Diesel Technician")).toEqual(["view_reports_only"]);
    expect(matchJobTitle("HVAC Service Tech")?.entry.id).toBe("field-technician");
    // A bare level word resolves by line of business, and stays unknown elsewhere.
    expect(matchJobTitle("Associate", "professional_services")?.entry.id).toBe("attorney");
    expect(matchJobTitle("Associate", "retail")?.entry.id).toBe("cashier");
    expect(matchJobTitle("Assistant", "dental")?.entry.id).toBe("dental-assistant");
    expect(matchJobTitle("Associate", "general")).toBeUndefined();
    expect(matchJobTitle("Office & HR Manager")?.entitlements).toEqual(
      expect.arrayContaining(["post_payments", "edit_payroll_master"]),
    );
  });

  it("keeps contract titles whole instead of reading 'contract' as a decoration", () => {
    expect(matchJobTitle("Contract Manager")?.entry.id).toBe("contracts-administrator");
    expect(matchJobTitle("Contracts Administrator (part-time)")?.entry.id).toBe(
      "contracts-administrator",
    );
    expect(matchJobTitle("Bookkeeper (contract)")?.entry.id).toBe("bookkeeper");
    expect(matchJobTitle("Contract Bookkeeper")?.entry.id).toBe("bookkeeper");
  });

  it("reads a combined title as every seat it names, with all their duties", () => {
    const combo = matchJobTitle("Office Manager / Bookkeeper");
    expect(combo?.entry.id).toBe("office-manager");
    expect(combo?.entitlements).toEqual(
      expect.arrayContaining(["post_payments", "release_payment", "bank_reconcile"]),
    );
    expect(matchJobTitle("Chef/Owner")?.entry.id).toBe("owner");
    expect(matchJobTitle("Chef/Owner")?.entitlements).toEqual(
      expect.arrayContaining(["sign_checks", "order_supplies"]),
    );
    expect(matchJobTitle("HR/Payroll Admin")?.entitlements).toEqual(
      expect.arrayContaining(["edit_payroll_master", "enter_payroll"]),
    );
    expect(matchJobTitle("Owner-Operator")?.entry.id).toBe("owner");
    expect(matchJobTitle("Owner/Operator")?.entry.id).toBe("owner");
    expect(entitlementsForTitle("Server/Bartender")).toEqual(["collect_cash", "view_reports_only"]);
  });

  it("seats cleaners, board members, cash office staff and service managers on their own duties", () => {
    expect(entitlementsForTitle("Janitor")).toEqual(["view_reports_only"]);
    expect(matchJobTitle("Maintenance Tech")?.entry.id).toBe("custodial");
    expect(matchJobTitle("HVAC Technician")?.entry.id).toBe("field-technician");
    expect(entitlementsForTitle("Board Member")).toEqual(["view_reports_only"]);
    expect(matchJobTitle("Board Treasurer")?.entry.id).toBe("board-treasurer");
    expect(matchJobTitle("Cash Office Associate")?.entry.id).toBe("cash-office");
    expect(matchJobTitle("Deposit Clerk")?.entry.id).toBe("cash-office");
    expect(matchJobTitle("AP Manager")?.entry.id).toBe("accounts-payable");
    expect(matchJobTitle("Collections Manager")?.entry.id).toBe("accounts-receivable");
    expect(matchJobTitle("Service Manager")?.entry.id).toBe("service-manager");
    expect(matchJobTitle("Night Manager")?.entry.id).toBe("shift-lead");
    expect(matchJobTitle("Reconciliation Specialist")?.entry.id).toBe("accountant");
    expect(matchJobTitle("Lot Attendant")?.entry.id).toBe("automotive-support");
  });

  it("returns nothing for an unknown title so the owner ticks duties by hand", () => {
    expect(matchJobTitle("Chief Happiness Wrangler")).toBeUndefined();
    expect(entitlementsForTitle("Chief Happiness Wrangler")).toEqual([]);
    expect(matchJobTitle("")).toBeUndefined();
  });

  it("never gives the owner's seat to a title that only names the owner as the person served", () => {
    for (const title of [
      "Owner's Assistant",
      "CEO's Assistant",
      "Owner Assistant",
      "Assistant to Owner/CEO",
      "Executive Assistant to the President",
    ]) {
      expect(matchJobTitle(title)?.entry.id, title).toBe("executive-assistant");
    }
    for (const title of [
      "Owner Relations Manager",
      "Owner's Rep",
      "Owner Services Coordinator",
      "Card Dealer",
    ]) {
      expect(matchJobTitle(title), title).toBeUndefined();
    }
    const son = matchJobTitle("Bookkeeper (Owner's son)");
    expect(son?.entry.id).toBe("bookkeeper");
    expect(son?.entitlements).not.toContain("sign_checks");
    const reports = matchJobTitle("Office Manager - reports to Owner");
    expect(reports?.entry.id).toBe("office-manager");
    expect(reports?.entitlements).not.toContain("approve_payroll");
    expect(matchJobTitle("Office Manager (Owner's wife)")?.entry.id).toBe("office-manager");
    // The owner's own titles still take the seat.
    for (const title of ["Owner", "Salon Owner", "Chef/Owner", "Owner/President", "Dealer"]) {
      expect(matchJobTitle(title)?.entry.id, title).toBe("owner");
    }
  });

  it("reads Acct by the word after it: Acct Exec is sales, Acct Clerk is accounting", () => {
    for (const title of ["Acct Exec", "Acct Manager", "Acct Mgr", "Acct Rep", "Key Acct Manager"]) {
      const match = matchJobTitle(title);
      expect(match?.entry.id, title).toBe("sales");
      expect(match?.entitlements, title).not.toContain("bank_reconcile");
    }
    expect(matchJobTitle("Acct Clerk")?.entry.id).toBe("bookkeeper");
    expect(matchJobTitle("Staff Acct")?.entry.id).toBe("accountant");
    expect(matchJobTitle("Acct")?.entry.id).toBe("accountant");
  });

  it("gives a combined A/P & A/R clerk both sides' duties however the title is spelt", () => {
    for (const title of [
      "A/P & A/R Clerk",
      "Accounts Payable and Receivable Clerk",
      "Accounts Payable & Receivable Specialist",
      "Accounts Payable/Receivable Clerk",
      "AP/AR Clerk",
    ]) {
      const match = matchJobTitle(title);
      expect(match?.entry.id, title).toBe("accounts-payable");
      expect(match?.entitlements, title).toEqual(
        expect.arrayContaining(["enter_invoices", "create_vendor"]),
      );
      expect(match?.entitlements, title).toEqual(
        expect.arrayContaining(["post_payments", "post_adjustments"]),
      );
    }
  });

  it("seats Accounting Apprentice, Student and Volunteer as learners with no money duty", () => {
    for (const title of [
      "Accounting Apprentice",
      "Accounting Student",
      "Accounting Volunteer",
      "Accounting Intern (Summer)",
    ]) {
      expect(matchJobTitle(title)?.entry.id, title).toBe("intern");
      expect(entitlementsForTitle(title), title).toEqual(["view_reports_only"]);
    }
    // A volunteer bookkeeper keeps the books; an apprentice electrician works the job.
    expect(matchJobTitle("Volunteer Bookkeeper")?.entry.id).toBe("bookkeeper");
    expect(matchJobTitle("Bookkeeper (Volunteer)")?.entry.id).toBe("bookkeeper");
    expect(matchJobTitle("Apprentice Electrician")?.entry.id).toBe("field-technician");
  });

  it("seats trade and clinic titles with the duties they hold at a small contractor or clinic", () => {
    for (const title of ["Dispatcher/CSR", "CSR/Dispatcher"]) {
      const match = matchJobTitle(title, "general");
      expect(match?.entry.id, title).toBe("dispatcher");
      expect(match?.entitlements, title).toContain("collect_cash");
      expect(match?.entitlements, title).not.toContain("issue_refunds");
      expect(match?.entitlements, title).not.toContain("post_adjustments");
    }
    for (const title of ["Project Manager", "Project Mgr - Plumbing"]) {
      expect(entitlementsForTitle(title, "general"), title).toEqual(["view_reports_only"]);
    }
    const estimator = entitlementsForTitle("Estimator - Sr.", "general");
    expect(estimator).toContain("change_fee_schedule");
    expect(estimator).not.toContain("approve_writeoffs");
    expect(entitlementsForTitle("Foreman - Install Crew", "general")).not.toContain(
      "enter_payroll",
    );
    const controller = entitlementsForTitle("Controller - Part Time", "general");
    expect(controller).toEqual(
      expect.arrayContaining(["release_payment", "bank_reconcile", "post_journal_entries"]),
    );
    expect(controller).not.toContain("approve_payroll");
    expect(controller).not.toContain("approve_vendor");
    for (const title of ["Owner/President", "Physician/Owner"]) {
      expect(entitlementsForTitle(title, "general"), title).not.toContain("bank_reconcile");
    }
    for (const title of ["Nurse Practitioner (FNP-C)", "Associate Dentist (DMD) - PT"]) {
      expect(entitlementsForTitle(title, "dental"), title).toEqual(["view_reports_only"]);
    }
    // A dental or medical office manager usually reconciles the bank as well.
    expect(entitlementsForTitle("Office Manager", "dental")).toContain("bank_reconcile");
    expect(entitlementsForTitle("Practice Manager", "dental")).toContain("bank_reconcile");
    expect(entitlementsForTitle("Office Manager", "general")).not.toContain("bank_reconcile");
  });

  it("gives a marketing coordinator no bill entry or payment release and reads four more titles", () => {
    const marketing = entitlementsForTitle("Marketing Coordinator", "dental");
    expect(marketing).not.toContain("enter_invoices");
    expect(marketing).not.toContain("release_payment");
    expect(matchJobTitle("Business Assistant", "dental")?.entry.id).toBe("receptionist");
    expect(matchJobTitle("Parts Runner", "general")?.entry.id).toBe("receiving");
    expect(matchJobTitle("Install Manager", "general")?.entry.id).toBe("foreman");
    expect(matchJobTitle("Crew Lead", "general")?.entry.id).toBe("foreman");
    expect(matchJobTitle("Crew Leader", "general")?.entry.id).toBe("foreman");
    expect(matchJobTitle("Crew Lead", "restaurant")?.entry.id).toBe("shift-lead");
  });

  it("seats a 12-person law firm: the firm administrator reconciles, paralegals and associates hold no money duty", () => {
    const law = "professional_services";
    const admin = entitlementsForTitle("Firm Administrator", law);
    expect(admin).toEqual(
      expect.arrayContaining([
        "bank_reconcile",
        "release_payment",
        "enter_invoices",
        "create_vendor",
      ]),
    );
    expect(admin).not.toContain("post_payments");
    expect(admin).not.toContain("post_adjustments");
    for (const title of [
      "Sr. Paralegal",
      "Paralegal, Litigation",
      "Paralegal (Part-Time)",
      "Legal Assistant / Secretary",
      "Senior Associate",
      "Associate",
      "Associate Attorney - Litigation",
    ]) {
      expect(entitlementsForTitle(title, law), title).toEqual(["view_reports_only"]);
    }
    // The front desk takes client payments; billing records them.
    const desk = entitlementsForTitle("Receptionist", law);
    expect(desk).toContain("collect_cash");
    expect(desk).not.toContain("post_payments");
    expect(entitlementsForTitle("Receptionist", "dental")).toContain("post_payments");
    for (const title of ["Equity Partner", "Name Partner"]) {
      expect(matchJobTitle(title, law)?.entry.id, title).toBe("owner");
    }
  });

  it("seats a three-store retailer: the bookkeeper sets up suppliers, assistant managers and keyholders get narrower seats", () => {
    const bookkeeper = entitlementsForTitle("Bookkeeper", "retail");
    expect(bookkeeper).toEqual(expect.arrayContaining(["create_vendor", "release_payment"]));
    // The till records a store's sales, so the bookkeeper does not record customer payments.
    expect(bookkeeper).not.toContain("post_payments");
    expect(entitlementsForTitle("Bookkeeper", "general")).toEqual(
      expect.arrayContaining(["post_payments", "create_vendor"]),
    );
    const store = entitlementsForTitle("Store Manager", "retail");
    expect(store).toEqual(
      expect.arrayContaining(["collect_cash", "prepare_deposit", "issue_refunds", "receive_goods"]),
    );
    for (const duty of ["order_supplies", "enter_payroll", "manage_user_access"] as const) {
      expect(store, duty).not.toContain(duty);
    }
    for (const title of ["Assistant Store Manager", "Assistant Manager"]) {
      const match = matchJobTitle(title, "retail");
      expect(match?.entry.id, title).toBe("assistant-manager");
      expect(match?.entitlements, title).not.toContain("order_supplies");
    }
    expect(entitlementsForTitle("Keyholder", "retail")).not.toContain("issue_refunds");
    expect(entitlementsForTitle("E-commerce Coordinator", "retail")).toEqual([
      "issue_refunds",
      "view_reports_only",
    ]);
    expect(matchJobTitle("Inventory Associate", "retail")?.entry.id).toBe("receiving");
  });

  it("seats a veterinary hospital and a childcare center by their own titles", () => {
    for (const title of ["Client Service Representative", "CSR"]) {
      const match = matchJobTitle(title, "dental");
      expect(match?.entry.id, title).toBe("receptionist");
      expect(match?.entitlements, title).not.toContain("issue_refunds");
    }
    expect(matchJobTitle("Client Service Representative", "general")?.entry.id).toBe(
      "receptionist",
    );
    const hospital = matchJobTitle("Hospital Manager", "dental");
    expect(hospital?.entry.id).toBe("office-manager");
    expect(hospital?.entitlements).toEqual(
      expect.arrayContaining(["release_payment", "bank_reconcile", "enter_payroll"]),
    );
    expect(entitlementsForTitle("Office Administrator", "general")).toEqual([
      "enter_invoices",
      "release_payment",
      "view_reports_only",
    ]);
    const assistant = matchJobTitle("Asst. Director", "general");
    expect(assistant?.entry.id).toBe("assistant-director");
    expect(assistant?.entitlements).toEqual(
      expect.arrayContaining(["collect_cash", "post_payments"]),
    );
    for (const title of ["School Age Lead", "Floater"]) {
      expect(matchJobTitle(title, "general")?.entry.id, title).toBe("teacher");
    }
    expect(matchJobTitle("Inventory Coordinator", "dental")?.entry.id).toBe("receiving");
    for (const title of ["Bus Driver", "Van Driver", "School Bus Driver"]) {
      expect(entitlementsForTitle(title, "general"), title).toEqual(["view_reports_only"]);
    }
    expect(entitlementsForTitle("Delivery Driver", "general")).toContain("collect_cash");
  });

  it("seats a repair shop: apprentices hold no cash and the service advisor records payments", () => {
    for (const title of [
      "Apprentice Technician",
      "Apprentice Tech",
      "Apprentice",
      "General Service Technician",
    ]) {
      expect(entitlementsForTitle(title, "general"), title).toEqual(["view_reports_only"]);
    }
    expect(matchJobTitle("Apprentice Electrician")?.entry.id).toBe("field-technician");
    const advisor = entitlementsForTitle("Service Advisor", "general");
    expect(advisor).toEqual(expect.arrayContaining(["collect_cash", "post_payments"]));
    expect(advisor).not.toContain("approve_writeoffs");
  });

  it("gives a well-segregated finance team defaults that fit it: CFO, AP, AR lead, marketing, IT, sales", () => {
    const cfo = matchJobTitle("Chief Financial Officer", "general");
    expect(cfo?.entry.id).toBe("cfo");
    expect(cfo?.entitlements).toEqual(expect.arrayContaining(["approve_vendor", "sign_checks"]));
    expect(cfo?.entitlements).not.toContain("release_payment");
    expect(cfo?.entitlements).not.toContain("bank_reconcile");
    expect(entitlementsForTitle("Controller", "general")).toEqual(
      expect.arrayContaining(["release_payment", "bank_reconcile"]),
    );
    expect(entitlementsForTitle("Accounts Payable Specialist II", "general")).not.toContain(
      "release_payment",
    );
    for (const title of [
      "Marketing & Community Outreach Coordinator",
      "Marketing & Events Coordinator",
      "Marketing Coordinator",
    ]) {
      expect(entitlementsForTitle(title, "general"), title).toEqual(["view_reports_only"]);
    }
    expect(entitlementsForTitle("Revenue Cycle Lead - AR & Billing", "general")).not.toContain(
      "issue_refunds",
    );
    expect(entitlementsForTitle("IT Administrator", "general")).not.toContain("review_audit_logs");
    for (const title of ["Territory Sales Rep", "Sales Representative", "Comfort Advisor"]) {
      expect(entitlementsForTitle(title, "restaurant"), title).not.toContain("approve_writeoffs");
    }
  });

  it("trims restaurant, property, pantry and clinic defaults the CPA corrected", () => {
    for (const title of ["Host (PT)", "Busser", "Food Runner", "Barback"]) {
      expect(entitlementsForTitle(title, "restaurant"), title).toEqual(["view_reports_only"]);
    }
    expect(matchJobTitle("Beertender", "restaurant")?.entry.id).toBe("bartender");
    expect(entitlementsForTitle("Shift Lead", "restaurant")).not.toContain("issue_refunds");
    expect(entitlementsForTitle("Assistant Manager", "restaurant")).toEqual([
      "collect_cash",
      "prepare_deposit",
      "issue_refunds",
      "view_reports_only",
    ]);
    expect(matchJobTitle("General Manager", "restaurant")?.entry.id).toBe("restaurant-manager");
    expect(entitlementsForTitle("Board Treasurer", "general")).not.toContain("bank_reconcile");
    const apm = entitlementsForTitle("Assistant Property Manager", "general");
    expect(apm).toEqual(["collect_cash", "post_payments", "view_reports_only"]);
    expect(matchJobTitle("Finance & Operations Manager", "general")?.entry.id).toBe("bookkeeper");
    expect(entitlementsForTitle("Medical Assistant (CMA)", "dental")).toEqual([
      "view_reports_only",
    ]);
    // A nurse who is also the office manager holds both seats.
    expect(matchJobTitle("Nurse/Office Manager")?.entitlements).toEqual(
      expect.arrayContaining(["post_payments", "enter_payroll"]),
    );
  });

  it("reads brewery, taproom and clinic-site titles", () => {
    expect(matchJobTitle("Taproom Manager", "restaurant")?.entry.id).toBe("bar-manager");
    for (const title of [
      "Brewer",
      "Brewer II",
      "Assistant Brewer",
      "Cellarperson",
      "Packaging Lead",
    ]) {
      expect(entitlementsForTitle(title, "restaurant"), title).toEqual(["view_reports_only"]);
    }
    expect(entitlementsForTitle("Head Brewer / Brewmaster", "restaurant")).toEqual(
      expect.arrayContaining(["order_supplies", "receive_goods"]),
    );
    for (const title of [
      "Clinic Director - Lakeside",
      "Clinic Director, Northfield (DPT)",
      "Clinic Dir. - Eastgate",
    ]) {
      const match = matchJobTitle(title, "general");
      expect(match?.entry.id, title).toBe("clinic-site-director");
      expect(match?.entitlements, title).toEqual(
        expect.arrayContaining(["approve_writeoffs", "enter_payroll", "prepare_deposit"]),
      );
    }
  });

  it("reads an assistant named for whom they support as an assistant, not that person's seat", () => {
    for (const title of [
      "Assistant to the Controller",
      "Asst. to the Controller",
      "Assistant to the Office Manager",
      "Secretary to the Board",
    ]) {
      expect(matchJobTitle(title)?.entry.id, title).toBe("administrative-assistant");
    }
    expect(matchJobTitle("Executive Assistant to the CFO")?.entry.id).toBe("executive-assistant");
    expect(matchJobTitle("Assistant Controller")?.entry.id).toBe("controller");
    const reports = matchJobTitle("Office Manager - reports to Controller");
    expect(reports?.entry.id).toBe("office-manager");
    expect(reports?.entitlements).not.toContain("post_journal_entries");
  });

  it("gives the office manager the wide seat the case library describes", () => {
    const duties = entitlementsForTitle("Practice Manager");
    expect(duties).toEqual(
      expect.arrayContaining(["post_payments", "release_payment", "enter_payroll"]),
    );
  });
});
