#!/usr/bin/env node
/**
 * Regression check for explicit template resolution.
 *
 * Every engine is a pure function of the template it is handed, and the
 * Pioneer server builds that template from the profile the client sends.
 * Nothing may fall back to a module-level default, because that default was
 * Dental and it once leaked into a Retail advisor session: the owner of a
 * boutique was told about insurance denial appeals and a hygienist named
 * Maya. These invariants keep that from coming back:
 *
 *   1. resolveTemplate(industry) returns that industry's own people,
 *      knowledge, processes, controls, and scenarios, unchanged.
 *   2. Custom people replace the template's people and every knowledge
 *      relation or process owner that pointed at a removed person is dropped.
 *   3. The Pioneer profile canonicaliser preserves the industry it is given
 *      and falls back to "general", never Dental, when none is given.
 *   4. The Pioneer tools, run against a Retail profile, name Retail staff and
 *      Retail risks and return Retail (or general) retrieval hits — never
 *      Dental ones.
 *
 * Loads the TypeScript through Vite's SSR loader so the repo's path aliases
 * work without a separate test runner.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const fail = (msg) => failures.push(msg);
const assert = (cond, msg) => {
  if (!cond) fail(msg);
};

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  resolve: { tsconfigPaths: true },
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const load = (p) => server.ssrLoadModule(`/src/lib/precog/${p}`);
  const { resolveTemplate, getBaseTemplate } = await load("active-template.ts");
  const { INDUSTRIES } = await load("industry.ts");
  const { pioneerProfileFrom } = await load("coach/pioneer-profile.ts");
  const { executeTool } = await load("llm/tools.ts");
  const { KNOWLEDGE_CORPUS } = await load("rag/corpus.ts");

  const dental = resolveTemplate({ industry: "dental" });

  // 1. Each industry resolves to its own template, untouched.
  for (const { id } of INDUSTRIES) {
    const tpl = resolveTemplate({ industry: id });
    const base = getBaseTemplate(id);
    assert(tpl.id === id, `resolveTemplate(${id}) returned template ${tpl.id}`);
    for (const key of ["people", "knowledge", "relations", "processes", "controls", "scenarios"]) {
      assert(
        JSON.stringify(tpl[key]) === JSON.stringify(base[key]),
        `resolveTemplate(${id}).${key} differs from the ${id} template`,
      );
    }
  }

  // 2. Custom people replace the roster and dangling references are dropped.
  const retail = resolveTemplate({ industry: "retail" });
  const keep = retail.people.slice(0, 1);
  const custom = resolveTemplate({ industry: "retail", customPeople: keep });
  assert(custom.people.length === 1, "custom people did not replace the roster");
  assert(
    custom.relations.every((r) => r.personId === keep[0].id),
    "knowledge relations still point at removed people",
  );
  assert(
    custom.processes.every((p) => (p.ownerPersonIds ?? []).every((id) => id === keep[0].id)),
    "process owners still point at removed people",
  );
  assert(
    resolveTemplate({ industry: "retail" }).people.length === retail.people.length,
    "resolveTemplate leaked custom people into a later call",
  );

  // 3. Pioneer profile canonicalisation keeps the industry and never defaults to dental.
  assert(pioneerProfileFrom({ industry: "retail" }).industry === "retail", "profile lost industry");
  assert(
    pioneerProfileFrom({}).industry === "general",
    "missing industry did not fall back to general",
  );
  assert(
    pioneerProfileFrom({ industry: "not-an-industry" }).industry === "general",
    "invalid industry did not fall back to general",
  );

  // 4. Pioneer tools answer for the industry they were given.
  const profile = pioneerProfileFrom({ industry: "retail", practiceName: "Harbor Lane Boutique" });
  const ctx = { profile, question: "What are my biggest risks?" };
  const retailPeople = new Set(retail.people.map((p) => p.id));
  const names = (tpl) => [...tpl.knowledge, ...tpl.controls, ...tpl.scenarios].map((x) => x.name);
  const retailNames = new Set(names(retail));
  const dentalOnlyNames = new Set(names(dental).filter((n) => !retailNames.has(n)));
  const chunkIndustry = new Map(KNOWLEDGE_CORPUS.map((c) => [c.id, c.industry]));

  const snapshot = executeTool("get_practice_snapshot", {}, ctx);
  assert(snapshot.data.industry === "retail", `snapshot industry = ${snapshot.data.industry}`);
  assert(snapshot.data.practice === "Harbor Lane Boutique", "snapshot lost the practice name");

  const spofs = executeTool("get_knowledge_spofs", {}, ctx);
  for (const item of spofs.data) {
    for (const owner of item.owners) {
      assert(
        retailPeople.has(owner.id),
        `Retail SPOF ${item.name} owned by non-retail person ${owner.name}`,
      );
    }
  }

  const portfolio = executeTool("get_residual_portfolio", {}, ctx);
  for (const risk of portfolio.data.top) {
    assert(
      !dentalOnlyNames.has(risk.name),
      `Retail portfolio includes dental-only risk "${risk.name}"`,
    );
  }

  const rag = executeTool("retrieve_guidance", { query: "cash handling and vendor payments" }, ctx);
  assert(rag.data.hits.length > 0, "retrieval returned no hits");
  for (const hit of rag.data.hits) {
    const industry = chunkIndustry.get(hit.id);
    assert(
      industry === undefined || industry === "retail" || industry === "general",
      `Retail retrieval returned a ${industry} chunk: ${hit.title}`,
    );
  }
} finally {
  await server.close();
}

if (failures.length) {
  console.error("Template resolution check FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "Template resolution OK: every industry resolves to its own template and Pioneer stays in the industry it is given.",
);
