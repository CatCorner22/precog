import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import { executeTool, TOOL_CATALOG } from "../llm/tools";
import { KNOWLEDGE_CORPUS } from "../rag/corpus";
import { buildPioneerContextPack } from "./context-pack";
import { pioneerProfileFrom } from "./pioneer-profile";

const dental = getBaseTemplate("dental");
const retail = getBaseTemplate("retail");

describe("pioneerProfileFrom", () => {
  it("keeps the industry it is given", () => {
    const p = pioneerProfileFrom({ industry: "retail", practiceName: "Harbor Lane Boutique" });
    expect(p.industry).toBe("retail");
    expect(p.practiceName).toBe("Harbor Lane Boutique");
  });

  it("falls back to general, never dental, when the industry is missing or unknown", () => {
    expect(pioneerProfileFrom({}).industry).toBe("general");
    // @ts-expect-error deliberately invalid wire input
    expect(pioneerProfileFrom({ industry: "hospital" }).industry).toBe("general");
  });

  it("merges partial staff over the industry default and keeps risk flags aligned", () => {
    const p = pioneerProfileFrom({
      industry: "restaurant",
      staff: { dualControlPayments: true, independentBankRec: false },
    });
    expect(p.staff.dualControlPayments).toBe(true);
    expect(p.riskVariables.hasDualControl).toBe(true);
    expect(p.riskVariables.hasIndependentBankRec).toBe(false);
    expect(p.staff.teamSize).toBe(getBaseTemplate("restaurant").staffComposition.teamSize);
  });

  it("caps custom lists and trims the practice name", () => {
    const people = Array.from({ length: 300 }, (_, i) => ({
      id: `p${i}`,
      name: `Person ${i}`,
      role: "Clerk",
      active: true,
    }));
    const p = pioneerProfileFrom({
      industry: "general",
      customPeople: people,
      practiceName: "  x".repeat(60),
    });
    expect(p.customPeople!.length).toBe(250);
    expect(p.practiceName.length).toBeLessThanOrEqual(80);
  });

  it("localizes the dual-release policy to the industry's roles", () => {
    const p = pioneerProfileFrom({ industry: "retail" });
    const roles = new Set(retail.people.map((x) => x.role));
    for (const rule of p.dualRelease.rules) {
      for (const role of [...rule.firstApproverRoles, ...rule.secondApproverRoles]) {
        expect(roles.has(role), `${rule.channel}: ${role}`).toBe(true);
      }
    }
  });
});

describe("Pioneer tools on a Retail profile", () => {
  const ctx = { profile: pioneerProfileFrom({ industry: "retail", practiceName: "Harbor Lane" }) };
  const retailPeople = new Set(retail.people.map((p) => p.id + p.name));
  const dentalOnlyKnowledge = new Set(
    dental.knowledge.map((k) => k.name).filter((n) => !retail.knowledge.some((k) => k.name === n)),
  );

  it("every tool runs without error", () => {
    for (const { name } of TOOL_CATALOG) {
      const r = executeTool(name, {}, ctx);
      expect(r.ok, `${name}: ${r.summary}`).toBe(true);
    }
  });

  it("reports the retail industry and retail staff", () => {
    const snap = executeTool("get_practice_snapshot", {}, ctx);
    expect((snap.data as { industry: string }).industry).toBe("retail");

    const spofs = executeTool("get_knowledge_spofs", {}, ctx).data as {
      name: string;
      owners: { id: string; name: string }[];
    }[];
    for (const s of spofs) {
      expect(dentalOnlyKnowledge.has(s.name), s.name).toBe(false);
      for (const o of s.owners) expect(retailPeople.has(o.id + o.name), o.name).toBe(true);
    }
  });

  it("only retrieves retail or general guidance", () => {
    const r = executeTool("retrieve_guidance", { query: "cash deposit front desk payments" }, ctx);
    const hits = (r.data as { hits: { id: string }[] }).hits;
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      const chunk = KNOWLEDGE_CORPUS.find((c) => c.id === h.id)!;
      expect(["retail", "general", undefined], h.id).toContain(chunk.industry);
    }
  });

  it("resolves custom people from the profile rather than the template", () => {
    const custom = retail.people.slice(0, 2);
    const p = pioneerProfileFrom({ industry: "retail", customPeople: custom });
    expect(resolveTemplate(p).people).toEqual(custom);
    const graph = executeTool("get_knowledge_graph", {}, { profile: p });
    expect(graph.ok).toBe(true);
    expect(JSON.stringify(graph.data)).not.toContain(retail.people[5].name);
  });

  it("includes documentation debt in the dental context pack", () => {
    const pack = buildPioneerContextPack(dental);
    expect(pack.continuity.documentation.gaps.length).toBeGreaterThan(0);
    for (const gap of pack.continuity.documentation.gaps) {
      expect(["none", "unlocated"]).toContain(gap.state);
    }
    expect(pack.continuity.documentation.writtenAndFindablePct).toBeGreaterThanOrEqual(0);
    expect(pack.continuity.documentation.writtenAndFindablePct).toBeLessThanOrEqual(100);
  });
});
