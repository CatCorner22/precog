import type { StructuredBrief } from "./types";

/**
 * A complete, rules-authored statement. The model can select an id, never
 * rewrite its subject, amount, applicability, rationale or limitations.
 * This is a constrained rendering boundary, not semantic fact checking.
 */
export interface BriefClaim {
  id: string;
  text: string;
}

export function briefClaims(brief: StructuredBrief): BriefClaim[] {
  const claims = brief.decisions.slice(0, 6).map((move, index) => ({
    id: `move-${index}`,
    text: `${move.action}\n\n${move.rationale}`,
  }));
  if (claims.length === 0 && brief.situation.trim()) {
    claims.push({ id: "situation", text: brief.situation });
  }
  // Do not truncate away a condition or qualification to fit the model.
  return claims.filter((claim) => claim.text.length <= 6_000);
}

/** Strict protocol: unknown ids, duplicate ids, free prose and extra fields fail closed. */
export function parseBriefSelection(text: string, claims: readonly BriefClaim[]): string[] | null {
  if (text.length > 4_096) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "highlightIds,version") return null;
  if (record.version !== 1 || !Array.isArray(record.highlightIds)) return null;
  const ids: unknown[] = record.highlightIds;
  if (ids.length < 1 || ids.length > 3 || new Set(ids).size !== ids.length) return null;
  const known = new Set(claims.map((claim) => claim.id));
  if (!ids.every((id): id is string => typeof id === "string" && known.has(id))) return null;
  return ids;
}

export function renderBriefSelection(
  brief: StructuredBrief,
  claims: readonly BriefClaim[],
  selectedIds: readonly string[],
): string {
  const selected = new Set(selectedIds);
  // Keep the rules engine's priority order, even when the model selects out of order.
  const highlights = claims
    .filter((claim) => selected.has(claim.id))
    .map((claim) => claim.text.split("\n\n", 1)[0]);
  if (highlights.length === 0) return brief.markdown;
  const warningsAlreadyInBrief = brief.chickenLittleWarnings.every((warning) =>
    brief.markdown.includes(warning),
  );
  const limits =
    brief.chickenLittleWarnings.length && !warningsAlreadyInBrief
      ? `\n\n### Important limits\n${brief.chickenLittleWarnings.map((text) => `- ${text}`).join("\n")}`
      : "";
  return `## Most relevant to your question\n\n${highlights.map((text) => `- **${text}**`).join("\n")}\n\nGrok picked these from Precog's moves below without rewriting them. It did not rank the risks or check them.${limits}\n\n---\n\n${brief.markdown}`;
  const limits = brief.chickenLittleWarnings.length
    ? `\n\n### Important limits\n${brief.chickenLittleWarnings.map((text) => `- ${text}`).join("\n")}`
    : "";
  return `## Picked for your question\n\n${highlights.join("\n\n")}\n\n_Grok picked these from Precog's own statements without changing them. They are not a new ranking._${limits}\n\n---\n\n${brief.markdown}`;
}
