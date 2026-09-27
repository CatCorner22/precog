/**
 * Where the knowledge map draws each person and register item. The canvas
 * grows with the longer column, so no row falls below the drawing.
 */
import type { KnowledgeItem, KnowledgeRelation, Person } from "@/lib/precog/types";

export const MAP_WIDTH = 640;
export const PERSON_NODE = { x: 80, width: 100, height: 44, top: 48, pitch: 72 } as const;
export const ITEM_NODE = { x: 420, width: 190, height: 48, top: 40, pitch: 68 } as const;

export interface MapLayout<P extends Person, K extends KnowledgeItem> {
  people: Array<P & { x: number; y: number }>;
  items: Array<K & { x: number; y: number }>;
  edges: Array<
    KnowledgeRelation & { from: P & { x: number; y: number }; to: K & { x: number; y: number } }
  >;
  height: number;
}

/** Node positions, the edges between drawn nodes, and a canvas height that fits every row. */
export function knowledgeMapLayout<P extends Person, K extends KnowledgeItem>(
  people: readonly P[],
  items: readonly K[],
  relations: readonly KnowledgeRelation[],
): MapLayout<P, K> {
  const personNodes = people.map((p, i) => ({
    ...p,
    x: PERSON_NODE.x,
    y: PERSON_NODE.top + i * PERSON_NODE.pitch,
  }));
  const itemNodes = items.map((k, i) => ({
    ...k,
    x: ITEM_NODE.x,
    y: ITEM_NODE.top + i * ITEM_NODE.pitch,
  }));
  const personById = new Map(personNodes.map((p) => [p.id, p]));
  const itemById = new Map(itemNodes.map((k) => [k.id, k]));
  const edges = relations.flatMap((r) => {
    const from = personById.get(r.personId);
    const to = itemById.get(r.knowledgeId);
    return from && to ? [{ ...r, from, to }] : [];
  });
  const bottom = Math.max(
    PERSON_NODE.top,
    ...personNodes.map((p) => p.y + PERSON_NODE.height),
    ...itemNodes.map((k) => k.y + ITEM_NODE.height),
  );
  return { people: personNodes, items: itemNodes, edges, height: bottom + 24 };
}
