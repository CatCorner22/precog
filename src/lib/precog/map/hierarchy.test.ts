import { describe, expect, it } from "vitest";
import { descendantIds, moveSibling, outline, removeSubtree, uniqueSummary, validateHierarchy, type MapRecord } from "./hierarchy";
import { mapFromCsv, mapFromJson, mapToCsv, mapToJson } from "./transfer";
const fixture=():MapRecord[]=>[
  {id:"domain",name:"Money",description:"",layer:"process",dependencies:[],controlIds:[],nodeLevel:"domain"},
  {id:"process",name:"Claims",description:"",layer:"process",dependencies:[],controlIds:["control1"],nodeLevel:"process",parentProcessId:"domain"},
  {id:"submit",name:"Submit",description:"",layer:"process",dependencies:[],controlIds:["control1"],nodeLevel:"step",parentProcessId:"process",mapOrder:0},
  {id:"correct",name:"Correct",description:"",layer:"process",dependencies:[],controlIds:[],nodeLevel:"step",parentProcessId:"process",mapOrder:1},
];
describe("hierarchical map",()=>{
  it("keeps collapse non-destructive and rejects containment cycles",()=>{
    const records=fixture();expect(validateHierarchy(records)).toEqual([]);expect(outline(records).map((row)=>row.depth)).toEqual([0,1,2,2]);expect(outline(records,new Set(["domain"]))).toHaveLength(1);expect(records).toHaveLength(4);
    records[0].parentProcessId="submit";expect(validateHierarchy(records).some((error)=>error.includes("cycle"))).toBe(true);expect(outline(records)).toHaveLength(4);
  });
  it("permits explicit rework loops without inventing hard dependencies",()=>{
    const records=fixture();records[2].flowLinks=[{targetId:"correct",kind:"sequence"}];records[3].flowLinks=[{targetId:"submit",kind:"rework"}];expect(validateHierarchy(records)).toEqual([]);expect(records[2].dependencies).toEqual([]);
  });
  it("deletes a subtree and incoming links atomically without mutating the prior map",()=>{
    const records=fixture();records[0].dependencies=["process"];expect(descendantIds(records,"process").size).toBe(2);const next=removeSubtree(records,"process");expect(next).toHaveLength(1);expect(next[0].dependencies).toEqual([]);expect(records).toHaveLength(4);
  });
  it("moves siblings without dragging and counts shared controls once",()=>{
    const records=fixture();expect(outline(moveSibling(records,"submit",1)).slice(2).map((row)=>row.record.id)).toEqual(["correct","submit"]);expect(uniqueSummary(records,"domain").controls).toBe(1);
  });
  it("round-trips IDs, hierarchy, formulas-as-text, and typed relationships",()=>{
    const records=fixture();records[2].name='=HYPERLINK("text")';records[2].flowLinks=[{targetId:"correct",kind:"handoff"}];
    for(const restored of [mapFromJson(mapToJson(records)),mapFromCsv(mapToCsv(records))]){expect(restored.map((p)=>p.id)).toEqual(records.map((p)=>p.id));expect(restored[2].name).toBe(records[2].name);expect(restored[2].parentProcessId).toBe("process");expect(restored[2].flowLinks).toEqual(records[2].flowLinks);}
    expect(mapToCsv(records)).toContain("'=HYPERLINK");
  });
  it("refuses oversized, duplicate and dangling imports without truncation",()=>{
    expect(()=>mapFromJson("x".repeat(2000001))).toThrow("2 MB");expect(()=>mapFromJson(mapToJson([fixture()[0],fixture()[0]]))).toThrow("Duplicate");const records=fixture();records[2].dependencies=["missing"];expect(()=>mapFromJson(mapToJson(records))).toThrow("dependency");
  });
});
