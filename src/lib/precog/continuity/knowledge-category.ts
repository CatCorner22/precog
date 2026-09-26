import type { KnowledgeItem, KnowledgeKind } from "../types";

/**
 * The category an owner-written register item gets: know-how is "tribal",
 * duties and tasks are "process". The owner never chooses one; only the
 * starter-list comparison in register-state reads it.
 */
export function defaultCategory(kind: KnowledgeKind): KnowledgeItem["category"] {
  return kind === "knowledge" ? "tribal" : "process";
}
