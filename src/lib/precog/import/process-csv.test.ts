import { describe, expect, it } from "vitest";
import { getIndustryTemplate } from "../templates";
import { parseProcessCsv, processesToCsv, processTemplateCsv } from "./process-csv";

const dental = getIndustryTemplate("dental");
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
      'Daily deposit,3,Take cash to the bank.,Jordan Blake; Maya Chen,Cash handling & deposits,Split duties: posting payments and reconciling the bank; c-cash,daily,"Bank portal; Dentrix",yes,Drive > Deposits.pdf',
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

  it("reports a process made in the map builder and re-imported from its own CSV as unchanged", () => {
    const made = {
      id: "proc-new-process",
      name: "New process",
      layer: "process" as const,
      description: "Describe what this process does and who touches it.",
      dependencies: [],
      controlIds: [],
      stage: 3,
      ownerPersonIds: [],
      risks: [],
      ideas: [],
      wastes: [],
      inputs: [],
      outputs: [],
    };
    const map = { ...tpl, processes: [...tpl.processes, made] };
    const r = parseProcessCsv(processesToCsv(map.processes, map.people, map.controls), map);
    expect(r.updated).toEqual([]);
    expect(r.unchanged).toHaveLength(map.processes.length);
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
      messages.some(
        (m) => m.startsWith("1:This owner is not on the team") && m.includes("Nobody Here"),
      ),
    ).toBe(true);
    expect(
      messages.some(
        (m) =>
          m.startsWith("1:The importer cannot find this process") && m.includes("Ghost process"),
      ),
    ).toBe(true);
    expect(messages.some((m) => m.startsWith("1:This control is not in the library"))).toBe(true);
    expect(
      messages.some((m) => m.includes('The importer does not know the cadence "sometimes"')),
    ).toBe(true);
    expect(messages.some((m) => m.includes('Documented "maybe" must be yes or no'))).toBe(true);
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
    expect(r.issues[0]).toEqual({
      row: 3,
      message: "This import reads the first 2 rows; it did not read 1 more row",
    });
  });
});

describe("parseProcessCsv: new rows, invisible characters and delimiters", () => {
  it("adds a new row whose name slugs to an existing id as a new process, not a rename", () => {
    const r = parseProcessCsv("process,description\nCash,Count the drawer", tpl);
    expect(r.updated).toEqual([]);
    expect(r.added.map((p) => [p.id, p.name])).toEqual([["proc-cash-2", "Cash"]]);
    const cash = r.processes.find((p) => p.id === "proc-cash");
    expect(cash?.name).toBe("Cash handling & deposits");
    expect(r.removed.map((p) => p.id)).toContain("proc-cash");
    expect(r.issues).toEqual([]);
  });

  it("strips a right-to-left override and a zero-width space from a process name", () => {
    const r = parseProcessCsv("process\n\u202EDaily deposit\u200B", tpl);
    expect(r.added[0].name).toBe("Daily deposit");
  });

  it("reads a semicolon file and a tab file", () => {
    for (const text of [
      "process;description\nDaily deposit;Count the drawer",
      "process\tdescription\nDaily deposit\tCount the drawer",
    ]) {
      const r = parseProcessCsv(text, tpl);
      expect(r.issues).toEqual([]);
      expect(r.added.map((p) => [p.name, p.description])).toEqual([
        ["Daily deposit", "Count the drawer"],
      ]);
    }
  });

  it("matches an owner written with accents to the same name without them", () => {
    const r = parseProcessCsv("process,owners\nDaily deposit,José Ruiz", {
      ...tpl,
      people: [{ id: "pj", name: "Jose Ruiz", role: "Front desk", active: true }],
    });
    expect(r.issues).toEqual([]);
    expect(r.added[0].ownerPersonIds).toEqual(["pj"]);
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

  it("ships a template that imports without an issue onto the current map", () => {
    const r = parseProcessCsv(processTemplateCsv(tpl), tpl);
    expect(r.issues).toEqual([]);
    expect(r.added.map((p) => p.name)).toEqual([
      "Collect payments",
      "Daily deposit",
      "Vendor setup",
    ]);
    const deposit = r.added.find((p) => p.name === "Daily deposit")!;
    expect(deposit.dependencies).toEqual([r.added[0].id]);
    expect(deposit.ownerPersonIds).toEqual([tpl.people[0].id]);
    expect(deposit.controlIds).toEqual([tpl.controls[0].id]);

    const blank = parseProcessCsv(processTemplateCsv(), {
      processes: [],
      people: [],
      controls: [],
    });
    expect(blank.issues).toEqual([]);
    expect(blank.processes).toHaveLength(3);
  });
});
