import type { ProcessNode } from "../types";
import { textPatch, type ProcessTextFields } from "./process-text";

/**
 * The process form keeps its own copy of the text fields so typing stays
 * smooth, and commits them after a pause. These helpers keep that copy
 * honest: an undo, redo, spreadsheet import or version restore that changes
 * the process text replaces the copy, so a stale copy is never written back
 * over the change.
 */

/** The form's copy of the text fields, and what it last saw of the process. */
export interface FormText {
  /** The fields as the owner sees them. */
  fields: ProcessTextFields;
  /** The process text the form last saw or wrote, as a comparable key. */
  seenKey: string;
}

/**
 * The longest text the map keeps for each field. The form's inputs stop at
 * the same length, so what the owner sees is what is saved. (textPatch in
 * process-text.ts cuts name, description and location to these lengths.)
 */
export const PROCESS_TEXT_LIMITS = {
  name: 60,
  description: 240,
  location: 200,
  /** A risk, idea or waste title. */
  itemTitle: 80,
  /** A risk, idea or waste note. */
  itemNote: 200,
  evidenceLabel: 100,
} as const;

/** The form's starting copy for a process. */
export function initialFormText(process: ProcessNode): FormText {
  return { fields: processTextFields(process), seenKey: processTextKey(process) };
}

/**
 * The form's copy after the process may have changed outside the form. The
 * same object comes back when nothing changed outside, so a React state
 * holding it only updates when it must.
 */
export function syncFormText(text: FormText, process: ProcessNode): FormText {
  const key = processTextKey(process);
  return key === text.seenKey ? text : { fields: processTextFields(process), seenKey: key };
}

/**
 * What the form writes: the patch its fields hold over the process, and the
 * key the process carries once the patch lands, so the form recognises its
 * own write when the process comes back changed.
 */
export function commitFormText(
  fields: ProcessTextFields,
  process: ProcessNode,
): { patch: Partial<ProcessNode>; seenKey: string } {
  const patch = textPatch(fields, process);
  return { patch, seenKey: processTextKey({ ...process, ...patch }) };
}

/** The text fields as the saved process reads. */
export function processTextFields(process: ProcessNode): ProcessTextFields {
  return {
    name: process.name,
    desc: process.description,
    inputs: (process.inputs ?? []).join(", "),
    outputs: (process.outputs ?? []).join(", "),
    systems: (process.systems ?? []).join(", "),
    location: process.procedureLocation ?? "",
  };
}

function processTextKey(process: ProcessNode): string {
  return JSON.stringify(processTextFields(process));
}
