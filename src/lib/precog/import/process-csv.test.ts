import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { parseProcessCsv, processesToCsv, processTemplateCsv } from "./process-csv";

const dental = getBaseTemplate("dental");
const tpl = { processes: dental.processes, people: dental.people, controls: dental.controls };

describe("parseProcessCsv", () => {
  it("rejects a file without a process column", () => {
    const r = parseProcessCsv("title,owner\nfoo,bar\n", tpl);
    expect(r.issues[0].message).toMatch(/Missing a "process" column/);
    expect(r.processes).toBe(tpl.processes);
  });

  it("adds a new process, resolving owners, dependencies, and controls by name", () => {
    const csv = [
      "process,stage,description,owners,depends on,controls,cadence,systems,documented,procedure location",
      'Daily deposit,3,Take cash to the bank.,Jordan Blake; Maya Chen,Cash handling & deposits,SoD: payments vs reconciliation; c-cash,daily,"Bank portal; Dentrix",yes,Drive > Deposits.pdf',
    ].join("\n");
    const r = parseProcessCsv(csv, tpl);
    expect(r.issues).toEqual([]);
    expect(r.added).toHaveLength(1);
    const p = r.added[0];
    expect(p.id).toBe("proc-daily-deposit");
    expect(p.stage).toBe(3);
    expect(p.ownerPersonIds).toEqual(["p3", "p2"]);
    expect(p.dependencies).toEqual(["proc-cash"]);
    expect(p.controlIds).toEqual(["c-sod-cash", "c-cash"]);
    expect(p.cadence).toBe("daily");
    expect(p.systems).toEqual(["Bank portal", "Dentrix"]);
    expect(p.documented).toBe(true);
    expect(p.procedureLocation).toBe("Drive > Deposits.pdf");
    // Merge mode keeps every existing process and appends the new one.
    expect(r.processes).toHaveLength(tpl.processes.length + 1);
    expect(r.processes.at(-1)).toBe(p);
    expect(r.removed).toHaveLength(tpl.processes.length);
  });

  it("updates an existing process by name and keeps its id, risks, and untouched columns", () => {
    const cash = tpl.processes.find((p) => p.id === "proc-cash")!;
    const csv = ["process,cadence,documented", "Cash Handling & Deposits,Weekly,no"].join("\n");
    const r = parseProcessCsv(csv, tpl);
    expect(r.issues).toEqual([]);
    expect(r.added).toEqual([]);
    expect(r.updated).toHaveLength(1);
    const after = r.updated[0].after;
    expect(after.id).toBe("proc-cash");
    expect(after.cadence).toBe("weekly");
    expect(after.documented).toBe(false);
    // Columns absent from the file are preserved from the current map.
    expect(after.description).toBe(cash.description);
    expect(after.controlIds).toEqual(cash.controlIds);
    expect(after.ownerPersonIds).toEqual(cash.ownerPersonIds);
    expect(after.risks).toEqual(cash.risks);
    expect(after.stage).toBe(cash.stage);
  });

  it("reports an unchanged round trip as unchanged", () => {
    const csv = processesToCsv(tpl.processes, tpl.people, tpl.controls);
    const r = parseProcessCsv(csv, tpl);
    expect(r.issues).toEqual([]);
    expect(r.added).toEqual([]);
    expect(r.updated).toEqual([]);
    expect(r.unchanged).toHaveLength(tpl.processes.length);
    expect(r.removed).toEqual([]);
  });

  it("resolves dependencies between rows regardless of order", () => {
    const csv = [
      "process,depends on",
      "Second step,First step",
      "First step,",
      "Third step,Second step; First step",
    ].join("\n");
    const r = parseProcessCsv(csv, { processes: [], people: [], controls: [] });
    expect(r.issues).toEqual([]);
    const byName = Object.fromEntries(r.processes.map((p) => [p.name, p]));
    expect(byName["Second step"].dependencies).toEqual(["proc-first-step"]);
    expect(byName["Third step"].dependencies).toEqual(["proc-second-step", "proc-first-step"]);
  });

  it("skips unknown owners, dependencies, and controls with a row-numbered issue", () => {
    const csv = [
      "process,owners,depends on,controls,cadence,documented",
      "Night audit,Nobody Here,Ghost process,Made-up control,sometimes,maybe",
    ].join("\n");
    const r = parseProcessCsv(csv, tpl);
    const messages = r.issues.map((i) => `${i.row}:${i.message}`);
    expect(
      messages.some((m) => m.startsWith("1:Owner(s) not on the team") && m.includes("Nobody Here")),
    ).toBe(true);
    expect(
      messages.some((m) => m.startsWith("1:Dependency not found") && m.includes("Ghost process")),
    ).toBe(true);
    expect(messages.some((m) => m.startsWith("1:Control(s) not in the library"))).toBe(true);
    expect(messages.some((m) => m.includes('Cadence "sometimes" not recognised'))).toBe(true);
    expect(messages.some((m) => m.includes('Documented "maybe" should be yes or no'))).toBe(true);
    const p = r.added[0];
    expect(p.ownerPersonIds).toEqual([]);
    expect(p.dependencies).toEqual([]);
    expect(p.controlIds).toEqual([]);
    expect(p.cadence).toBeUndefined();
    expect(p.documented).toBeUndefined();
  });

  it("infers documented=yes when only a procedure location is given", () => {
    const r = parseProcessCsv("process,procedure location\nNight audit,Binder B\n", tpl);
    expect(r.added[0].documented).toBe(true);
    expect(r.added[0].procedureLocation).toBe("Binder B");
  });

  it("rejects self-dependency and blank names", () => {
    const r = parseProcessCsv("process,depends on\nLoop,Loop\n,Nothing\n", tpl);
    expect(r.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining(['"Loop" cannot depend on itself', "Process name is required"]),
    );
    expect(r.added[0].dependencies).toEqual([]);
  });

  it("replace mode drops processes not in the file and their dangling dependencies", () => {
    const csv = [
      "process,depends on",
      "Claims & denials,Clinical delivery",
      "Clinical delivery,",
    ].join("\n");
    const r = parseProcessCsv(csv, tpl, { mode: "replace" });
    expect(r.processes.map((p) => p.id).sort()).toEqual(["proc-claims", "proc-clinical"]);
    expect(r.removed).toHaveLength(tpl.processes.length - 2);
    // Clinical delivery depended on scheduling, which is gone from the map.
    expect(r.processes.find((p) => p.id === "proc-clinical")!.dependencies).toEqual([]);
  });

  it("truncates to maxRows and says so", () => {
    const csv = ["process", "A", "B", "C"].join("\n");
    const r = parseProcessCsv(csv, { processes: [], people: [], controls: [] }, { maxRows: 2 });
    expect(r.processes).toHaveLength(2);
    expect(r.issues[0]).toEqual({ row: 3, message: "Import truncated to 2 rows" });
  });
});

describe("processesToCsv", () => {
  it("writes names instead of ids and escapes commas", () => {
    const csv = processesToCsv(tpl.processes, tpl.people, tpl.controls);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "process,stage,description,owners,depends on,controls,cadence,systems,documented,procedure location,inputs,outputs",
    );
    const claims = lines.find((l) => l.startsWith("Claims & denials"))!;
    expect(claims).toContain("Chris Patel; Jordan Blake");
    expect(claims).toContain("Clinical delivery");
    expect(claims).not.toContain("proc-clinical");
    expect(claims).not.toContain("p6");
  });

  it("ships a template that imports cleanly onto an empty map", () => {
    const r = parseProcessCsv(processTemplateCsv(), {
      processes: [],
      people: [{ id: "p-j", name: "Jordan Lee", role: "Front desk", active: true }],
      controls: dental.controls,
    });
    expect(r.processes.map((p) => p.name)).toEqual(["Daily deposit", "Vendor setup"]);
    // "Collect payments" is only an example dependency; the template is honest about that.
    expect(r.issues.map((i) => i.message).join(" ")).toMatch(/Dependency not found/);
  });
});
