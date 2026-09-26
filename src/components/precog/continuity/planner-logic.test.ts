import { describe, expect, it } from "vitest";
import { importRegisterPrompt, removeItemPrompt, resetRegisterPrompt } from "./planner-logic";
import type { KnowledgeItem, KnowledgeRelation } from "@/lib/precog/types";

const item = (id: string, name = id): KnowledgeItem => ({
  id,
  name,
  criticality: "critical",
  category: "process",
  description: "",
  linkedProcessIds: [],
});
const mark = (personId: string, knowledgeId: string): KnowledgeRelation => ({
  personId,
  knowledgeId,
  level: "proficient",
});

describe("register confirmations", () => {
  const register = {
    knowledge: [item("k1", "Payroll"), item("k2")],
    relations: [mark("p1", "k1"), mark("p2", "k1"), mark("p1", "k2")],
  };

  it("says what a reset throws away", () => {
    expect(resetRegisterPrompt(register, "Dental")).toBe(
      "Replace your 2 items and 3 marks with the dental starter list? Your items and every mark on them are lost, and this cannot be undone.",
    );
  });

  it("compares the register with the file before an import replaces it", () => {
    const file = { knowledge: [item("k9")], relations: [mark("p1", "k9")] };
    expect(importRegisterPrompt(register, file)).toBe(
      "Replace your 2 items and 3 marks with the 1 item and 1 mark in this file? What the register says now is lost, and this cannot be undone.",
    );
  });

  it("counts only the marks on the item being removed", () => {
    expect(removeItemPrompt(register.knowledge[0], register.relations)).toBe(
      'Remove "Payroll" from the register with the 2 marks on it? This cannot be undone.',
    );
    expect(removeItemPrompt(item("k3", "Alarm"), register.relations)).toBe(
      'Remove "Alarm" from the register? This cannot be undone.',
    );
  });
});
