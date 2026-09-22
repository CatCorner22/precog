import type { MatrixLayerId } from "../types";

export const LAYER_META: Record<
  MatrixLayerId,
  { name: string; matrixName: string; blurb: string }
> = {
  surface: {
    name: "Surface Reality",
    matrixName: "The Construct",
    blurb: "Customers, schedule pressure, cash in drawer, daily operations.",
  },
  process: {
    name: "Process Layer",
    matrixName: "Workflow Code",
    blurb: "Documented workflows, value streams, SOPs, Lean maps.",
  },
  knowledge: {
    name: "Knowledge / Tribal",
    matrixName: "Hidden Matrix",
    blurb: "Who actually knows how things work — SPOFs and succession risk.",
  },
  control: {
    name: "Control & Governance",
    matrixName: "Ruleset",
    blurb: "Internal controls, segregation of duties, residual risk.",
  },
  source: {
    name: "Source / Architecture",
    matrixName: "Infrastructure",
    blurb: "POS, ERP, vendors, data flows.",
  },
  continuity: {
    name: "Continuity / Exit",
    matrixName: "Red Pill",
    blurb: "What breaks when key people or systems disappear.",
  },
};
