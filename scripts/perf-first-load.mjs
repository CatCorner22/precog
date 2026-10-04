#!/usr/bin/env node
/**
 * First-load budget per page: opens each page in headless Chromium against an
 * already-running compiled server, records every JavaScript file the page
 * downloads, and sums their gzipped sizes from the build output on disk
 * (.vercel/output/static, gzipped with zlib as scripts/check-bundle-size.mjs
 * does). Prints a table and one JSON line, and exits 1 naming each page over
 * its budget. Run after `npm run build`, with the compiled server serving:
 *
 *   node scripts/serve-built-test.mjs &   # CI serves it this way
 *   npm run perf:first-load -- http://localhost:8080
 *
 * check-bundle-size.mjs guards the total of every chunk; this guards what one
 * visitor downloads on each page, so weight added to sign-in or a public page
 * fails here even when the total stays under its budget.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

/**
 * Gzipped kilobytes each page may download on first load. Each budget is the
 * measured size plus 10 percent, rounded up to the next KB. Set on 2026-10-02
 * from this script against the compiled build once public pages stopped
 * loading the business engine: / 381.9 KB, /login 150.9 KB, /privacy
 * 140.0 KB, /terms 138.1 KB, /share/x 145.5 KB (main before: / 406.0 KB,
 * /login 321.2 KB, /privacy 321.7 KB). Lower a
 * budget when a change makes a page lighter; raise one only on purpose, with
 * the reason and date here.
 */
export const PAGE_BUDGETS_KB = {
  "/": 421,
  "/login": 167,
  "/privacy": 154,
  "/terms": 152,
  // An invalid share token renders the public share page's error state.
  "/share/x": 161,
  // Batch 2, set on 2026-10-04 from the compiled build: the pricing page
  // (156.4 KB), the landing page a fresh visitor is sent to from / (142.1 KB)
  // and the report share page's error state (146.4 KB).
  "/pricing": 173,
  "/welcome": 157,
  "/share/report/x": 162,
};

/** The gzipped size of one file's bytes, as check-bundle-size.mjs counts it. */
export function gzipBytes(contents) {
  return gzipSync(contents).length;
}

/**
 * The gzipped total of the scripts a page downloaded. `pathnames` are URL
 * paths (for example /assets/index-abc.js); `read` returns a file's bytes or
 * null when the build output has no such file, which lands in `missing`.
 */
export function sumScripts(pathnames, read) {
  let gzip = 0;
  let scripts = 0;
  const missing = [];
  for (const pathname of [...new Set(pathnames)].sort()) {
    const contents = read(pathname);
    if (contents === null) {
      missing.push(pathname);
      continue;
    }
    gzip += gzipBytes(contents);
    scripts += 1;
  }
  return { scripts, gzipKB: Math.round((gzip / 1024) * 10) / 10, missing };
}

/** The pages over budget, in the order measured. A page without a budget never fails. */
export function overBudget(results, budgets = PAGE_BUDGETS_KB) {
  return results
    .filter((r) => budgets[r.path] !== undefined && r.gzipKB > budgets[r.path])
    .map((r) => ({ path: r.path, gzipKB: r.gzipKB, budgetKB: budgets[r.path] }));
}

/** A fixed-width table: page, scripts, gzipped KB, budget and headroom. */
export function formatTable(results, budgets = PAGE_BUDGETS_KB) {
  const lines = [
    `${"page".padEnd(14)}${"scripts".padStart(8)}${"gzip KB".padStart(10)}${"budget".padStart(8)}${"room".padStart(8)}`,
  ];
  for (const r of results) {
    const budget = budgets[r.path];
    lines.push(
      `${r.path.padEnd(14)}${String(r.scripts).padStart(8)}${r.gzipKB.toFixed(1).padStart(10)}` +
        `${(budget === undefined ? "-" : String(budget)).padStart(8)}` +
        `${(budget === undefined ? "-" : (budget - r.gzipKB).toFixed(1)).padStart(8)}`,
    );
  }
  return lines.join("\n");
}

/** The script URLs one page downloads on first load, as same-origin pathnames. */
async function scriptsFor(browser, baseUrl, path) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const origin = new URL(baseUrl).origin;
  const pathnames = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && url.pathname.endsWith(".js")) pathnames.push(url.pathname);
  });
  await page.goto(origin + path, { waitUntil: "networkidle", timeout: 45_000 });
  // Lazy chunks a page asks for right after hydration count as first load.
  await page.waitForTimeout(1500);
  await context.close();
  return pathnames;
}

async function main() {
  const baseUrl = (process.argv[2] || "http://localhost:8080").replace(/\/$/, "");
  const staticRoot = join(process.cwd(), ".vercel", "output", "static");
  if (!existsSync(staticRoot)) {
    console.error(`[perf] ${staticRoot} not found; run npm run build first.`);
    process.exit(1);
  }
  const read = (pathname) => {
    const file = join(staticRoot, decodeURIComponent(pathname));
    if (!file.startsWith(staticRoot) || !existsSync(file)) return null;
    return readFileSync(file);
  };

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const results = [];
  const problems = [];
  try {
    for (const path of Object.keys(PAGE_BUDGETS_KB)) {
      const sized = sumScripts(await scriptsFor(browser, baseUrl, path), read);
      results.push({ path, scripts: sized.scripts, gzipKB: sized.gzipKB });
      if (sized.missing.length) {
        problems.push(
          `${path} downloaded ${sized.missing.length} script(s) the build output does not hold (${sized.missing.join(", ")}); serve the compiled build, not the dev server`,
        );
      }
      if (sized.scripts === 0) problems.push(`${path} downloaded no script from the build output`);
    }
  } finally {
    await browser.close();
  }

  console.log(`[perf] first-load JavaScript per page, gzipped, against ${baseUrl}`);
  console.log(formatTable(results));
  console.log(JSON.stringify({ perf: "first-load", baseUrl, results }));
  for (const over of overBudget(results)) {
    problems.push(
      `${over.path} is over budget: ${over.gzipKB.toFixed(1)} KB gzipped; budget ${over.budgetKB} KB`,
    );
  }
  if (problems.length) {
    for (const problem of problems) console.error(`[perf] ${problem}`);
    process.exit(1);
  }
  console.log("[perf] every page within budget.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.chdir(fileURLToPath(new URL("..", import.meta.url)));
  await main();
}
