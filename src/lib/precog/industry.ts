/** Supported small-business verticals for demo templates and copy. */
export type IndustryId = "dental" | "retail" | "professional_services" | "restaurant" | "general";

export interface IndustryMeta {
  id: IndustryId;
  label: string;
  tagline: string;
  demoName: string;
  teamLabel: string;
  /** Plural noun for the people the business serves ("patients", "guests"). */
  customerLabel: string;
}

export const INDUSTRIES: IndustryMeta[] = [
  {
    id: "dental",
    label: "Dental / medical office",
    tagline: "Patient revenue, billing, and cash controls",
    demoName: "Ridgeview Family Dental",
    teamLabel: "practice",
    customerLabel: "patients",
  },
  {
    id: "retail",
    label: "Retail / e-commerce",
    tagline: "Inventory, POS, and vendor payment controls",
    demoName: "Harbor Lane Boutique",
    teamLabel: "store",
    customerLabel: "customers",
  },
  {
    id: "professional_services",
    label: "Professional services",
    tagline: "Client billing, trust accounts, and project delivery",
    demoName: "Northgate Advisory Group",
    teamLabel: "firm",
    customerLabel: "clients",
  },
  {
    id: "restaurant",
    label: "Restaurant / hospitality",
    tagline: "Cash tips, vendor AP, and shift reconciliation",
    demoName: "Ember & Oak Kitchen",
    teamLabel: "restaurant",
    customerLabel: "guests",
  },
  {
    id: "general",
    label: "General small business",
    tagline: "Core financial and operational controls",
    demoName: "Main Street Business Co.",
    teamLabel: "business",
    customerLabel: "customers",
  },
];

export function industryMeta(id: IndustryId): IndustryMeta {
  return INDUSTRIES.find((i) => i.id === id) ?? INDUSTRIES[0];
}
