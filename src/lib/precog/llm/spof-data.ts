/**
 * The two shapes `get_knowledge_spofs` returns. Once someone is marked on the
 * register the tool returns one row per item only one person (or nobody) can
 * run. Before that it returns `{ assessed: false, items }`: the starter items
 * with nobody marked, which say nothing yet about who can run what.
 */
interface SpofRow {
  knowledgeId?: string;
  name: string;
  riskScore?: number;
  owners: { name: string }[];
  suggestedTrainee?: { name: string } | null;
  documented?: boolean;
  stale?: boolean;
  nextStep?: string | null;
  committed?: {
    subject: string;
    trainee: { name: string } | null;
    reviewBy: string | null;
    overdue: boolean;
  } | null;
}

export type SpofData = { assessed: true; rows: SpofRow[] } | { assessed: false; itemCount: number };

/** Reads the tool's data in either shape; null when the tool did not run or returned nothing usable. */
export function readSpofData(data: unknown): SpofData | null {
  if (Array.isArray(data)) return { assessed: true, rows: data as SpofRow[] };
  if (data && typeof data === "object" && (data as { assessed?: unknown }).assessed === false) {
    const items = (data as { items?: unknown }).items;
    return { assessed: false, itemCount: Array.isArray(items) ? items.length : 0 };
  }
  return null;
}
