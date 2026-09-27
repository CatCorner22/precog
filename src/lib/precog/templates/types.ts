import type { EntitlementId } from "../sod/conflict-rules";
import type { IndustryId } from "../industry";
import type {
  ControlItem,
  CrimeFraudStats,
  KnowledgeItem,
  KnowledgeRelation,
  Person,
  ProcessNode,
  ScenarioTemplate,
  StaffComposition,
} from "../types";

/** A sample business as the app reads it (see getIndustryTemplate). */
export interface IndustryTemplate {
  id: IndustryId;
  businessName: string;
  people: Person[];
  /** Maps `Person.role` strings to SoD entitlements for conflict detection. */
  roleTemplates: Record<string, EntitlementId[]>;
  knowledge: KnowledgeItem[];
  relations: KnowledgeRelation[];
  processes: ProcessNode[];
  controls: ControlItem[];
  staffComposition: StaffComposition;
  crimeFraudStats: CrimeFraudStats;
  scenarios: ScenarioTemplate[];
}

/** The two payment safeguards a sample says it has; every other team figure is derived. */
export type SamplePaymentSafeguards = Pick<
  StaffComposition,
  "dualControlPayments" | "independentBankRec"
>;

/**
 * A sample business as its file writes it: the people, their duties, the map
 * and the scenarios. getIndustryTemplate derives the rest the way it does for
 * an owner's own team: the team size, average tenure, sole-holder count and
 * segregation score come from the people and their duties, and a control a
 * conflict rule covers is segregated exactly when nobody holds its pair.
 */
export interface IndustrySample extends Omit<
  IndustryTemplate,
  "businessName" | "staffComposition" | "crimeFraudStats"
> {
  staffComposition: SamplePaymentSafeguards;
}
