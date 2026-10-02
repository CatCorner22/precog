import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "../industry";
import { getIndustryTemplate } from "./index";
import { SCENARIO_FIGURES } from "./shared-controls";

describe("scenario figures", () => {
  it("are written only in SCENARIO_FIGURES, never as literals in a template", () => {
    const dir = join(process.cwd(), "src/lib/precog/templates");
    const templates = readdirSync(dir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "shared-controls.ts",
    );
    for (const file of templates) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text, file).not.toMatch(/baseFinancialImpact:\s*\{/);
      expect(text, file).not.toMatch(/baseTimelineDays:\s*\{/);
    }
  });

  it("give every sample scenario one of the illustrative sets", () => {
    const sets = Object.values(SCENARIO_FIGURES).map((s) => JSON.stringify(s));
    for (const { id } of INDUSTRIES) {
      for (const s of getIndustryTemplate(id).scenarios) {
        const figures = JSON.stringify({
          baseTimelineDays: s.baseTimelineDays,
          baseFinancialImpact: s.baseFinancialImpact,
        });
        expect(sets, `${id}/${s.id}`).toContain(figures);
      }
    }
  });
});
