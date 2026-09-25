import type { IndustryId } from "../industry";

export function bandReadiness(n: number): "high" | "solid" | "partial" | "fragile" {
  if (n >= 80) return "high";
  if (n >= 60) return "solid";
  if (n >= 40) return "partial";
  return "fragile";
}

export function bandConfidence(n: number): "high" | "good" | "moderate" | "low" {
  if (n >= 78) return "high";
  if (n >= 60) return "good";
  if (n >= 42) return "moderate";
  return "low";
}

export function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** The words the inventory uses for this line of business. Wording only: no item is added or dropped. */
export interface InventoryWords {
  /** The system of record: "PMS", "POS", "billing system". */
  system: string;
  /** Who pays: "patient", "customer", "guest", "client". */
  payer: string;
  /** Two roles that could collude, for the collusion example. */
  pair: string;
  /** Outside partners that could inject fraud. */
  partners: string;
  partnerFraud: string;
  partnerCheck: string;
  /** The regulator item's title, description and probe. */
  regulator: string;
  regulatorDetail: string;
  regulatorProbe: string;
  /** Data an extortion would target. */
  hostageData: string;
  /** The revenue-shock item's title and probe. */
  revenueShock: string;
  revenueProbe: string;
}

export const INVENTORY_WORDS: Record<IndustryId, InventoryWords> = {
  dental: {
    system: "PMS",
    payer: "patient",
    pair: "front desk + OM",
    partners: "Lab / DSO / clearinghouse",
    partnerFraud: "inflated lab bills, claim re-routing",
    partnerCheck: "Reconcile lab invoices to cases completed for 30 days",
    regulator: "HIPAA / OCR enforcement trajectory",
    regulatorDetail:
      "Privacy breaches and OCR civil money penalties are not linked to control failures (e.g. snooping, misdirected claims).",
    regulatorProbe: "Add OCR/HIPAA breach butterfly scenario tied to access admin entitlements",
    hostageData: "Full PMS hostage, ePHI extortion",
    revenueShock: "Payer mix / Medicaid cliff / fee schedule shock",
    revenueProbe: "Add payer-mix % and largest payer concentration to the business profile",
  },
  retail: {
    system: "POS",
    payer: "customer",
    pair: "lead cashier + store manager",
    partners: "Supplier / marketplace / card processor",
    partnerFraud: "inflated supplier bills, re-routed marketplace payouts",
    partnerCheck: "Reconcile supplier invoices to goods received for 30 days",
    regulator: "Card-data and consumer-privacy enforcement",
    regulatorDetail:
      "Card-data breaches and privacy penalties are not linked to control failures (e.g. snooping, exported customer lists).",
    regulatorProbe: "Add a card-data breach scenario tied to access admin entitlements",
    hostageData: "Full POS hostage, customer-data extortion",
    revenueShock: "Sales mix / largest channel / pricing shock",
    revenueProbe: "Add sales mix and largest channel concentration to the business profile",
  },
  restaurant: {
    system: "POS",
    payer: "guest",
    pair: "head server + manager on duty",
    partners: "Food vendor / delivery platform / card processor",
    partnerFraud: "inflated produce bills, re-routed delivery payouts",
    partnerCheck: "Reconcile vendor invoices to deliveries received for 30 days",
    regulator: "Card-data and labor-law enforcement",
    regulatorDetail:
      "Card-data breaches and tip or wage claims are not linked to control failures (e.g. punch edits, exported guest lists).",
    regulatorProbe: "Add a card-data breach scenario tied to access admin entitlements",
    hostageData: "Full POS hostage, guest-data extortion",
    revenueShock: "Covers / delivery mix / food cost shock",
    revenueProbe: "Add sales mix and delivery-platform share to the business profile",
  },
  professional_services: {
    system: "billing system",
    payer: "client",
    pair: "billing coordinator + office manager",
    partners: "Subcontractor / payment processor / trust bank",
    partnerFraud: "inflated subcontractor bills, re-routed client payments",
    partnerCheck: "Reconcile subcontractor invoices to work delivered for 30 days",
    regulator: "Client-confidentiality and trust-account enforcement",
    regulatorDetail:
      "Confidentiality breaches and trust-account findings are not linked to control failures (e.g. snooping, misdirected client files).",
    regulatorProbe: "Add a client-data breach scenario tied to access admin entitlements",
    hostageData: "Full billing-system hostage, client-data extortion",
    revenueShock: "Client mix / largest client / rate shock",
    revenueProbe: "Add client mix and largest client concentration to the business profile",
  },
  construction: {
    system: "job-cost system",
    payer: "client",
    pair: "project manager + office manager",
    partners: "Subcontractor / supplier / equipment rental",
    partnerFraud: "inflated change orders, bills for work not in place",
    partnerCheck:
      "Compare subcontractor pay applications to work in place and lien waivers for 30 days",
    regulator: "Prevailing-wage and worker-classification enforcement",
    regulatorDetail:
      "Certified payroll findings and misclassification penalties are not linked to control failures (e.g. unapproved field-time edits, crews paid off the books).",
    regulatorProbe: "Add a certified-payroll finding scenario tied to payroll entitlements",
    hostageData: "Full job-cost system hostage, bid-data extortion",
    revenueShock: "Backlog / largest client / material price shock",
    revenueProbe: "Add backlog and largest client concentration to the business profile",
  },
  nonprofit: {
    system: "donor database",
    payer: "donor",
    pair: "finance manager + development director",
    partners: "Funder / fiscal sponsor / online giving platform",
    partnerFraud: "invented vendors, re-routed online gifts",
    partnerCheck: "Reconcile online-giving payouts to donor records for 30 days",
    regulator: "State charity regulator and IRS reporting",
    regulatorDetail:
      "Form 990 and state charity findings are not linked to control failures (e.g. restricted gifts spent on operations, unreviewed executive pay).",
    regulatorProbe: "Add a restricted-fund misuse scenario tied to grant entitlements",
    hostageData: "Full donor-database hostage, donor-data extortion",
    revenueShock: "Largest funder / grant cliff / event shortfall",
    revenueProbe: "Add funding mix and largest funder concentration to the business profile",
  },
  general: {
    system: "accounting system",
    payer: "customer",
    pair: "two staff who share a desk",
    partners: "Supplier / payment processor / bank",
    partnerFraud: "inflated supplier bills, re-routed customer payments",
    partnerCheck: "Reconcile supplier invoices to goods or work received for 30 days",
    regulator: "Privacy and data-protection enforcement",
    regulatorDetail:
      "Data breaches and privacy penalties are not linked to control failures (e.g. snooping, exported customer lists).",
    regulatorProbe: "Add a data breach scenario tied to access admin entitlements",
    hostageData: "Full accounting-system hostage, customer-data extortion",
    revenueShock: "Customer mix / largest customer / pricing shock",
    revenueProbe: "Add customer mix and largest customer concentration to the business profile",
  },
};
