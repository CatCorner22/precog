/**
 * Builders the unit tests share, so a new required field on a domain type is
 * added in one place.
 */
import { getIndustryTemplate } from "@/lib/precog/templates";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import type { KnowledgeItem, KnowledgeRelation, Person, ProcessNode } from "@/lib/precog/types";

/** A critical, undocumented register entry named after its id. */
export function knowledgeItem(id: string, extra: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    id,
    name: id,
    criticality: "critical",
    category: "process",
    description: "",
    linkedProcessIds: [],
    ...extra,
  };
}

/** The general template with this team, register and process map (none by default). */
export function continuityTemplate(parts: {
  people: Person[];
  knowledge?: KnowledgeItem[];
  relations?: KnowledgeRelation[];
  processes?: ProcessNode[];
}): IndustryTemplate {
  return {
    ...getIndustryTemplate("general"),
    knowledge: [],
    relations: [],
    processes: [],
    ...parts,
  };
}

/** A process-layer node with no owners, controls or dependencies unless `extra` sets them. */
export function processNode(id: string, extra: Partial<ProcessNode> = {}): ProcessNode {
  return {
    id,
    name: id,
    layer: "process",
    description: "",
    dependencies: [],
    controlIds: [],
    ...extra,
  };
}

/**
 * `base` with its team replaced by these people (ids t1, t2, …, named
 * "Person 1", … unless a name is given), each holding the listed duties, and
 * no register marks or role templates.
 */
export function teamTemplate(
  base: IndustryTemplate,
  people: { name?: string; role: string; duties: string[] }[],
): IndustryTemplate {
  return {
    ...base,
    people: people.map((p, i) => ({
      id: `t${i + 1}`,
      name: p.name ?? `Person ${i + 1}`,
      role: p.role,
      active: true,
      entitlements: p.duties,
    })),
    relations: [],
    roleTemplates: {},
  };
}
