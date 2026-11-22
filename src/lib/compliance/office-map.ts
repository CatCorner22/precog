import { cardsForSynonymGroup, type ComplianceCard } from "./cards";
import { synonymLabels } from "./synonyms";

/**
 * Office map: which rule topics (synonym-group heads in synonyms.ts) touch each
 * Tennessee dental license and each area of the office. Cards are resolved from
 * the topic terms at runtime, so the map never names a card that does not exist.
 */
export interface MapNode {
  id: string;
  label: string;
  topics: readonly string[];
  /** Tab id on the Each license page, for license nodes. */
  licenseTab?: string;
}

export const mapLicenses: readonly MapNode[] = [
  {
    id: "dentist",
    label: "Dentist",
    licenseTab: "dentist",
    topics: [
      "license",
      "supervision",
      "consent",
      "records",
      "drug",
      "controlled",
      "naloxone",
      "anesthesia",
      "radiation",
      "infection",
      "bloodborne",
      "abuse",
      "child",
      "malpractice",
      "hipaa",
      "emergency",
      "waste",
      "training",
    ],
  },
  {
    id: "sedation",
    label: "Sedation permit holder",
    licenseTab: "dentist-sedation-permits",
    topics: [
      "anesthesia",
      "drug",
      "controlled",
      "naloxone",
      "emergency",
      "records",
      "training",
      "air",
    ],
  },
  {
    id: "hygienist",
    label: "Dental hygienist",
    licenseTab: "dental-hygienist",
    topics: [
      "license",
      "supervision",
      "anesthesia",
      "drug",
      "radiation",
      "infection",
      "bloodborne",
      "exposure",
      "ppe",
      "abuse",
      "child",
      "hipaa",
      "records",
      "training",
      "air",
    ],
  },
  {
    id: "rda",
    label: "Registered dental assistant",
    licenseTab: "dental-assistant-registered",
    topics: [
      "license",
      "supervision",
      "radiation",
      "anesthesia",
      "infection",
      "bloodborne",
      "exposure",
      "ppe",
      "abuse",
      "hipaa",
      "records",
      "training",
      "air",
    ],
  },
  {
    id: "pda",
    label: "Practical dental assistant",
    licenseTab: "dental-assistant-practical",
    topics: [
      "supervision",
      "infection",
      "bloodborne",
      "exposure",
      "ppe",
      "abuse",
      "hipaa",
      "training",
    ],
  },
];

export const mapAreas: readonly MapNode[] = [
  {
    id: "patient-care",
    label: "Patient care",
    topics: [
      "consent",
      "child",
      "abuse",
      "anesthesia",
      "drug",
      "naloxone",
      "radiation",
      "records",
      "supervision",
      "malpractice",
    ],
  },
  {
    id: "sterilization",
    label: "Sterilization and infection control",
    topics: ["infection", "bloodborne", "exposure", "ppe", "waste", "vaccine", "hazard"],
  },
  {
    id: "radiography",
    label: "Radiography",
    topics: ["radiation", "license", "training", "records"],
  },
  {
    id: "front-office",
    label: "Front office and records",
    topics: ["hipaa", "breach", "records", "consent", "notice", "complaint"],
  },
  { id: "billing", label: "Billing and insurance", topics: ["insurance", "contract", "records"] },
  {
    id: "hr",
    label: "HR and payroll",
    topics: [
      "employee",
      "pay",
      "overtime",
      "leave",
      "discharge",
      "discrimination",
      "disability",
      "pregnancy",
      "background",
      "notice",
    ],
  },
  {
    id: "maintenance",
    label: "Maintenance and repair",
    topics: ["fire", "emergency", "hazard", "waste", "air", "ppm", "radiation"],
  },
  {
    id: "pharmacy",
    label: "Drug storage and prescribing",
    topics: ["drug", "controlled", "naloxone", "records", "waste"],
  },
  {
    id: "safety",
    label: "Workplace safety and emergencies",
    topics: ["osha", "emergency", "fire", "exposure", "report"],
  },
];

export interface OfficeMapCard {
  id: string;
  title: string;
  section: string;
}

export interface OfficeMapTopic {
  term: string;
  label: string;
  count: number;
  cards: OfficeMapCard[];
}

export interface ResolvedMapNode extends Omit<MapNode, "topics"> {
  topics: string[];
}

export interface OfficeMap {
  licenses: ResolvedMapNode[];
  topics: OfficeMapTopic[];
  areas: ResolvedMapNode[];
}

export function officeMap(cards: ComplianceCard[]): OfficeMap {
  const terms = [...new Set([...mapLicenses, ...mapAreas].flatMap((node) => node.topics))];
  const topics = terms
    .map((term) => {
      const matches = cardsForSynonymGroup(cards, term);
      return {
        term,
        label: synonymLabels[term] ?? term,
        count: matches.length,
        cards: matches
          .map(({ id, title, section }) => ({ id, title, section }))
          .sort((a, b) => a.title.localeCompare(b.title)),
      };
    })
    .filter(({ count }) => count > 0);
  const topicTerms = new Set(topics.map(({ term }) => term));
  const resolveNode = ({ topics: nodeTopics, ...node }: MapNode): ResolvedMapNode => ({
    ...node,
    topics: nodeTopics.filter((term) => topicTerms.has(term)),
  });

  return {
    licenses: mapLicenses.map(resolveNode),
    topics,
    areas: mapAreas.map(resolveNode),
  };
}
