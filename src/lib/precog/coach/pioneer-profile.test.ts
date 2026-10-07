import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { getIndustryTemplate } from "../templates";
import { executeTool, TOOL_CATALOG } from "../llm/tools";
import { KNOWLEDGE_CORPUS } from "../rag/corpus";
import { pioneerProfileFrom } from "./pioneer-profile";
import { isWritten, procedureWhere } from "../continuity/documentation";
import { LINK_ONLY_STEP, writtenProcedureLinks } from "../procedures/coverage-link";
import { newProcedure, newStep } from "../procedures/lifecycle";
import { parsePioneerInput } from "../public-inputs";
import { UNANSWERED } from "../onboarding/setup-answers";

const dental = getIndustryTemplate("dental");
const retail = getIndustryTemplate("retail");

describe("pioneerProfileFrom", () => {
  it("keeps the industry it is given", () => {
    const p = pioneerProfileFrom({ industry: "retail", practiceName: "Harbor Lane Boutique" });
    expect(p.industry).toBe("retail");
    expect(p.practiceName).toBe("Harbor Lane Boutique");
  });

  it("preserves normalized setup answers and drops malformed values", () => {
    const setupAnswers = {
      payroll: "none",
      bankRec: "outside",
      cashOrChecks: "not-an-answer",
      extra: "discard me",
    };
    const request = parsePioneerInput({ profile: { industry: "retail", setupAnswers } });
    expect(request.profile.setupAnswers).toEqual(setupAnswers);
    expect(pioneerProfileFrom(request.profile).setupAnswers).toEqual({
      ...UNANSWERED,
      payroll: "none",
      bankRec: "outside",
    });
    expect(
      pioneerProfileFrom({ industry: "retail", setupAnswers: "not-an-object" }).setupAnswers,
    ).toBeUndefined();
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
    expect(p.staff.teamSize).toBe(getIndustryTemplate("restaurant").staffComposition.teamSize);
  });

  it("keeps the journal links that confirm a sample control and a scenario", () => {
    const people = retail.people.slice(0, 2);
    const entry = (id: string, linkedTab: string, linkedId: string) => ({
      id,
      createdAt: "2026-09-01T00:00:00.000Z",
      subject: "Runs here",
      kind: "monitor" as const,
      note: "",
      linkedTab,
      linkedId,
      linkedIndustry: "retail" as const,
    });
    const p = pioneerProfileFrom({
      industry: "retail",
      customPeople: people,
      decisions: [entry("d1", "control", "c-ap"), entry("d2", "precog", "t-skim")],
    });
    const tpl = resolveTemplate(p);
    expect(tpl.controls.find((c) => c.id === "c-ap")?.starter).toBeUndefined();
    expect(tpl.controls.find((c) => c.id === "c-inventory")?.starter).toBe(true);
    expect(p.decisions.map((d) => d.linkedTab)).toEqual(["control", "precog"]);
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
      const r = executeTool(name, ctx);
      expect(r.ok, `${name}: ${r.summary}`).toBe(true);
    }
  });

  it("reports the retail industry and retail staff", () => {
    const snap = executeTool("get_practice_snapshot", ctx);
    expect((snap.data as { industry: string }).industry).toBe("retail");

    const spofs = executeTool("get_knowledge_spofs", ctx).data as {
      name: string;
      owners: { id: string; name: string }[];
    }[];
    for (const s of spofs) {
      expect(dentalOnlyKnowledge.has(s.name), s.name).toBe(false);
      for (const o of s.owners) expect(retailPeople.has(o.id + o.name), o.name).toBe(true);
    }
  });

  it("only retrieves retail or general guidance", () => {
    const r = executeTool("retrieve_guidance", {
      ...ctx,
      question: "cash deposit front desk payments",
    });
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
    const graph = executeTool("get_knowledge_graph", { profile: p });
    expect(graph.ok).toBe(true);
    expect(JSON.stringify(graph.data)).not.toContain(retail.people[5].name);
  });
});

describe("procedure links sent to Pioneer", () => {
  const item = dental.knowledge.find((k) => !k.documented)!;

  it("count a register item as written, as every other screen does", () => {
    const without = resolveTemplate(pioneerProfileFrom({ industry: "dental" }));
    expect(isWritten(without.knowledge.find((k) => k.id === item.id)!)).toBe(false);
    const p = pioneerProfileFrom(
      {
        industry: "dental",
        procedureLinks: [{ id: "proc-1", title: "Close the day", knowledgeIds: [item.id] }],
      },
      "2026-09-28",
    );
    const linked = resolveTemplate(p).knowledge.find((k) => k.id === item.id)!;
    expect(linked.linkedProcedures).toEqual([{ id: "proc-1", title: "Close the day" }]);
    expect(isWritten(linked)).toBe(true);
    expect(procedureWhere(linked)).toBe('Procedures tab: "Close the day"');
  });

  it("reach the coach's tools, which stop calling the item unwritten", () => {
    type Spof = { knowledgeId: string; documented: boolean; procedureLocation: string | null };
    const spofs = (profile: ReturnType<typeof pioneerProfileFrom>) =>
      executeTool("get_knowledge_spofs", { profile }).data as Spof[];
    const target = spofs(pioneerProfileFrom({ industry: "dental" })).find((s) => !s.documented)!;
    expect(target).toBeDefined();
    const after = spofs(
      pioneerProfileFrom({
        industry: "dental",
        procedureLinks: [
          { id: "proc-1", title: "Close the day", knowledgeIds: [target.knowledgeId] },
        ],
      }),
    ).find((s) => s.knowledgeId === target.knowledgeId)!;
    expect(after.documented).toBe(true);
    expect(after.procedureLocation).toBe('Procedures tab: "Close the day"');
  });

  it("carry no steps, people or verification into the rebuilt profile", () => {
    const [proc] = pioneerProfileFrom(
      {
        industry: "dental",
        procedureLinks: [{ id: "proc-1", title: "Close the day", knowledgeIds: [item.id] }],
      },
      "2026-09-28",
    ).procedures!;
    expect(proc.steps.map((s) => s.text)).toEqual([LINK_ONLY_STEP]);
    expect(proc.backupPersonIds).toEqual([]);
    expect(proc.ownerPersonId).toBeUndefined();
    expect(proc.verifiedAt).toBeUndefined();
    expect(proc.industry).toBe("dental");
  });

  it("drop links without an id, a title or an item, and repeated ids", () => {
    const p = pioneerProfileFrom({
      industry: "dental",
      procedureLinks: [
        { id: "a", title: "One", knowledgeIds: [item.id, item.id, 7, "x".repeat(200)] },
        { id: "a", title: "Again", knowledgeIds: [item.id] },
        { id: "b", title: "", knowledgeIds: [item.id] },
        { id: "c", title: "No items", knowledgeIds: [] },
        null,
        "text",
      ] as never,
    });
    expect(p.procedures?.map((x) => [x.id, x.knowledgeIds])).toEqual([["a", [item.id]]]);
    expect(pioneerProfileFrom({ industry: "dental" }).procedures).toBeUndefined();
  });

  it("are read by the request check, which refuses a list of the wrong kind", () => {
    const links = [{ id: "a", title: "One", knowledgeIds: [item.id] }];
    expect(
      parsePioneerInput({ profile: { procedureLinks: links } }).profile.procedureLinks,
    ).toEqual(links);
    expect(() => parsePioneerInput({ profile: { procedureLinks: "a" } })).toThrow();
  });

  it("are built in the browser from this industry's written procedures only", () => {
    const written = newProcedure(
      {
        industry: "dental",
        title: "Close the day",
        steps: [newStep("Print the day sheet.")],
        knowledgeIds: [item.id],
        backupPersonIds: ["p2"],
      },
      "2026-09-28",
    );
    const links = writtenProcedureLinks(
      [
        written,
        { ...written, id: "empty", steps: [] },
        { ...written, id: "retail", industry: "retail" },
        { ...written, id: "unlinked", knowledgeIds: [] },
      ],
      "dental",
    );
    expect(links).toEqual([{ id: written.id, title: "Close the day", knowledgeIds: [item.id] }]);
  });
});
