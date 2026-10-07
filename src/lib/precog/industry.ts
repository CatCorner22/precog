/** Supported small-business verticals for demo templates and copy. */
export type IndustryId =
  | "dental"
  | "retail"
  | "professional_services"
  | "restaurant"
  | "construction"
  | "automotive"
  | "nonprofit"
  | "general";

interface IndustryMeta {
  id: IndustryId;
  label: string;
  tagline: string;
  /** What the sample is, and which of its checks do not apply to every business in the line. */
  sampleNote: string;
  demoName: string;
  teamLabel: string;
  /** The plural of teamLabel, written out: "practices", "companies", "businesses". */
  teamLabelPlural: string;
  /** Plural noun for the people the business serves ("patients", "guests"). */
  customerLabel: string;
}

export const INDUSTRIES: IndustryMeta[] = [
  {
    id: "dental",
    label: "Dental office",
    tagline: "Patient revenue, billing, cash, and controlled-drug controls",
    sampleNote:
      "The sample is a dental office. A medical or veterinary office uses the same front desk, billing, and payment duties. Count controlled drugs only where the office dispenses them.",
    demoName: "Ridgeview Family Dental",
    teamLabel: "practice",
    teamLabelPlural: "practices",
    customerLabel: "patients",
  },
  {
    id: "retail",
    label: "Retail / e-commerce",
    tagline: "Inventory, POS, and vendor payment controls",
    sampleNote:
      "The sample is a boutique with a stockroom and a web store. Returns, inventory counts, and vendor payments are the same for a shop that sells only online.",
    demoName: "Harbor Lane Boutique",
    teamLabel: "store",
    teamLabelPlural: "stores",
    customerLabel: "customers",
  },
  {
    id: "professional_services",
    label: "Professional services",
    tagline: "Client billing, trust accounts, and project delivery",
    sampleNote:
      "The sample holds client money in a trust account. A firm that does not hold client money skips the trust reconciliation.",
    demoName: "Northgate Advisory Group",
    teamLabel: "firm",
    teamLabelPlural: "firms",
    customerLabel: "clients",
  },
  {
    id: "restaurant",
    label: "Restaurant / hospitality",
    tagline: "Cash tips, vendor AP, and shift reconciliation",
    sampleNote:
      "The sample is a dining room and a bar, not a hotel. A hotel uses this line for food and beverage only.",
    demoName: "Ember & Oak Kitchen",
    teamLabel: "restaurant",
    teamLabelPlural: "restaurants",
    customerLabel: "guests",
  },
  {
    id: "construction",
    label: "Construction / trades",
    tagline: "Job costing, progress billing, and subcontractor payments",
    sampleNote:
      "The sample is a general contractor. A specialty trade uses the materials, payroll, and payment duties. Lien waivers apply when the business pays subcontractors.",
    demoName: "Summit Ridge Builders",
    teamLabel: "company",
    teamLabelPlural: "companies",
    customerLabel: "clients",
  },
  {
    id: "automotive",
    label: "Auto dealership / repair shop",
    tagline: "Repair-order cash, parts inventory, deal and title fees",
    sampleNote:
      "The sample is a small dealership. A repair shop uses the repair-order, parts, and cash duties. Deal jackets apply when the business sells vehicles.",
    demoName: "Millbrook Auto & Service",
    teamLabel: "shop",
    teamLabelPlural: "shops",
    customerLabel: "customers",
  },
  {
    id: "nonprofit",
    label: "Nonprofit organization",
    tagline: "Donations, restricted grants, and board oversight",
    sampleNote:
      "The sample has no owner. A board treasurer oversees the books and is not paid staff.",
    demoName: "Riverbend Community Alliance",
    teamLabel: "organization",
    teamLabelPlural: "organizations",
    customerLabel: "donors and clients",
  },
  {
    id: "general",
    label: "General small business",
    tagline: "Core financial and operational controls",
    sampleNote: "The shared money map, for a business that does not fit the other lines.",
    demoName: "Main Street Business Co.",
    teamLabel: "business",
    teamLabelPlural: "businesses",
    customerLabel: "customers",
  },
];

/**
 * Whether the line of business has an owner. A nonprofit belongs to no one:
 * its executive director is an employee the board oversees, so nobody in it
 * is treated as the owner who cannot take from themselves.
 */
export function industryHasOwner(id: string | undefined): boolean {
  return id !== "nonprofit";
}

/**
 * Who checks a procedure when nobody is named: "the owner", or for a line of
 * business with no owner, "the executive director"; capitalized when it
 * starts a sentence.
 */
export function defaultReviewer(id: string | undefined, startsSentence = false): string {
  const who = industryHasOwner(id) ? "the owner" : "the executive director";
  return startsSentence ? `T${who.slice(1)}` : who;
}

/**
 * The industry whose sample stands in when a stored industry is not one the
 * app knows. Every lookup by industry (metadata, sample, copy) falls back to
 * it, so an unknown value never mixes one industry's team with another's words.
 */
export const DEFAULT_INDUSTRY: IndustryId = "dental";

export function industryMeta(id: IndustryId): IndustryMeta {
  return INDUSTRIES.find((i) => i.id === id) ?? INDUSTRIES.find((i) => i.id === DEFAULT_INDUSTRY)!;
}

/**
 * The industry's word for a business ("practice", "store", "company"). Generic
 * copy says "business"; only a sentence about one industry's business uses
 * this noun, and only through this helper.
 */
export function industryNoun(id: IndustryId): string {
  return industryMeta(id).teamLabel;
}

/** The plural of the industry's word for a business: "practices", "companies", "businesses". */
export function pluralTeamLabel(id: IndustryId): string {
  return industryMeta(id).teamLabelPlural;
}

const INDUSTRY_IDS = new Set<string>(INDUSTRIES.map((i) => i.id));
const DEMO_NAMES = new Set(INDUSTRIES.map((i) => i.demoName));

export function isIndustryId(value: unknown): value is IndustryId {
  return typeof value === "string" && INDUSTRY_IDS.has(value);
}

/** True for the name of one of the industry samples, i.e. not a name the owner typed. */
export function isDemoName(practiceName: string): boolean {
  return DEMO_NAMES.has(practiceName);
}
