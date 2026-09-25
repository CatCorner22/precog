import { describe, expect, it } from "vitest";
import { completeGuidedRoster, prepareGuidedRoster } from "./guided-setup";
describe("guided roster setup",()=>{
  it("uses the deterministic importer and preserves the included people",()=>{
    const prepared=prepareGuidedRoster("Name,Title\nAlex Smith,Owner\nJordan Lee,Bookkeeper","general");expect(prepared.rows).toHaveLength(2);const people=completeGuidedRoster(prepared.rows,"general");expect(people.map((p)=>p.name)).toEqual(["Alex Smith","Jordan Lee"]);expect(people.some((p)=>p.dutiesFromTitle)).toBe(true);
  });
  it("does not invent duties for an unfamiliar title",()=>{
    const prepared=prepareGuidedRoster("Name,Title\nAlex Smith,Unknown bespoke role","general");expect(prepared.uncertain).toBeGreaterThan(0);
  });
  it("rejects empty, oversized, and unnamed input",()=>{
    expect(()=>prepareGuidedRoster("","general")).toThrow();expect(()=>prepareGuidedRoster("x".repeat(250001),"general")).toThrow("too large");expect(()=>completeGuidedRoster([{name:"",role:"Owner",duties:[]}],"general")).toThrow("name");
  });
});
