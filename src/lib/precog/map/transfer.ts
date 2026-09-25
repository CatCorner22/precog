import { csvCell, parseRows } from "../import/csv";
import { MAP_RECORD_LIMIT, validateHierarchy, type MapRecord } from "./hierarchy";

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const text = (v: unknown, max = 2000): string => typeof v === "string" ? v.slice(0, max) : "";
function strings(v: unknown): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((item) => typeof item !== "string") || v.length > 500) throw new Error("Invalid map references.");
  return [...new Set(v)];
}
function parseRecords(values: unknown[]): MapRecord[] {
  if (values.length > MAP_RECORD_LIMIT) throw new Error(`Maximum ${MAP_RECORD_LIMIT} records; import was not applied.`);
  const records = values.map((raw): MapRecord => {
    if (!isObject(raw) || typeof raw.id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(raw.id) || !text(raw.name, 100).trim()) throw new Error("Every record needs a stable ID and a name.");
    const record: MapRecord = {
      id: raw.id, name: text(raw.name, 100), layer: "process", description: text(raw.description),
      dependencies: strings(raw.dependencies), controlIds: strings(raw.controlIds), ownerPersonIds: strings(raw.ownerPersonIds),
      inputs: strings(raw.inputs), outputs: strings(raw.outputs), systems: strings(raw.systems),
      stage: Number.isInteger(raw.stage) && Number(raw.stage) >= 0 && Number(raw.stage) <= 50 ? Number(raw.stage) : 0,
      documented: raw.documented === true, procedureLocation: text(raw.procedureLocation, 1000),
      nodeLevel: raw.nodeLevel === "domain" || raw.nodeLevel === "step" ? raw.nodeLevel : "process",
      parentProcessId: text(raw.parentProcessId, 100) || undefined,
      mapOrder: typeof raw.mapOrder === "number" && Number.isFinite(raw.mapOrder) ? raw.mapOrder : undefined,
      assessmentStatus: raw.assessmentStatus === "confirmed" ? "confirmed" : "suggested",
      flowLinks: [], risks: [], evidence: [], ideas: [], wastes: [],
    };
    if (["continuous", "daily", "weekly", "monthly", "quarterly", "annual", "ad-hoc"].includes(String(raw.cadence))) record.cadence = raw.cadence as MapRecord["cadence"];
    for (const key of ["flowLinks", "risks", "evidence", "ideas", "wastes"] as const) {
      if (raw[key] !== undefined && (!Array.isArray(raw[key]) || raw[key].length > 200)) throw new Error(`Invalid ${key} collection.`);
    }
    for (const link of (raw.flowLinks ?? []) as unknown[]) {
      if (!isObject(link) || !["sequence", "handoff", "rework"].includes(String(link.kind)) || typeof link.targetId !== "string") throw new Error("Invalid flow relationship.");
      record.flowLinks!.push({ targetId: link.targetId, kind: link.kind as "sequence" | "handoff" | "rework" });
    }
    for (const item of (raw.risks ?? []) as unknown[]) {
      if (!isObject(item) || !text(item.id) || !text(item.title) || ![1,2,3,4,5].includes(Number(item.severity)) || ![1,2,3,4,5].includes(Number(item.likelihood)) || !["control","fraud","continuity","quality","compliance","revenue","safety"].includes(String(item.kind))) throw new Error("Invalid risk record.");
      record.risks!.push({ id: text(item.id,100), title: text(item.title,200), kind: item.kind as NonNullable<MapRecord["risks"]>[number]["kind"], severity: Number(item.severity) as 1|2|3|4|5, likelihood: Number(item.likelihood) as 1|2|3|4|5, note: text(item.note), linkedControlId: text(item.linkedControlId,100)||undefined, linkedScenarioId: text(item.linkedScenarioId,100)||undefined, linkedKnowledgeId: text(item.linkedKnowledgeId,100)||undefined });
    }
    for (const item of (raw.evidence ?? []) as unknown[]) {
      if (!isObject(item) || !text(item.id) || !["daily","weekly","monthly","quarterly","annual"].includes(String(item.frequency))) throw new Error("Invalid evidence record.");
      record.evidence!.push({ id:text(item.id,100),label:text(item.label,200),frequency:item.frequency as NonNullable<MapRecord["evidence"]>[number]["frequency"],reviewerPersonId:text(item.reviewerPersonId,100)||undefined,lastDoneAt:text(item.lastDoneAt,40)||undefined,note:text(item.note) });
    }
    for (const item of (raw.ideas ?? []) as unknown[]) {
      if (!isObject(item) || !text(item.id) || !["control","lean","tech","training","policy"].includes(String(item.category)) || !["low","medium","high"].includes(String(item.effort)) || !["low","medium","high"].includes(String(item.impact)) || !["backlog","exploring","planned","done"].includes(String(item.status))) throw new Error("Invalid improvement record.");
      record.ideas!.push({ id:text(item.id,100),title:text(item.title,200),note:text(item.note),category:item.category,effort:item.effort,impact:item.impact,status:item.status } as NonNullable<MapRecord["ideas"]>[number]);
    }
    for (const item of (raw.wastes ?? []) as unknown[]) {
      if (!isObject(item) || !text(item.id) || !["muda_waiting","muda_rework","muda_motion","muda_overprocessing","mura","muri"].includes(String(item.kind))) throw new Error("Invalid waste record.");
      record.wastes!.push({ id:text(item.id,100),label:text(item.label,200),note:text(item.note),kind:item.kind } as NonNullable<MapRecord["wastes"]>[number]);
    }
    return record;
  });
  const errors = validateHierarchy(records);
  if (errors.length) throw new Error(errors[0]);
  return records;
}
const sizeCheck = (source: string) => { if (new TextEncoder().encode(source).length > 2_000_000) throw new Error("Map exceeds 2 MB; nothing imported."); };
export const mapToJson = (records: readonly MapRecord[]) => JSON.stringify({ version:2, processes:records },null,2);
export function mapFromJson(source: string): MapRecord[] {
  sizeCheck(source);
  const value:unknown=JSON.parse(source);
  if (!isObject(value) || value.version!==2 || !Array.isArray(value.processes)) throw new Error("Expected a version 2 Precog map export.");
  return parseRecords(value.processes);
}
export function mapToCsv(records: readonly MapRecord[]): string {
  return ["version,id,name,description,record_json",...records.map((p)=>["2",p.id,p.name,p.description,JSON.stringify(p)].map(csvCell).join(","))].join("\n");
}
export function mapFromCsv(source: string): MapRecord[] {
  sizeCheck(source);
  const rows=parseRows(source), header=rows.shift()??[];
  if (!["version","id","name","description","record_json"].every((key)=>header.includes(key))) throw new Error("Use a version 2 map CSV export. Existing process CSV imports remain in the canvas builder.");
  return parseRecords(rows.filter((r)=>r.some((cell)=>cell.trim())).map((row)=>{
    const cell=(key:string)=>row[header.indexOf(key)]??"";
    if(cell("version")!=="2") throw new Error("Unknown map CSV version.");
    const rich:unknown=JSON.parse(cell("record_json"));
    if(!isObject(rich)) throw new Error("Invalid map record JSON.");
    const recovered=(key:string)=>typeof rich[key]==="string" && /^[\s]*[=+\-@\t\r]/.test(rich[key] as string) && cell(key)==="'"+rich[key] ? rich[key] : cell(key);
    return {...rich,id:cell("id"),name:recovered("name"),description:recovered("description")};
  }));
}
