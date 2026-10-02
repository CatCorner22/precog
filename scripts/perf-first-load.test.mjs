/** The sizing and budget decisions in ./perf-first-load.mjs, without a browser. */
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  PAGE_BUDGETS_KB,
  formatTable,
  gzipBytes,
  overBudget,
  sumScripts,
} from "./perf-first-load.mjs";

const files = {
  "/assets/entry.js": Buffer.from("const a = 1;\n".repeat(4000)),
  "/assets/route.js": Buffer.from("export const b = 2;\n".repeat(500)),
};
const read = (pathname) => files[pathname] ?? null;

describe("sumScripts", () => {
  it("sums the gzipped size of each script once, as check-bundle-size counts it", () => {
    const expected =
      gzipSync(files["/assets/entry.js"]).length + gzipSync(files["/assets/route.js"]).length;
    const sized = sumScripts(["/assets/route.js", "/assets/entry.js", "/assets/entry.js"], read);
    expect(sized.scripts).toBe(2);
    expect(sized.gzipKB).toBe(Math.round((expected / 1024) * 10) / 10);
    expect(sized.missing).toEqual([]);
    expect(gzipBytes(files["/assets/entry.js"])).toBe(gzipSync(files["/assets/entry.js"]).length);
  });

  it("lists scripts the build output does not hold instead of counting them", () => {
    const sized = sumScripts(["/assets/entry.js", "/@vite/client.js"], read);
    expect(sized.scripts).toBe(1);
    expect(sized.missing).toEqual(["/@vite/client.js"]);
  });
});

describe("overBudget", () => {
  const budgets = { "/": 447, "/login": 354 };

  it("names each page above its budget, and passes a page exactly at it", () => {
    const results = [
      { path: "/", scripts: 21, gzipKB: 447 },
      { path: "/login", scripts: 12, gzipKB: 354.1 },
      { path: "/other", scripts: 3, gzipKB: 9999 },
    ];
    expect(overBudget(results, budgets)).toEqual([
      { path: "/login", gzipKB: 354.1, budgetKB: 354 },
    ]);
  });

  it("budgets every page the script measures in whole KB", () => {
    expect(Object.keys(PAGE_BUDGETS_KB)).toEqual(["/", "/login", "/privacy", "/terms", "/share/x"]);
    for (const budget of Object.values(PAGE_BUDGETS_KB)) {
      expect(Number.isInteger(budget) && budget > 0).toBe(true);
    }
  });
});

describe("formatTable", () => {
  it("prints one row per page with the budget and the room left", () => {
    const table = formatTable([{ path: "/login", scripts: 12, gzipKB: 321.2 }], { "/login": 354 });
    const [header, row] = table.split("\n");
    expect(header).toMatch(/page\s+scripts\s+gzip KB\s+budget\s+room/);
    expect(row).toMatch(/^\/login\s+12\s+321\.2\s+354\s+32\.8$/);
  });
});
