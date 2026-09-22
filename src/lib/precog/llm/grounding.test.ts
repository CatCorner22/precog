import { describe, expect, it } from "vitest";
import { checkGrounding, groundingNote } from "./grounding";
import type { ToolResult } from "./types";

function tool(data: unknown, summary = ""): ToolResult {
  return { tool: "get_practice_snapshot", ok: true, summary, data };
}

describe("checkGrounding", () => {
  it("accepts money and percent figures that appear in tool data", () => {
    const tools = [tool({ medianLoss: 104000, tipShare: 0.43, total: 3.4, unit: "billion" })];
    const report = checkGrounding(
      "The median loss is $104,000; 43% of cases surface through tips; $3.4B total.",
      tools,
    );
    expect(report.checked).toHaveLength(3);
    expect(report.unsupported).toEqual([]);
  });

  it("flags figures the tools never returned", () => {
    const tools = [tool({ medianLoss: 104000 })];
    const report = checkGrounding(
      "Median loss $104,000, but fraud costs the typical firm $250,000 and 62 percent of owners agree.",
      tools,
    );
    expect(report.unsupported).toEqual(["$250,000", "62 percent"]);
  });

  it("understands k / million shorthand and tolerates rounding", () => {
    const tools = [tool({ loss: 1415000, total: 2402 })];
    const report = checkGrounding("They lost about $1.4 million (roughly $1,415k).", tools);
    expect(report.unsupported).toEqual([]);
  });

  it("does not let a near miss pass at the precision the text used", () => {
    const tools = [tool({ medianLoss: 104500 })];
    expect(checkGrounding("The median loss is $104,000.", tools).unsupported).toEqual(["$104,000"]);
  });

  it("reads numbers from the summary as well as the data", () => {
    const tools = [tool(null, "Cash handling: 2 controls, 35% segregated")];
    expect(checkGrounding("35% segregated", tools).unsupported).toEqual([]);
  });

  it("produces no note when everything is grounded and a footnote otherwise", () => {
    expect(groundingNote({ unsupported: [], checked: ["$1"] })).toBeNull();
    const note = groundingNote({ unsupported: ["$9,999"], checked: ["$9,999"] });
    expect(note).toContain("Check before quoting");
    expect(note).toContain("$9,999");
  });
});
