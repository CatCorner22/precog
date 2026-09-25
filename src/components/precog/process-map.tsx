import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import { ProcessMap as ProcessCanvas } from "./process-canvas";
import { descendantIds, indexHierarchy, levelOf, moveSibling, outline, removeSubtree, uniqueSummary, validateHierarchy, MAP_RECORD_LIMIT, type FlowKind, type MapLevel, type MapRecord } from "@/lib/precog/map/hierarchy";
import { mapFromCsv, mapFromJson, mapToCsv, mapToJson } from "@/lib/precog/map/transfer";

const button="min-h-10 rounded border border-border px-3 py-2 text-sm disabled:opacity-50";
const field="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg";
function DraftField({label,value,commit,multiline=false}:{label:string;value:string;commit:(value:string)=>void;multiline?:boolean}) {
  const [draft,setDraft]=useState(value);
  useEffect(()=>setDraft(value),[value]);
  return <label className="block text-sm">{label}{multiline?<textarea className={field} value={draft} maxLength={2000} onChange={(e)=>setDraft(e.target.value)} onBlur={()=>{if(draft!==value)commit(draft);}}/>:<input className={field} value={draft} maxLength={200} onChange={(e)=>setDraft(e.target.value)} onBlur={()=>{if(draft!==value)commit(draft);}} onKeyDown={(e)=>{if(e.key==="Enter")e.currentTarget.blur();}}/>}</label>;
}

export function ProcessMap(props: ComponentProps<typeof ProcessCanvas>) {
  const template=useTemplate();
  const {profile,setCustomProcesses,undoMap,redoMap,canUndoMap,canRedoMap,syncStatus}=usePractice();
  const records=template.processes as MapRecord[];
  const [view,setView]=useState<"canvas"|"outline"|"table">("canvas");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
  const [query,setQuery]=useState("");
  const [page,setPage]=useState(0);
  const [incoming,setIncoming]=useState<MapRecord[]|null>(null);
  const [problem,setProblem]=useState("");
  const [target,setTarget]=useState("");
  const [kind,setKind]=useState<FlowKind|"dependency">("sequence");
  const upload=useRef<HTMLInputElement>(null);
  const selected=records.find((p)=>p.id===selectedId);
  const hierarchy=useMemo(()=>indexHierarchy(records),[records]);
  const rows=useMemo(()=>outline(records,collapsed),[records,collapsed]);
  const filtered=rows.filter(({record})=>!query.trim() || `${record.name} ${record.description}`.toLowerCase().includes(query.toLowerCase()));
  const pages=Math.max(1,Math.ceil(filtered.length/50)), actualPage=Math.min(page,pages-1);
  const shown=filtered.slice(actualPage*50,actualPage*50+50);
  const issues=useMemo(()=>validateHierarchy(records),[records]);
  useEffect(()=>{setSelectedId(null);setCollapsed(new Set());setIncoming(null);setQuery("");setPage(0);},[profile.businessId]);
  function apply(next:MapRecord[]) {
    const errors=validateHierarchy(next);
    if(errors.length){toast.error(errors[0]);return;}
    setCustomProcesses(next);
  }
  function patch(next:Partial<MapRecord>){if(selected)apply(records.map((p)=>p.id===selected.id?{...p,...next}:p));}
  function add(level:MapLevel){
    if(records.length>=MAP_RECORD_LIMIT){toast.error(`Maximum ${MAP_RECORD_LIMIT} records.`);return;}
    if(level==="step" && (!selected || levelOf(selected)!=="process")){toast.error("Select a process before adding a step.");return;}
    const parent=level==="step"?selected!.id:level==="process" && selected && levelOf(selected)==="domain"?selected.id:undefined;
    const record:MapRecord={id:`proc-${crypto.randomUUID()}`,name:`New ${level}`,description:"",layer:"process",dependencies:[],controlIds:[],ownerPersonIds:[],nodeLevel:level,parentProcessId:parent,assessmentStatus:"suggested",mapOrder:records.length,stage:0};
    apply([...records,record]);setSelectedId(record.id);setView("outline");setQuery("");
    if(parent)setCollapsed((s)=>{const next=new Set(s);next.delete(parent);return next;});
  }
  function download(format:"json"|"csv"){
    const url=URL.createObjectURL(new Blob([format==="json"?mapToJson(records):mapToCsv(records)],{type:format==="json"?"application/json":"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download=`precog-map-v2.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function readImport(file:File|undefined){
    setProblem("");setIncoming(null);if(!file)return;
    try{
      if(file.size>2_000_000)throw new Error("Map exceeds 2 MB.");
      const source=await file.text(), parsed=file.name.endsWith(".csv")?mapFromCsv(source):mapFromJson(source);
      const people=new Set(template.people.map((p)=>p.id)), controls=new Set(template.controls.map((c)=>c.id));
      if(parsed.some((p)=>(p.ownerPersonIds??[]).some((id)=>!people.has(id))||p.controlIds.some((id)=>!controls.has(id))))throw new Error("Missing owner or control references. Restore the matching business first; no references were silently dropped.");
      setIncoming(parsed);
    }catch(error){setProblem(error instanceof Error?error.message:"Import failed.");}
    finally{if(upload.current)upload.current.value="";}
  }
  function addLink(){if(!selected||!target)return;if(kind==="dependency")patch({dependencies:[...new Set([...selected.dependencies,target])]});else if(!(selected.flowLinks??[]).some((link)=>link.targetId===target&&link.kind===kind))patch({flowLinks:[...(selected.flowLinks??[]),{targetId:target,kind}]});setTarget("");}
  const lines=(text:string)=>[...new Set(text.split("\n").map((v)=>v.trim()).filter(Boolean))];
  return <div className="space-y-4">
    <header className="rounded-xl border border-border bg-panel p-4 space-y-3">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="text-lg font-semibold">Business map workspace</h2><span className="text-xs" role="status">{records.length} records · Save status: {syncStatus}</span></div>
      <p className="text-sm text-muted">Domains contain processes; processes contain steps. All three views edit the same records. Unconfirmed records are provisional, not an assessed description of your business.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Map views">{(["canvas","outline","table"] as const).map((v)=><button key={v} type="button" className={button} aria-pressed={view===v} onClick={()=>setView(v)}>{v[0].toUpperCase()+v.slice(1)}</button>)}<button type="button" className={button} disabled={!canUndoMap} onClick={undoMap}>Undo map edit</button><button type="button" className={button} disabled={!canRedoMap} onClick={redoMap}>Redo map edit</button></div>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={()=>add("domain")}>New domain</button><button type="button" className={button} onClick={()=>add("process")}>New process record</button><button type="button" className={button} disabled={!selected||levelOf(selected)!=="process"} onClick={()=>add("step")}>New child step</button><button type="button" className={button} onClick={()=>download("json")}>Export map JSON</button><button type="button" className={button} onClick={()=>download("csv")}>Export map CSV</button><button type="button" className={button} onClick={()=>upload.current?.click()}>Import reviewed map</button><input ref={upload} type="file" accept=".json,.csv" className="hidden" onChange={(e)=>void readImport(e.target.files?.[0])}/></div>
      {problem&&<p role="alert" className="text-sm text-danger">{problem}</p>}
      {incoming&&<div className="rounded border border-warn p-3 text-sm"><p>{incoming.filter((p)=>!hierarchy.byId.has(p.id)).length} additions; {incoming.filter((p)=>hierarchy.byId.has(p.id)).length} existing IDs; {records.filter((p)=>!incoming.some((n)=>n.id===p.id)).length} records removed by replacement.</p><p>Existing people, other businesses, and accounts are not replaced. Applying this map is one undoable edit.</p><button type="button" className={button} onClick={()=>{if(window.confirm("Replace the active map with this reviewed import?")){apply(incoming);setIncoming(null);}}}>Apply reviewed map</button><button type="button" className={button} onClick={()=>setIncoming(null)}>Cancel import</button></div>}
      {issues.length>0&&<details><summary className="text-sm text-warn">{issues.length} structural issue(s)</summary>{issues.map((issue)=><p key={issue} className="text-sm">{issue}</p>)}</details>}
    </header>
    {view==="canvas"?<ProcessCanvas {...props}/>:<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
      <section className="min-w-0 rounded-xl border border-border bg-panel p-4 space-y-3">
        <label className="block text-sm">Find a record<input className={field} value={query} onChange={(e)=>{setQuery(e.target.value);setPage(0);}}/></label>
        <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={()=>setCollapsed(new Set())}>Expand all</button><button type="button" className={button} onClick={()=>setCollapsed(new Set(records.filter((p)=>levelOf(p)==="domain").map((p)=>p.id)))}>Collapse domains</button></div>
        {view==="outline"?<div role="list" aria-label="Business outline">{shown.map(({record:p,depth,hasChildren})=><div key={p.id} role="listitem" className="my-2 flex items-center gap-2 rounded border border-border p-2" style={{marginLeft:Math.min(depth,3)*16}}>{hasChildren&&<button type="button" className={button} aria-label={`${collapsed.has(p.id)?"Expand":"Collapse"} ${p.name}`} aria-expanded={!collapsed.has(p.id)} onClick={()=>setCollapsed((old)=>{const next=new Set(old);if(next.has(p.id))next.delete(p.id);else next.add(p.id);return next;})}>{collapsed.has(p.id)?"+":"−"}</button>}<button type="button" className="min-h-10 min-w-0 flex-1 text-left" aria-pressed={selectedId===p.id} onClick={()=>setSelectedId(p.id)}><span className="block break-words font-medium">{p.name}</span><span className="text-xs text-muted">{levelOf(p)} · {p.assessmentStatus==="confirmed"?"reviewed by owner":"provisional"}</span></button></div>)}</div>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Business records; select one to edit</caption><thead><tr><th>Name</th><th>Level / parent</th><th>Owners</th></tr></thead><tbody>{shown.map(({record:p})=><tr key={p.id} className="border-t border-border"><td className="p-2"><button type="button" className="min-h-10 underline" onClick={()=>setSelectedId(p.id)}>{p.name}</button></td><td className="p-2">{levelOf(p)} / {hierarchy.byId.get(p.parentProcessId??"")?.name??"Top level"}</td><td className="p-2">{(p.ownerPersonIds??[]).map((id)=>template.people.find((person)=>person.id===id)?.name??"Missing owner").join(", ")||"Unassigned"}</td></tr>)}</tbody></table></div>}
        <div className="flex items-center gap-3 text-sm"><button type="button" className={button} disabled={actualPage===0} onClick={()=>setPage(actualPage-1)}>Previous records</button><span>Page {actualPage+1} of {pages}</span><button type="button" className={button} disabled={actualPage+1>=pages} onClick={()=>setPage(actualPage+1)}>Next records</button></div>
      </section>
      <section className="rounded-xl border border-border bg-panel p-4 space-y-3" aria-label="Selected record details">{selected?<>
        <DraftField key={`${selected.id}:name`} label="Record name" value={selected.name} commit={(name)=>{if(name.trim())patch({name:name.trim()});}}/>
        <DraftField key={`${selected.id}:description`} label="Description" value={selected.description} commit={(description)=>patch({description})} multiline/>
        {levelOf(selected)!=="domain"&&<label className="block text-sm">Parent<select className={field} value={selected.parentProcessId??""} onChange={(e)=>patch({parentProcessId:e.target.value||undefined})}><option value="">Top level</option>{records.filter((p)=>levelOf(p)===(levelOf(selected)==="step"?"process":"domain")&&p.id!==selected.id).map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <fieldset><legend className="text-sm">Responsible people</legend><div className="max-h-40 overflow-y-auto">{template.people.filter((p)=>p.active).map((person)=><label key={person.id} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={selected.ownerPersonIds?.includes(person.id)??false} onChange={(e)=>patch({ownerPersonIds:e.target.checked?[...(selected.ownerPersonIds??[]),person.id]:(selected.ownerPersonIds??[]).filter((id)=>id!==person.id)})}/>{person.name}</label>)}</div></fieldset>
        <DraftField key={`${selected.id}:inputs`} label="Inputs (one per line)" value={(selected.inputs??[]).join("\n")} commit={(text)=>patch({inputs:lines(text)})} multiline/>
        <DraftField key={`${selected.id}:outputs`} label="Outputs (one per line)" value={(selected.outputs??[]).join("\n")} commit={(text)=>patch({outputs:lines(text)})} multiline/>
        <DraftField key={`${selected.id}:procedure`} label="Procedure location" value={selected.procedureLocation??""} commit={(procedureLocation)=>patch({procedureLocation})}/>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={selected.documented===true} onChange={(e)=>patch({documented:e.target.checked})}/>A written procedure exists</label>
        <fieldset><legend className="text-sm">Link records without dragging</legend><select className={field} aria-label="Relationship type" value={kind} onChange={(e)=>setKind(e.target.value as FlowKind|"dependency")}><option value="sequence">Selected record flows to…</option><option value="handoff">Selected record hands off to…</option><option value="rework">Selected record returns to…</option><option value="dependency">Selected record depends on…</option></select><select className={field} aria-label="Target record" value={target} onChange={(e)=>setTarget(e.target.value)}><option value="">Choose a record</option>{records.filter((p)=>p.id!==selected.id&&levelOf(p)!=="domain").map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button type="button" className={button} disabled={!target} onClick={addLink}>Add relationship</button></fieldset>
        {(selected.flowLinks??[]).map((link,i)=><div key={`${link.kind}:${link.targetId}`} className="flex items-center justify-between gap-2 text-xs"><span>{link.kind} → {hierarchy.byId.get(link.targetId)?.name??link.targetId}</span><button type="button" className={button} onClick={()=>patch({flowLinks:selected.flowLinks?.filter((_,index)=>i!==index)})}>Remove flow link</button></div>)}
        {selected.dependencies.map((id)=><div key={id} className="flex items-center justify-between text-xs"><span>Requires {hierarchy.byId.get(id)?.name??id}</span><button type="button" className={button} onClick={()=>patch({dependencies:selected.dependencies.filter((targetId)=>targetId!==id)})}>Remove dependency</button></div>)}
        <details><summary className="text-sm">Controls and unique-reference summary</summary>{template.controls.map((c)=><label key={c.id} className="my-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.controlIds.includes(c.id)} onChange={(e)=>patch({controlIds:e.target.checked?[...selected.controlIds,c.id]:selected.controlIds.filter((id)=>id!==c.id)})}/>{c.name}</label>)}<p className="text-xs">{Object.entries(uniqueSummary(records,selected.id)).map(([key,n])=>`${n} ${key}`).join(" · ")}. Shared references count once; child losses are not summed into a parent loss.</p></details>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={selected.assessmentStatus==="confirmed"} onChange={(e)=>patch({assessmentStatus:e.target.checked?"confirmed":"suggested"})}/>I reviewed this record against how we work</label>
        <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={()=>apply(moveSibling(records,selected.id,-1))}>Move earlier</button><button type="button" className={button} onClick={()=>apply(moveSibling(records,selected.id,1))}>Move later</button><button type="button" className={button} onClick={()=>{const count=descendantIds(records,selected.id).size;if(window.confirm(`Delete ${selected.name}${count?` and ${count} child records`:""}? Incoming links will be removed. Undo remains available.`)){apply(removeSubtree(records,selected.id));setSelectedId(null);}}}>Delete subtree</button></div>
        <p className="text-xs text-muted">Use Canvas → Build for detailed risks, evidence, waste and improvement ideas.</p>
      </>:<p className="text-sm text-muted">Select a record. No dragging is needed to build the hierarchy or its relationships.</p>}</section>
    </div>}
  </div>;
}
