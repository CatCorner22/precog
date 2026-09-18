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

export interface IndustryTemplate {
  id: IndustryId;
  businessName: string;
  people: Person[];
  knowledge: KnowledgeItem[];
  relations: KnowledgeRelation[];
  processes: ProcessNode[];
  controls: ControlItem[];
  staffComposition: StaffComposition;
  crimeFraudStats: CrimeFraudStats;
  scenarios: ScenarioTemplate[];
  /** Maps `Person.role` strings to SoD entitlements for conflict detection. */
  roleTemplates: Record<string, EntitlementId[]>;
}
