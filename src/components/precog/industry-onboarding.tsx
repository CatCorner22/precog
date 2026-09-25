import { useEffect, useRef, useState } from "react";
import { INDUSTRIES, industryMeta, type IndustryId } from "@/lib/precog/industry";
import { usePractice } from "@/lib/precog/practice-context";
import { readLocalJson, writeLocal } from "@/lib/precog/local-data";
import { completeGuidedRoster, prepareGuidedRoster } from "@/lib/precog/onboarding/guided-setup";
import { coreDutyLabel, type OwnTeamRow } from "@/lib/precog/onboarding/own-team";
import { IndustryOnboarding as DetailedSetup } from "./industry-onboarding-detailed";

const button="min-h-10 rounded border border-border px-3 py-2 text-sm disabled:opacity-50";
const field="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg";
type Prepared=ReturnType<typeof prepareGuidedRoster>;

/** A short, optional path. The full established importer remains available. */
export function IndustryOnboarding(){
  const {profile,ready,startOwnBusiness,completeOnboarding,setupReturnsTo,cancelSetup}=usePractice();
  const [detailed,setDetailed]=useState(false);
  const [industry,setIndustry]=useState<IndustryId>(profile.industry);
  const [name,setName]=useState("");
  const [roster,setRoster]=useState("");
  const [prepared,setPrepared]=useState<Prepared|null>(null);
  const [problem,setProblem]=useState("");
  const [reviewed,setReviewed]=useState(false);
  const [restored,setRestored]=useState(false);
  const [busy,setBusy]=useState(false);
  const [elapsed,setElapsed]=useState<number|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const key=`precog.guidedSetup.v1.${profile.businessId??"new"}`;
  const visible=ready && profile.onboardingComplete===false;
  useEffect(()=>{
    if(!visible)return;
    const old=readLocalJson(key);
    if(old && typeof old==="object"){
      const draft=old as {name?:unknown;roster?:unknown;industry?:unknown};
      if(typeof draft.name==="string")setName(draft.name.slice(0,80));
      if(typeof draft.roster==="string")setRoster(draft.roster.slice(0,250000));
      if(INDUSTRIES.some((entry)=>entry.id===draft.industry))setIndustry(draft.industry as IndustryId);
    }
    setRestored(true);
  },[key,visible]);
  useEffect(()=>{
    if(!visible||!restored)return;
    const timer=setTimeout(()=>writeLocal(key,JSON.stringify({name,roster,industry})),250);
    const flush=()=>writeLocal(key,JSON.stringify({name,roster,industry}));
    window.addEventListener("pagehide",flush);
    return()=>{clearTimeout(timer);flush();window.removeEventListener("pagehide",flush);};
  },[key,name,roster,industry,restored,visible]);
  useEffect(()=>{
    if(visible&&!detailed)dialog.current?.showModal();
    else dialog.current?.close();
  },[visible,detailed]);
  if(!visible)return null;
  if(detailed)return <DetailedSetup/>;
  function inspect(){
    setProblem("");setBusy(true);setReviewed(false);
    // Yield once so the busy indicator paints before deterministic parsing.
    setTimeout(()=>{
      const began=performance.now();
      try{setPrepared(prepareGuidedRoster(roster,industry));setElapsed(Math.round(performance.now()-began));}
      catch(error){setProblem(error instanceof Error?error.message:"The roster could not be read.");}
      finally{setBusy(false);}
    },0);
  }
  function finish(){
    try{
      if(!prepared||!reviewed||!name.trim())throw new Error("Enter a business name and review the included people first.");
      const people=completeGuidedRoster(prepared.rows,industry);
      startOwnBusiness({industry,practiceName:name.trim(),people,leftOut:prepared.leftOut});
    }catch(error){setProblem(error instanceof Error?error.message:"Setup could not be completed.");}
  }
  function detailedWithDraft(){
    // The guided input remains in its own account-scoped draft; never lost on switching.
    writeLocal(key,JSON.stringify({name,roster,industry}));setDetailed(true);
  }
  function changeRow(index:number,patch:Partial<OwnTeamRow>){
    setPrepared((current)=>current?{...current,rows:current.rows.map((row,i)=>i===index?{...row,...patch}:row)}:null);setReviewed(false);
  }
  return <dialog ref={dialog} aria-labelledby="guided-setup-title" className="max-h-[92vh] w-[min(94vw,850px)] overflow-y-auto rounded-xl border border-border bg-panel p-5 text-fg backdrop:bg-black/70" onCancel={(event)=>{event.preventDefault();if(setupReturnsTo && window.confirm("Leave setup? The draft remains on this device."))void cancelSetup();}}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 id="guided-setup-title" className="text-xl font-semibold">Set up your business</h1><button type="button" className={button} onClick={detailedWithDraft}>Detailed setup and role shortcuts</button></div>
    <p className="my-3 text-sm text-muted">Start with your team and review the exceptions. Insurance and a complete process map can come later. Initial findings stay provisional where duties are suggested from job titles.</p>
    <fieldset className="my-3"><legend className="text-sm font-medium">1. Choose your industry</legend><div className="mt-2 flex flex-wrap gap-2">{INDUSTRIES.map((entry)=><button key={entry.id} type="button" className={button} aria-pressed={industry===entry.id} onClick={()=>{setIndustry(entry.id);setPrepared(null);setReviewed(false);}}>{entry.label}</button>)}</div></fieldset>
    <label className="my-3 block text-sm">Business name<input className={field} maxLength={80} value={name} onChange={(event)=>setName(event.target.value)} autoComplete="organization"/></label>
    <label className="my-3 block text-sm">2. Paste your team or HR/payroll export<textarea className={field} rows={6} maxLength={250000} value={roster} onChange={(event)=>{setRoster(event.target.value);setPrepared(null);setReviewed(false);}} placeholder={'Alex Smith, Owner\nJordan Lee, Office Manager\nSam Patel, Bookkeeper'}/></label>
    <button type="button" className={button} disabled={busy||!roster.trim()} onClick={inspect}>{busy?"Reading roster…":"Review roster"}</button>
    {problem&&<p role="alert" className="my-3 text-sm text-danger">{problem}</p>}
    {prepared&&<section className="my-4 space-y-3" aria-label="Roster review">
      <h2 className="font-semibold">3. Review the people and uncertain assignments</h2>
      <p className="text-sm" role="status">{prepared.rows.length} active people · {prepared.uncertain} title matches need attention · {prepared.leftOut.length} inactive records left out{elapsed!==null?` · Parsed in ${elapsed} ms on this device`:""}.</p>
      {prepared.issues.length>0&&<details open><summary className="text-sm text-warn">Import notes ({prepared.issues.length})</summary>{prepared.issues.map((issue,index)=><p key={index} className="text-xs text-muted">{issue.message}</p>)}</details>}
      <div className="max-h-72 space-y-2 overflow-y-auto">{prepared.rows.map((row,index)=><details key={row.rowId??index} className="rounded border border-border p-2" open={!row.duties.length||row.readAs?.partial}><summary className="cursor-pointer text-sm">{row.name} — {row.role||"Title unknown"} · {row.duties.length} suggested duties</summary><label className="block text-sm">Name<input className={field} value={row.name} onChange={(event)=>changeRow(index,{name:event.target.value})}/></label><p className="my-2 text-xs text-muted">{row.duties.length?row.duties.map(coreDutyLabel).join("; "):"No duty assignments established. Use detailed setup to assign these; this person is not evidence of a completed review."}</p><p className="text-xs">Detailed setup provides the full duty grid and role-count shortcuts.</p></details>)}</div>
      <label className="flex min-h-10 items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={(event)=>setReviewed(event.target.checked)}/><span>I reviewed who is included. I understand suggested duties and unanswered questions are not verified facts about my business.</span></label>
      <button type="button" className={button} disabled={!reviewed||!name.trim()} onClick={finish}>Open preliminary assessment</button>
    </section>}
    <hr className="my-4 border-border"/>
    <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={()=>{if((name.trim()||roster.trim())&&!window.confirm("Open the sample instead? Your guided setup draft remains on this device."))return;completeOnboarding(industry);}}>Load {industryMeta(industry).label.split(" /")[0]} demo</button>{setupReturnsTo&&<button type="button" className={button} onClick={()=>void cancelSetup()}>Return to {setupReturnsTo.name}</button>}</div>
    <p className="mt-3 text-xs text-muted">No AI request is needed to parse your roster. Do not paste payroll amounts, Social Security numbers, patient records, or other information this setup does not need.</p>
  </dialog>;
}
