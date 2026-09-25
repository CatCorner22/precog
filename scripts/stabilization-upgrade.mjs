#!/usr/bin/env node
/** Checked, one-time source edits; restricted to the approved working branch. */
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const branch=execFileSync("git",["branch","--show-current"],{encoding:"utf8"}).trim();
if(branch!=="fix/expanded-stabilization-20260924")throw new Error("Source migration is restricted to the stabilization branch");
const files=new Map();
const edit=async(path,fn)=>{const before=await readFile(path,"utf8");const after=fn(before);if(after!==before)files.set(path,after);};
function once(source,from,to,label){if(source.includes(to))return source;if(source.split(from).length!==2)throw new Error(`Ambiguous or missing ${label}; no files changed`);return source.replace(from,to);}
await edit("src/components/precog/process-canvas.tsx",(s)=>{
  s=once(s,'const rfEdges: Edge[] = useMemo(() => {','const rfEdges: Edge[] = useMemo(() => {\n    const visibleIds = new Set(rfNodes.map((node) => node.id));',"visible node index");
  s=s.replace('const ids = new Set(rfNodes.map((n) => n.id));\n        return ids.has(e.source) && ids.has(e.target);','return visibleIds.has(e.source) && visibleIds.has(e.target);');
  s=s.replace('animated: isDep && depInteractive && vision !== "terminator",','animated: isDep && depInteractive && vision !== "terminator" && rfNodes.length < 100,');
  if(!s.includes('// One user action removes all selected dependency edges.')){
    const start=s.indexOf('  const onEdgesDelete = useCallback('),end=s.indexOf('  const rfEdges: Edge[] = useMemo(',start);
    if(start<0||end<0)throw new Error("Dependency deletion handler was not found");
    s=s.slice(0,start)+`  // One user action removes all selected dependency edges.
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!build) return;
      const ids = new Set(deleted.map((edge) => edge.id));
      const removed = new Map<string, Set<string>>();
      for (const edge of graph.edges) {
        if (edge.kind !== "depends" || !ids.has(edge.id)) continue;
        const sources = removed.get(edge.target) ?? new Set<string>();
        sources.add(edge.source);
        removed.set(edge.target, sources);
      }
      if (!removed.size) return;
      setCustomProcesses((current) => current.map((process) => {
        const sources = removed.get(process.id);
        return sources ? { ...process, dependencies: process.dependencies.filter((id) => !sources.has(id)) } : process;
      }));
    },
    [build, graph.edges, setCustomProcesses],
  );

`+s.slice(end);
  }
  return s;
});
await edit("src/lib/precog/process-graph.ts",(s)=>{
  if(!s.includes('type SharedProcessAnalysis =')){
    s='import type { MapRecord } from "./map/hierarchy";\n'+s;
    s=once(s,'export function enrichProcess(',`type SharedProcessAnalysis = {
  knowledgeRisks: ReturnType<typeof findKnowledgeRisks>;
  portfolio: ReturnType<typeof portfolioSummary>;
};

export function enrichProcess(`,"shared analysis type");
    s=once(s,'  process: ProcessNode,\n  staff?: StaffComposition,\n): ProcessMapSnapshot {','  process: ProcessNode,\n  staff?: StaffComposition,\n  shared?: SharedProcessAnalysis,\n): ProcessMapSnapshot {',"optional shared analysis");
    s=once(s,'  const kRisks = findKnowledgeRisks(tpl);','  const kRisks = shared?.knowledgeRisks ?? findKnowledgeRisks(tpl);',"knowledge analysis reuse");
    s=once(s,'  const portfolio = portfolioSummary(tpl, staff);','  const portfolio = shared?.portfolio ?? portfolioSummary(tpl, staff);',"portfolio analysis reuse");
    s=once(s,'  const snapshots = processes.map((p) => enrichProcess(tpl, p, staff));',`  const shared = { knowledgeRisks: findKnowledgeRisks(tpl), portfolio: portfolioSummary(tpl, staff) };
  const snapshots = processes.map((p) => enrichProcess(tpl, p, staff, shared));`,"per-graph shared calculation");
    s=once(s,'    for (const dep of p.dependencies) {',`    // Containment and rework are explicit relationships, not extra loss scenarios.
    const hierarchical = p as MapRecord;
    if (hierarchical.parentProcessId && processes.some((record) => record.id === hierarchical.parentProcessId)) {
      edges.push({ id: "contains-" + p.id, source: hierarchical.parentProcessId, target: p.id, kind: "feeds", label: "contains" });
    }
    for (const link of hierarchical.flowLinks ?? []) {
      if (processes.some((record) => record.id === link.targetId)) edges.push({ id: "flow-" + p.id + "-" + link.kind + "-" + link.targetId, source: p.id, target: link.targetId, kind: "feeds", label: link.kind });
    }
    for (const dep of p.dependencies) {`,"typed map links");
  }
  return s;
});
await edit("src/components/precog/power-map-builder.tsx",(s)=>{
  if(!s.includes('window.localStorage.')&&!s.includes('localStorage.'))return s;
  const helpers=[];
  for(const [method,helper] of [["getItem","readLocal"],["setItem","writeLocal"],["removeItem","removeLocal"]]){
    const expression=new RegExp('(?:window\\.)?localStorage\\.'+method+'\\(','g');
    if(expression.test(s)){s=s.replace(expression,helper+'(');helpers.push(helper);}
  }
  if(helpers.length)s='import { '+helpers.join(', ')+' } from "@/lib/precog/local-data";\n'+s;
  return s;
});
await edit("src/components/precog/dynamic-variables-panel.tsx",(s)=>{
  // Editing a number invalidates an earlier document/broker source attestation.
  return s.replace(/fact\.source === "unverified" \|\| fact\.source === "sample"\s*\? "owner_entered"\s*: fact\.source/g,'"owner_entered"');
});
for(const [path,contents] of files)await writeFile(path,contents);
console.log(JSON.stringify({upgrade:"stabilization-v3",changed:[...files.keys()]}));
