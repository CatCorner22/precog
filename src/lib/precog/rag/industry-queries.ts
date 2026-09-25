import type { IndustryId } from "../industry";

/** Default Intel/RAG seed queries per vertical. */
const INDUSTRY_RAG_QUERIES: Record<IndustryId, string> = {
  dental: "dental practice write-offs bank reconciliation segregation of duties PMS",
  retail: "retail shrink POS returns fraud cash skimming inventory reconciliation",
  restaurant: "restaurant tip pooling cash deposits void comps liquor variance fraud",
  professional_services: "professional services trust account billing write-offs segregation AP",
  construction:
    "construction subcontractor lien waiver change order job cost field payroll materials fraud",
  nonprofit: "nonprofit donations restricted funds grants board treasurer credit card vendor fraud",
  general: "small business embezzlement bank reconciliation vendor fraud AP controls",
};

export function defaultRagQuery(industry: IndustryId): string {
  return INDUSTRY_RAG_QUERIES[industry] ?? INDUSTRY_RAG_QUERIES.general;
}
