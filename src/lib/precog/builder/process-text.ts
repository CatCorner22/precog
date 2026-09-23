import { normalizeSystems } from "../process-record";
import type { ProcessNode } from "../types";

/** The process form's text fields, as the owner typed them. */
export interface ProcessTextFields {
  name: string;
  desc: string;
  inputs: string;
  outputs: string;
  systems: string;
  location: string;
}

/** The changes the form's text fields hold over the saved process; empty when none. */
export function textPatch(fields: ProcessTextFields, process: ProcessNode): Partial<ProcessNode> {
  const parse = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  const patch: Partial<ProcessNode> = {};
  if (fields.name !== process.name) patch.name = fields.name.slice(0, 60);
  if (fields.desc !== process.description) patch.description = fields.desc.slice(0, 240);
  const pi = parse(fields.inputs);
  const po = parse(fields.outputs);
  if (pi.join("|") !== (process.inputs ?? []).join("|")) patch.inputs = pi;
  if (po.join("|") !== (process.outputs ?? []).join("|")) patch.outputs = po;
  const ps = normalizeSystems(parse(fields.systems));
  if (ps.join("|") !== (process.systems ?? []).join("|"))
    patch.systems = ps.length ? ps : undefined;
  const loc = fields.location.trim().slice(0, 200);
  if (loc !== (process.procedureLocation ?? "")) patch.procedureLocation = loc || undefined;
  return patch;
}
