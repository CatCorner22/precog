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
import type { IndustryTemplate } from "../templates/types";
import type { ControlItem, Person, ProcessNode } from "../types";
import { normalizeSystems, parseCadence, CADENCE_LABEL } from "../process-record";
import { csvCell, parseRows } from "./csv";
import { slug } from "../text";

interface ProcessImportIssue {
  /** 1-based data row (0 = whole file). */
  row: number;
  message: string;
}

export interface ProcessImportResult {
  /** The full map after the import is applied. */
  processes: ProcessNode[];
  issues: ProcessImportIssue[];
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

const LIST_SEPARATOR = /[;|]/;
const MAX_ROWS = 200;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** A CSV cell guarded against formula injection (see `csvCell`). */
const escapeCsv = csvCell;

function splitList(value: string): string[] {
  return value
    .split(LIST_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBool(value: string): boolean | undefined {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  if (["y", "yes", "true", "1", "documented", "written"].includes(v)) return true;
  if (["n", "no", "false", "0", "none", "not documented", "undocumented"].includes(v)) return false;
  return undefined;
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

export function parseProcessCsv(
  text: string,
  tpl: Pick<IndustryTemplate, "processes" | "people" | "controls">,
  opts: { mode?: "merge" | "replace"; maxRows?: number } = {},
): ProcessImportResult {
  const rows = parseRows(text);
  const issues: ProcessImportIssue[] = [];
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
      aliases.some((alias) => normalize(alias) === normalize(cell)),
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
    issues.push({ row: maxRows + 1, message: `Import truncated to ${maxRows} rows` });
  }
  const rowsToImport = dataRows.slice(0, maxRows);

  const existingByName = new Map<string, ProcessNode>();
  for (const p of tpl.processes) {
    const key = normalize(p.name);
    if (!existingByName.has(key)) existingByName.set(key, p);
  }
  const peopleByName = new Map<string, Person>();
  for (const person of tpl.people) {
    const key = normalize(person.name);
    if (!peopleByName.has(key)) peopleByName.set(key, person);
  }
  const controlsByKey = new Map<string, ControlItem>();
  for (const c of tpl.controls) {
    controlsByKey.set(normalize(c.id), c);
    if (!controlsByKey.has(normalize(c.name))) controlsByKey.set(normalize(c.name), c);
  }

  // First pass: names and ids, so dependencies can point at rows further down.
  const usedIds = new Set<string>();
  const rowIds: (string | null)[] = rowsToImport.map((cells, index) => {
    const rowNumber = index + 1;
    const name = cell(cells, "process").slice(0, 60);
    if (!name) {
      issues.push({ row: rowNumber, message: "Process name is required" });
      return null;
    }
    const existing = existingByName.get(normalize(name));
    const baseId = existing && !usedIds.has(existing.id) ? existing.id : `proc-${slug(name)}`;
    if (existing && usedIds.has(existing.id)) {
      issues.push({
        row: rowNumber,
        message: `"${name}" appears more than once; later rows were imported as separate processes`,
      });
    }
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    return id;
  });
  const idByName = new Map<string, string>();
  rowsToImport.forEach((cells, index) => {
    const id = rowIds[index];
    if (id) idByName.set(normalize(cell(cells, "process")), id);
  });
  const resolveProcess = (token: string): string | undefined => {
    const key = normalize(token);
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
    const existing = tpl.processes.find((p) => p.id === id);

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
      const person = peopleByName.get(normalize(token));
      if (person) {
        if (!owners.includes(person.id)) owners.push(person.id);
      } else unknownOwners.push(token);
    }
    if (unknownOwners.length) {
      issues.push({
        row: rowNumber,
        message: `Owner(s) not on the team, skipped: ${unknownOwners.join(", ")}. Add them under Team first or spell the name exactly.`,
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
        message: `Dependency not found, skipped: ${unknownDeps.join(", ")}. Use the exact process name from another row or the current map.`,
      });
    }

    const controlIds: string[] = [];
    const unknownControls: string[] = [];
    for (const token of splitList(cell(cells, "controls"))) {
      const control = controlsByKey.get(normalize(token));
      if (control) {
        if (!controlIds.includes(control.id)) controlIds.push(control.id);
      } else unknownControls.push(token);
    }
    if (unknownControls.length) {
      issues.push({
        row: rowNumber,
        message: `Control(s) not in the library, skipped: ${unknownControls.join(", ")}`,
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
          message: `Cadence "${cadenceValue}" not recognised. Use one of: ${Object.keys(CADENCE_LABEL).join(", ")}`,
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
    let documented = columns.has("documented") ? parseBool(documentedValue) : existing?.documented;
    if (columns.has("documented") && documentedValue && documented === undefined) {
      issues.push({
        row: rowNumber,
        message: `Documented "${documentedValue}" should be yes or no`,
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
        (p.ownerPersonIds ?? []).map(personName).join("; "),
        p.dependencies.map(processName).join("; "),
        p.controlIds.map(controlName).join("; "),
        p.cadence ?? "",
        (p.systems ?? []).join("; "),
        p.documented === undefined ? "" : p.documented ? "yes" : "no",
        p.procedureLocation ?? "",
        (p.inputs ?? []).join("; "),
        (p.outputs ?? []).join("; "),
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];
  return rows.join("\r\n") + "\r\n";
}

/** Header plus two illustrative rows for a blank sheet. */
export function processTemplateCsv(): string {
  return (
    [
      PROCESS_CSV_HEADER.join(","),
      [
        "Daily deposit",
        "2",
        "Count the drawer and take cash and checks to the bank.",
        "Jordan Lee",
        "Collect payments",
        "Independent deposit reconciliation",
        "daily",
        "Bank portal; Practice management system",
        "yes",
        "Shared drive > Front desk > Deposit checklist.pdf",
        "Day-end report",
        "Deposit slip",
      ]
        .map(escapeCsv)
        .join(","),
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
      ]
        .map(escapeCsv)
        .join(","),
    ].join("\r\n") + "\r\n"
  );
}
