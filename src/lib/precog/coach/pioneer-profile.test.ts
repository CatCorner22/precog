import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import { executeTool, TOOL_CATALOG } from "../llm/tools";
import { KNOWLEDGE_CORPUS } from "../rag/corpus";
import { buildPioneerContextPack } from "./context-pack";
import { pioneerProfileFrom } from "./pioneer-profile";
import { mapAssessed } from "../builder/map-state";
import { buildOwnTeam, ownBusinessProfile } from "../onboarding/own-team";
import { defaultProfile } from "../practice-profile";

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

  it("keeps well-formed journal entries, caps them, and drops malformed ones", () => {
    const entry = {
      id: "d",
      createdAt: "2025-01-01T00:00:00.000Z",
      subject: "s",
      kind: "monitor" as const,
      note: "",
    };
    const many = Array.from({ length: 600 }, (_, i) => ({ ...entry, id: `d${i}` }));
    expect(pioneerProfileFrom({ industry: "retail", decisions: many }).decisions.length).toBe(500);
    expect(pioneerProfileFrom({ industry: "retail" }).decisions).toEqual([]);
    const cleaned = pioneerProfileFrom({
      industry: "retail",
      // @ts-expect-error deliberately malformed wire input
      decisions: [entry, null, { subject: "no id" }, { ...entry, id: 7 }],
    });
    expect(cleaned.decisions).toEqual([entry]);
  });

  it("rebuilds journal entries field by field, dropping unexpected shapes", () => {
    const wire = {
      id: "d",
      createdAt: "2025-01-01T00:00:00.000Z",
      subject: "x".repeat(400),
      kind: "remediate",
      note: 42,
      reviewBy: { not: "a date" },
      linkedTab: "knowledge",
      linkedId: "k-1",
      linkedIndustry: "not-an-industry",
      linkedStep: "teleport",
      linkedPersonId: ["p-1"],
      status: "maybe",
      snapshot: { huge: true },
      reviews: [{}],
    };
    const p = pioneerProfileFrom({
      industry: "retail",
      // @ts-expect-error deliberately malformed wire input
      decisions: [wire, { ...wire, kind: "delete_everything" }],
    });
    expect(p.decisions).toEqual([
      {
        id: "d",
        createdAt: "2025-01-01T00:00:00.000Z",
        subject: "x".repeat(300),
        kind: "remediate",
        note: "",
        linkedTab: "knowledge",
        linkedId: "k-1",
      },
    ]);
    expect("snapshot" in p.decisions[0]).toBe(false);
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

describe("context pack process map", () => {
  it("marks the sample business's map as assessed", () => {
    const pack = buildPioneerContextPack(dental);
    expect(pack.processMap.assessed).toBe(true);
    expect(pack.processMap.note).toMatch(/^Map health/);
  });

  it("carries assessed: false and a do-not-quote note for a starter map", () => {
    const profile = ownBusinessProfile(defaultProfile(), {
      practiceName: "Ruiz Dental",
      people: buildOwnTeam([
        { name: "Ana Ruiz", role: "Owner", duties: ["bank_reconcile"] },
        { name: "Ben Ochoa", role: "Office Manager", duties: ["post_payments"] },
      ]),
    });
    const tpl = resolveTemplate(profile);
    const pack = buildPioneerContextPack(tpl, profile.staff, { mapAssessed: mapAssessed(profile) });
    expect(pack.processMap.assessed).toBe(false);
    expect(pack.processMap.note).toBe(
      "Not assessed: the map holds 7 starter processes from the dental / medical office example with no owner assigned, so the figures above are not facts about the business. Do not quote them; advise the owner to assign an owner to each process on How work flows, or to build their own map.",
    );
    const empty = buildPioneerContextPack(
      resolveTemplate({ ...profile, customProcesses: [] }),
      profile.staff,
      { mapAssessed: false },
    );
    expect(empty.processMap.note).toMatch(/^Not assessed: the map is empty/);
  });
});
