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
  owners: { id?: string; name: string; role?: string }[];
  suggestedTrainee?: { id?: string; name: string } | null;
  documented?: boolean;
  nextStep?: string | null;
  committed?: {
    subject: string;
    trainee: { name: string } | null;
    reviewBy: string | null;
    overdue: boolean;
  } | null;
}

type SpofData =
  | { assessed: true; rows: SpofRow[]; notMarked: number }
  | { assessed: false; itemCount: number; notMarked: number };

/** Reads the tool's data in either shape; null when the tool did not run or returned nothing usable. */
export function readSpofData(data: unknown): SpofData | null {
  if (Array.isArray(data)) return { assessed: true, rows: data as SpofRow[], notMarked: 0 };
  if (data && typeof data === "object") {
    const object = data as { assessed?: unknown; items?: unknown; notMarked?: unknown };
    const items = Array.isArray(object.items) ? (object.items as SpofRow[]) : [];
    const notMarked = typeof object.notMarked === "number" ? object.notMarked : 0;
    if (object.assessed === false) return { assessed: false, itemCount: items.length, notMarked };
    if (object.assessed === true) return { assessed: true, rows: items, notMarked };
  }
  return null;
}
