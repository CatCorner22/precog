/**
 * Spreadsheet round-trip for the process map.
 *
 * Owners keep their processes in a sheet long before they open a map builder,
 * so the CSV speaks in names, not ids: owners, dependencies, and controls are
 * matched by name (case-insensitive) against the current team, the other rows
 * in the file, and the control library. Rows whose name matches an existing
 * process keep that process's id, so risks, ideas, evidence, saved layout,
 * and share links survive a re-import.
 *
 * Import is a merge by default: rows add or update, processes missing from the
 * file are kept and reported. `mode: "replace"` removes them instead.
 */
import type { IndustryTemplate } from "../templates";
import type { ControlItem, Person, ProcessNode } from "../types";
import { normalizeSystems, parseCadence, CADENCE_LABEL } from "../process-record";
import {
  csvCell,
  DOCUMENTED_WORDS,
  normalizeHeader,
  parseRows,
  readYesNo,
  rowCapMessage,
  sniffDelimiter,
  type ImportIssue,
} from "./csv";
import { nameKey, slug, stripInvisibleControls, verb } from "../text";

export interface ProcessImportResult {
  /** The full map after the import is applied. */
  processes: ProcessNode[];
  issues: ImportIssue[];
  added: ProcessNode[];
  updated: { before: ProcessNode; after: ProcessNode }[];
  unchanged: ProcessNode[];
  /** Existing processes with no row in the file. Kept in `processes` unless mode is "replace". */
  removed: ProcessNode[];
}

const PROCESS_CSV_HEADER = [
  "process",
  "stage",
  "description",
  "owners",
  "depends on",
  "controls",
  "cadence",
  "systems",
  "documented",
  "procedure location",
  "inputs",
  "outputs",
] as const;

type Column = (typeof PROCESS_CSV_HEADER)[number];

const HEADER_ALIASES: Record<Column, readonly string[]> = {
  process: ["process", "name", "process name", "step", "task", "activity"],
  stage: ["stage", "order", "sequence", "column", "phase"],
  description: ["description", "what happens", "notes", "summary"],
  owners: ["owners", "owner", "who", "responsible", "assigned to", "person"],
  "depends on": ["depends on", "depends_on", "dependencies", "after", "upstream", "prerequisites"],
  controls: ["controls", "control", "safeguards", "checks"],
  cadence: ["cadence", "frequency", "how often", "runs"],
  systems: ["systems", "system", "software", "tools", "where"],
  documented: ["documented", "written", "written down", "sop exists", "has procedure"],
  "procedure location": [
    "procedure location",
    "procedure_location",
    "location",
    "sop",
    "sop location",
    "procedure",
    "where documented",
    "link",
  ],
  inputs: ["inputs", "input", "needs", "receives"],
  outputs: ["outputs", "output", "produces", "delivers"],
};

const MAX_ROWS = 200;

export function parseProcessCsv(
  text: string,
  tpl: Pick<IndustryTemplate, "processes" | "people" | "controls">,
  opts: { mode?: "merge" | "replace"; maxRows?: number } = {},
): ProcessImportResult {
  const rows = parseRows(stripInvisibleControls(text), sniffDelimiter(text));
  const issues: ImportIssue[] = [];
  const empty = (msg: string): ProcessImportResult => ({
    processes: tpl.processes,
    issues: [{ row: 0, message: msg }],
    added: [],
    updated: [],
    unchanged: [],
    removed: [],
  });
  const header = rows[0] ?? [];
  const columns = new Map<Column, number>();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [Column, readonly string[]][]) {
    const index = header.findIndex((cell) =>
      aliases.some((alias) => normalizeHeader(alias) === normalizeHeader(cell)),
    );
    if (index >= 0) columns.set(key, index);
  }
  const nameColumn = columns.get("process");
  if (nameColumn === undefined) {
    return empty('Missing a "process" column. Download the template to see the expected headers.');
  }
  const cell = (cells: string[], col: Column): string => {
    const i = columns.get(col);
    return i === undefined ? "" : (cells[i] ?? "").trim();
  };

  const maxRows = Math.max(0, Math.floor(opts.maxRows ?? MAX_ROWS));
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim()));
  if (dataRows.length > maxRows) {
    issues.push({ row: maxRows + 1, message: rowCapMessage(maxRows, dataRows.length - maxRows) });
  }
  const rowsToImport = dataRows.slice(0, maxRows);

  const existingByName = new Map<string, ProcessNode>();
  for (const p of tpl.processes) {
    const key = nameKey(p.name);
    if (!existingByName.has(key)) existingByName.set(key, p);
  }
  // A name can belong to more than one person (the team importer keeps
  // namesakes apart), so each name keeps everyone who has it.
  const peopleByName = new Map<string, Person[]>();
  for (const person of tpl.people) {
    const key = nameKey(person.name);
    peopleByName.set(key, [...(peopleByName.get(key) ?? []), person]);
  }
  /**
   * The person an owner name means: the only one with that name; else the
   * process's current owner among the namesakes; else the only active one.
   * Null when the name still fits more than one person.
   */
  const ownerNamed = (
    token: string,
    existing: ProcessNode | undefined,
    taken: readonly string[],
  ): Person | null | undefined => {
    const all = peopleByName.get(nameKey(token)) ?? [];
    const named = all.filter((p) => !taken.includes(p.id));
    if (all.length <= 1 || named.length === 0) return all[0];
    if (named.length === 1) return named[0];
    const current = named.find((p) => existing?.ownerPersonIds?.includes(p.id));
    if (current) return current;
    const active = named.filter((p) => p.active);
    return active.length === 1 ? active[0] : null;
  };
  const controlsByKey = new Map<string, ControlItem>();
  for (const c of tpl.controls) {
    controlsByKey.set(nameKey(c.id), c);
    if (!controlsByKey.has(nameKey(c.name))) controlsByKey.set(nameKey(c.name), c);
  }

  // First pass: names and ids, so dependencies can point at rows further down.
  // A row updates the process its name matches and no other: a new row
  // whose id would repeat an existing process's id gets a suffix instead.
  const existingIds = new Set(tpl.processes.map((p) => p.id));
  const usedIds = new Set<string>();
  const rowExisting: (ProcessNode | undefined)[] = [];
  const rowIds: (string | null)[] = rowsToImport.map((cells, index) => {
    const rowNumber = index + 1;
    const name = cell(cells, "process").slice(0, 60);
    if (!name) {
      issues.push({ row: rowNumber, message: "Each row must have a process name" });
      return null;
    }
    const match = existingByName.get(nameKey(name));
    const existing = match && !usedIds.has(match.id) ? match : undefined;
    if (match && !existing) {
      issues.push({
        row: rowNumber,
        message: `"${name}" appears more than once; Precog imported the later rows as separate processes`,
      });
    }
    rowExisting[index] = existing;
    if (existing) {
      usedIds.add(existing.id);
      return existing.id;
    }
    const baseId = `proc-${slug(name) || "process"}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id) || existingIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    return id;
  });
  const idByName = new Map<string, string>();
  rowsToImport.forEach((cells, index) => {
    const id = rowIds[index];
    if (id) idByName.set(nameKey(cell(cells, "process")), id);
  });
  const resolveProcess = (token: string): string | undefined => {
    const key = nameKey(token);
    return (
      idByName.get(key) ?? existingByName.get(key)?.id ?? (usedIds.has(token) ? token : undefined)
    );
  };

  const imported: ProcessNode[] = [];
  const added: ProcessNode[] = [];
  const updated: { before: ProcessNode; after: ProcessNode }[] = [];
  const unchanged: ProcessNode[] = [];

  rowsToImport.forEach((cells, index) => {
    const id = rowIds[index];
    if (!id) return;
    const rowNumber = index + 1;
    const name = cell(cells, "process").slice(0, 60);
    const existing = rowExisting[index];

    let stage = existing?.stage;
    const stageValue = cell(cells, "stage");
    if (stageValue) {
      const parsed = Number.parseInt(stageValue, 10);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 50) stage = parsed;
      else
        issues.push({
          row: rowNumber,
          message: `Stage "${stageValue}" is not a whole number from 0 to 50`,
        });
    }

    const owners: string[] = [];
    const unknownOwners: string[] = [];
    for (const token of splitList(cell(cells, "owners"))) {
      const person = ownerNamed(token, existing, owners);
      if (person) {
        if (!owners.includes(person.id)) owners.push(person.id);
      } else if (person === null) {
        issues.push({
          row: rowNumber,
          message: `More than one person on the team is named ${token}, so the importer did not make any of them an owner of "${name}". Choose the owner on the map.`,
        });
      } else unknownOwners.push(token);
    }
    if (unknownOwners.length) {
      issues.push({
        row: rowNumber,
        message: `${verb(unknownOwners.length, "This owner is", "These owners are")} not on the team, so the importer skipped ${verb(unknownOwners.length, "the name", "them")}: ${unknownOwners.join(", ")}. Add them under Team first or spell each name as the team lists it.`,
      });
    }

    const dependencies: string[] = [];
    const unknownDeps: string[] = [];
    for (const token of splitList(cell(cells, "depends on"))) {
      const dep = resolveProcess(token);
      if (dep && dep !== id) {
        if (!dependencies.includes(dep)) dependencies.push(dep);
      } else if (dep === id) {
        issues.push({ row: rowNumber, message: `"${name}" cannot depend on itself` });
      } else unknownDeps.push(token);
    }
    if (unknownDeps.length) {
      issues.push({
        row: rowNumber,
        message: `The importer cannot find ${verb(unknownDeps.length, "this process", "these processes")}, so it skipped ${verb(unknownDeps.length, "it", "them")}: ${unknownDeps.join(", ")}. Use the exact process name from another row or the current map.`,
      });
    }

    const controlIds: string[] = [];
    const unknownControls: string[] = [];
    for (const token of splitList(cell(cells, "controls"))) {
      const control = controlsByKey.get(nameKey(token));
      if (control) {
        if (!controlIds.includes(control.id)) controlIds.push(control.id);
      } else unknownControls.push(token);
    }
    if (unknownControls.length) {
      issues.push({
        row: rowNumber,
        message: `${verb(unknownControls.length, "This control is", "These controls are")} not in the library, so the importer skipped ${verb(unknownControls.length, "it", "them")}: ${unknownControls.join(", ")}`,
      });
    }

    const cadenceValue = cell(cells, "cadence");
    let cadence = existing?.cadence;
    if (cadenceValue) {
      const parsed = parseCadence(cadenceValue);
      if (parsed) cadence = parsed;
      else
        issues.push({
          row: rowNumber,
          message: `The importer does not know the cadence "${cadenceValue}". Use one of: ${Object.keys(CADENCE_LABEL).join(", ")}`,
        });
    }

    const systemsValue = cell(cells, "systems");
    const systems = columns.has("systems")
      ? normalizeSystems(splitList(systemsValue))
      : (existing?.systems ?? []);

    const procedureLocation = columns.has("procedure location")
      ? cell(cells, "procedure location").slice(0, 200)
      : (existing?.procedureLocation ?? "");
    const documentedValue = cell(cells, "documented");
    let documented = columns.has("documented")
      ? readYesNo(documentedValue, DOCUMENTED_WORDS)
      : existing?.documented;
    if (columns.has("documented") && documentedValue && documented === undefined) {
      issues.push({
        row: rowNumber,
        message: `Documented "${documentedValue}" must be yes or no`,
      });
      documented = existing?.documented;
    }
    if (documented === undefined && procedureLocation) documented = true;

    const description = columns.has("description")
      ? cell(cells, "description").slice(0, 240)
      : (existing?.description ?? "");
    const inputs = columns.has("inputs")
      ? splitList(cell(cells, "inputs"))
      : (existing?.inputs ?? []);
    const outputs = columns.has("outputs")
      ? splitList(cell(cells, "outputs"))
      : (existing?.outputs ?? []);

    const next: ProcessNode = {
      ...(existing ?? { layer: "process" as const }),
      id,
      name,
      layer: existing?.layer ?? "process",
      description,
      dependencies: columns.has("depends on") ? dependencies : (existing?.dependencies ?? []),
      controlIds: columns.has("controls") ? controlIds : (existing?.controlIds ?? []),
      stage,
      ownerPersonIds: columns.has("owners") ? owners : (existing?.ownerPersonIds ?? []),
      inputs: inputs.length ? inputs : undefined,
      outputs: outputs.length ? outputs : undefined,
      cadence,
      systems: systems.length ? systems : undefined,
      documented,
      procedureLocation: procedureLocation || undefined,
    };
    // Drop undefined keys so unchanged rows compare equal to their originals.
    const bag = next as unknown as Record<string, unknown>;
    for (const key of Object.keys(bag)) if (bag[key] === undefined) delete bag[key];
    imported.push(next);
    if (!existing) added.push(next);
    else if (sameRecord(existing, next)) unchanged.push(next);
    else updated.push({ before: existing, after: next });
  });

  const removed = tpl.processes.filter((p) => !usedIds.has(p.id));
  const importedIds = new Set(imported.map((p) => p.id));
  const kept = opts.mode === "replace" ? [] : removed;
  // Keep the map's existing order for processes that survive; new rows go on the end.
  const processes: ProcessNode[] = [];
  for (const p of tpl.processes) {
    if (importedIds.has(p.id)) processes.push(imported.find((x) => x.id === p.id)!);
    else if (kept.includes(p)) processes.push(p);
  }
  for (const p of imported) if (!processes.includes(p)) processes.push(p);

  if (opts.mode === "replace") {
    const removedIds = new Set(removed.map((p) => p.id));
    for (const p of processes) {
      const dropped = p.dependencies.filter((d) => removedIds.has(d));
      if (dropped.length) {
        p.dependencies = p.dependencies.filter((d) => !removedIds.has(d));
      }
    }
  }

  return { processes, issues, added, updated, unchanged, removed };
}

/** One row per process, names instead of ids so the sheet reads like a checklist. */
export function processesToCsv(
  processes: readonly ProcessNode[],
  people: readonly Person[],
  controls: readonly ControlItem[],
): string {
  const personName = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const processName = (id: string) => processes.find((p) => p.id === id)?.name ?? id;
  const controlName = (id: string) => controls.find((c) => c.id === id)?.name ?? id;
  const rows = [
    PROCESS_CSV_HEADER.join(","),
    ...processes.map((p) =>
      [
        p.name,
        p.stage === undefined ? "" : String(p.stage),
        p.description,
        joinList((p.ownerPersonIds ?? []).map(personName)),
        joinList(p.dependencies.map(processName)),
        joinList(p.controlIds.map(controlName)),
        p.cadence ?? "",
        joinList(p.systems ?? []),
        p.documented === undefined ? "" : p.documented ? "yes" : "no",
        p.procedureLocation ?? "",
        joinList(p.inputs ?? []),
        joinList(p.outputs ?? []),
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return rows.join("\r\n") + "\r\n";
}

/**
 * Header plus three example rows for a blank sheet. Given the current team
 * and control library, the examples name a real person and control, so the
 * unchanged template imports without an issue; without them those cells stay
 * blank.
 */
export function processTemplateCsv(tpl?: Pick<IndustryTemplate, "people" | "controls">): string {
  const owner = tpl?.people.find((p) => p.active)?.name ?? "";
  const control = tpl?.controls[0]?.name ?? "";
  const rows = [
    [
      "Collect payments",
      "1",
      "Take card, cash and check payments at the front desk.",
      owner,
      "",
      "",
      "daily",
      "Practice management system",
      "no",
      "",
      "",
      "Day-end report",
    ],
    [
      "Daily deposit",
      "2",
      "Count the drawer and take cash and checks to the bank.",
      owner,
      "Collect payments",
      control,
      "daily",
      "Bank portal; Practice management system",
      "yes",
      "Shared drive > Front desk > Deposit checklist.pdf",
      "Day-end report",
      "Deposit slip",
    ],
    [
      "Vendor setup",
      "3",
      "Add a new supplier and their bank details.",
      "",
      "",
      "",
      "ad-hoc",
      "Accounting software",
      "no",
      "",
      "W-9",
      "Approved vendor",
    ],
  ];
  return (
    [PROCESS_CSV_HEADER.join(","), ...rows.map((cells) => cells.map(csvCell).join(","))].join(
      "\r\n",
    ) + "\r\n"
  );
}

const LIST_SEPARATOR = /[;|]/;

/**
 * Joins list items with "; ". An item that holds a separator, or starts with
 * a double quote, goes in double quotes with inner quotes doubled, so a name
 * like "Payroll; weekly" reads back as one item.
 */
function joinList(items: readonly string[]): string {
  return items
    .map((item) =>
      LIST_SEPARATOR.test(item) || item.trimStart().startsWith('"')
        ? `"${item.replaceAll('"', '""')}"`
        : item,
    )
    .join("; ");
}

/**
 * Splits a list cell on ";" or "|". An item wrapped in double quotes keeps
 * its separators (`joinList` writes them so). Anything else, such as a quote
 * in the middle of an item, reads as plain text, so files exported before
 * quoting existed still import as they did.
 */
function splitList(value: string): string[] {
  const items: string[] = [];
  let start = 0;
  while (start <= value.length) {
    let at = start;
    while (at < value.length && /\s/.test(value[at])) at++;
    if (value[at] === '"') {
      let text = "";
      let end = at + 1;
      let closed = false;
      while (end < value.length) {
        if (value[end] === '"') {
          if (value[end + 1] === '"') {
            text += '"';
            end += 2;
            continue;
          }
          closed = true;
          end++;
          break;
        }
        text += value[end++];
      }
      while (closed && end < value.length && /\s/.test(value[end])) end++;
      if (closed && (end === value.length || LIST_SEPARATOR.test(value[end]))) {
        items.push(text.trim());
        start = end + 1;
        continue;
      }
    }
    let end = at;
    while (end < value.length && !LIST_SEPARATOR.test(value[end])) end++;
    items.push(value.slice(at, end).trim());
    start = end + 1;
  }
  return items.filter(Boolean);
}

/**
 * A record in a form where an empty list, an empty text and a missing field
 * are the same, and key order does not count: a process made in the builder
 * has "inputs: []" where the same row read back from its CSV has none.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonical(record[key])] as const)
        .filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)),
    );
  }
  return value;
}

function sameRecord(a: ProcessNode, b: ProcessNode): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
