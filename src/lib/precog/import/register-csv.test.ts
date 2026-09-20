import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { coverageReport } from "../continuity/coverage";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, Person } from "../types";
import { parseRegisterCsv, registerTemplateCsv, registerToCsv } from "./register-csv";

const dental = getBaseTemplate("dental");

const people: Person[] = [
  { id: "p-ana", name: "Ana Ruiz", role: "Owner", active: true },
  { id: "p-ben", name: "Ben Lee", role: "Manager", active: true },
  { id: "p-dee", name: "Dee Former", role: "Bookkeeper", active: false },
];

const knowledge: KnowledgeItem[] = [
  {
    id: "k-payroll",
    name: "Run payroll",
    kind: "duty",
    criticality: "critical",
    category: "process",
    description: "Every other Friday",
    linkedProcessIds: ["proc-payroll"],
    documented: false,
  },
  {
    id: "k-vendor",
    name: "Vendor quirks",
    kind: "knowledge",
    criticality: "important",
    category: "tribal",
    description: 'Who needs a "PO", who does not',
    linkedProcessIds: [],
    documented: true,
    procedureLocation: "Drive > Vendors > Quirks.docx",
  },
];

const tpl: IndustryTemplate = {
  ...dental,
  people,
  knowledge,
  relations: [
    { personId: "p-ana", knowledgeId: "k-payroll", level: "expert" },
    { personId: "p-ben", knowledgeId: "k-payroll", level: "basic" },
    { personId: "p-dee", knowledgeId: "k-payroll", level: "expert" },
    { personId: "p-ben", knowledgeId: "k-vendor", level: "proficient" },
    { personId: "p-ana", knowledgeId: "k-vendor", level: "aware" },
  ],
};

describe("registerToCsv", () => {
  it("writes one row per item with a column per active person", () => {
    const csv = registerToCsv(tpl);
    expect(csv.split("\r\n")).toEqual([
      "item,kind,criticality,documented,procedure location,description,Ana Ruiz,Ben Lee",
      "Run payroll,duty,critical,false,,Every other Friday,expert,learning",
      'Vendor quirks,knowledge,important,true,Drive > Vendors > Quirks.docx,"Who needs a ""PO"", who does not",aware,can do',
      "",
    ]);
  });

  it("round-trips through parseRegisterCsv keeping ids, links and many-to-many levels", () => {
    const result = parseRegisterCsv(registerToCsv(tpl), tpl);
    expect(result.issues).toEqual([]);
    expect(result.unknownPeople).toEqual([]);
    expect(result.knowledge).toEqual(knowledge);
    const key = (r: { personId: string; knowledgeId: string; level: string }) =>
      `${r.knowledgeId}|${r.personId}|${r.level}`;
    expect(result.relations.map(key).sort()).toEqual(
      tpl.relations
        .filter((r) => r.personId !== "p-dee")
        .map(key)
        .sort(),
    );
    expect(coverageReport({ ...tpl, ...result }).items.map((i) => [i.item.id, i.status])).toEqual(
      coverageReport(tpl).items.map((i) => [i.item.id, i.status]),
    );
  });

  it("round-trips every industry template", () => {
    for (const id of ["dental", "retail"] as const) {
      const base = getBaseTemplate(id);
      const result = parseRegisterCsv(registerToCsv(base), base);
      expect(result.issues, id).toEqual([]);
      expect(
        result.knowledge.map((k) => k.id),
        id,
      ).toEqual(base.knowledge.map((k) => k.id));
      expect(result.relations.length, id).toBe(
        base.relations.filter((r) => base.people.find((p) => p.id === r.personId)?.active).length,
      );
    }
  });
});

describe("parseRegisterCsv", () => {
  it("accepts header aliases, level labels, several people per item and several items per person", () => {
    const csv =
      "\uFEFFDuty,Type,Importance,Written procedure,Notes,ANA RUIZ,ben lee\r\n" +
      "Open the shop,duty,Business stops without it,yes,Keys and alarm,Expert,Can do\r\n" +
      "Close the till,task,medium,,,E,Learning\r\n" +
      "Supplier passwords,know-how,can wait,no,,x,-\r\n";
    const result = parseRegisterCsv(csv, tpl);

    expect(result.issues).toEqual([]);
    expect(result.knowledge).toEqual([
      {
        id: "k-open-the-shop",
        name: "Open the shop",
        kind: "duty",
        criticality: "critical",
        category: "process",
        description: "Keys and alarm",
        linkedProcessIds: [],
        documented: true,
      },
      {
        id: "k-close-the-till",
        name: "Close the till",
        kind: "task",
        criticality: "important",
        category: "process",
        description: "",
        linkedProcessIds: [],
        documented: false,
      },
      {
        id: "k-supplier-passwords",
        name: "Supplier passwords",
        kind: "knowledge",
        criticality: "nice-to-have",
        category: "tribal",
        description: "",
        linkedProcessIds: [],
        documented: false,
      },
    ]);
    expect(result.relations).toEqual([
      { personId: "p-ana", knowledgeId: "k-open-the-shop", level: "expert" },
      { personId: "p-ben", knowledgeId: "k-open-the-shop", level: "proficient" },
      { personId: "p-ana", knowledgeId: "k-close-the-till", level: "expert" },
      { personId: "p-ben", knowledgeId: "k-close-the-till", level: "basic" },
      { personId: "p-ana", knowledgeId: "k-supplier-passwords", level: "proficient" },
    ]);
  });

  it("keeps the existing id and process links when an item is matched by name", () => {
    const result = parseRegisterCsv(
      "item,criticality,Ana Ruiz\r\nrun PAYROLL,important,expert\r\n",
      tpl,
    );
    expect(result.knowledge).toEqual([
      { ...knowledge[0], name: "run PAYROLL", criticality: "important" },
    ]);
    expect(result.relations).toEqual([
      { personId: "p-ana", knowledgeId: "k-payroll", level: "expert" },
    ]);
  });

  it("skips columns for people not on the active team and reports them once", () => {
    const csv = "item,Ana Ruiz,Dee Former,Nobody Here\r\nRun payroll,expert,expert,expert\r\n";
    const result = parseRegisterCsv(csv, tpl);
    expect(result.unknownPeople).toEqual(["Dee Former", "Nobody Here"]);
    expect(result.issues).toEqual([
      { row: 0, message: "Not on the active team, skipped: Dee Former, Nobody Here" },
    ]);
    expect(result.relations).toEqual([
      { personId: "p-ana", knowledgeId: "k-payroll", level: "expert" },
    ]);
  });

  it("flags bad levels, unknown kinds and criticalities, blank names and duplicate items", () => {
    const csv =
      "item,kind,criticality,Ana Ruiz,Ben Lee\r\n" +
      "Run payroll,chore,urgent,guru,\r\n" +
      ",duty,critical,expert,\r\n" +
      "RUN PAYROLL,duty,critical,expert,expert\r\n" +
      "Run payroll ,duty,critical,expert,expert\r\n";
    const result = parseRegisterCsv(csv, tpl);
    expect(result.issues).toEqual([
      { row: 1, message: 'Unknown kind "chore"; using duty' },
      { row: 1, message: 'Unknown criticality "urgent"; using critical' },
      {
        row: 1,
        message: '"guru" is not a level for Ana Ruiz; use expert, can do, learning or aware',
      },
      { row: 2, message: "Item name is required" },
      { row: 3, message: 'Duplicate item "RUN PAYROLL" skipped' },
      { row: 4, message: 'Duplicate item "Run payroll" skipped' },
    ]);
    expect(result.knowledge).toHaveLength(1);
    expect(result.knowledge[0]).toMatchObject({
      id: "k-payroll",
      kind: "duty",
      criticality: "critical",
    });
    expect(result.relations).toEqual([]);
  });

  it("gives new items with colliding slugs distinct ids", () => {
    const long = "Reconcile the merchant settlement report against the bank";
    const csv = `item\r\n${long} on Mondays\r\n${long} on Fridays\r\n`;
    const result = parseRegisterCsv(csv, tpl);
    const ids = result.knowledge.map((k) => k.id);
    expect(ids[1]).toBe(`${ids[0]}-2`);
    expect(new Set(ids).size).toBe(2);
  });

  it("requires an item column and honours maxRows", () => {
    expect(parseRegisterCsv("Ana Ruiz,Ben Lee\r\nexpert,expert\r\n", tpl).issues).toEqual([
      { row: 0, message: "Missing an item column (duty, task or know-how name)" },
    ]);
    const result = parseRegisterCsv("item\r\nA\r\nB\r\nC\r\n", tpl, { maxRows: 2 });
    expect(result.knowledge.map((k) => k.name)).toEqual(["A", "B"]);
    expect(result.issues).toEqual([{ row: 3, message: "Import truncated to 2 rows" }]);
  });
});

describe("procedure location column", () => {
  it("reads aliases, keeps the existing location when the column is absent, and omits blanks", () => {
    const withAlias = parseRegisterCsv(
      "item,where documented,Ana Ruiz\r\nRun payroll,Binder on the front desk,expert\r\n",
      tpl,
    );
    expect(withAlias.knowledge[0].procedureLocation).toBe("Binder on the front desk");

    const withoutColumn = parseRegisterCsv(
      "item,Ana Ruiz\r\nVendor quirks,expert\r\nNew thing,expert\r\n",
      tpl,
    );
    expect(withoutColumn.knowledge[0].procedureLocation).toBe("Drive > Vendors > Quirks.docx");
    expect("procedureLocation" in withoutColumn.knowledge[1]).toBe(false);

    const blank = parseRegisterCsv(
      "item,procedure location,Ana Ruiz\r\nVendor quirks,,expert\r\n",
      tpl,
    );
    expect("procedureLocation" in blank.knowledge[0]).toBe(false);
  });
});

describe("registerTemplateCsv", () => {
  it("is importable and lists the active team as columns", () => {
    const csv = registerTemplateCsv(tpl);
    expect(csv.split("\r\n")[0]).toBe(
      "item,kind,criticality,documented,procedure location,description,Ana Ruiz,Ben Lee",
    );
    const result = parseRegisterCsv(csv, tpl);
    expect(result.issues).toEqual([]);
    expect(result.knowledge).toHaveLength(1);
    expect(result.knowledge[0].procedureLocation).toBe("Shared drive > Office > Payroll checklist");
    expect(result.relations).toEqual([
      { personId: "p-ana", knowledgeId: "k-run-month-end-payroll", level: "expert" },
      { personId: "p-ben", knowledgeId: "k-run-month-end-payroll", level: "basic" },
    ]);
  });
});
