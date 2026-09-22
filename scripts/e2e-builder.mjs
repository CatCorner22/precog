#!/usr/bin/env node
/**
 * Headless end-to-end smoke for the map builder. Drives the real UI against a
 * running dev/preview server and exits non-zero when any step fails:
 *
 *   1. load the dental demo and open "How work flows"
 *   2. enter Build mode, add a process, rename it
 *   3. keyboard: F frames the selection, ArrowRight moves to the next stage
 *   4. Spreadsheet: import a CSV that updates one process and adds another
 *   5. Ctrl+Z undoes the import
 *
 * Usage: node scripts/e2e-builder.mjs [baseUrl]   (default http://127.0.0.1:8080/)
 * Env:   E2E_TIMEOUT_MS (default 45000), E2E_SCREENSHOT (PNG path on failure)
 *
 * Needs the Playwright chromium binary: npx playwright install --with-deps chromium
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || process.env.E2E_BASE_URL || "http://127.0.0.1:8080/";
const timeout = Number(process.env.E2E_TIMEOUT_MS || 45000);
const failureShot = process.env.E2E_SCREENSHOT || "";

const pageErrors = [];
const consoleErrors = [];
const steps = [];
let page;

function step(name) {
  steps.push(name);
  console.log(`· ${name}`);
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function viewportTransform() {
  return page.evaluate(
    () => document.querySelector(".react-flow__viewport")?.getAttribute("style") ?? "",
  );
}

async function selectedNodeIds() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".react-flow__node.selected")].map((n) =>
      n.getAttribute("data-id"),
    ),
  );
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(timeout);
  page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  step("load app");
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout });

  step("load dental demo");
  await page.getByRole("button", { name: /Load Dental/ }).click();
  await page
    .getByText(/How work flows/i)
    .first()
    .click();
  await page.locator(".react-flow__node").first().waitFor();

  step("enter Build mode");
  await page
    .getByRole("button", { name: /^Build$/ })
    .first()
    .click();
  await page.getByText("Map builder").first().waitFor();
  const processCount = await page.locator('.react-flow__node[data-id^="proc-"]').count();
  assert(
    processCount >= 5,
    `expected the dental demo's processes on the canvas, saw ${processCount}`,
  );

  step("add and rename a process");
  await page.getByRole("button", { name: /Add process/ }).click();
  const nameField = page.locator('[data-builder-field="name"]');
  await nameField.waitFor();
  assert((await nameField.inputValue()) === "New process", "new process should be selected");
  await nameField.fill("Sterilizer logbook");
  await page.locator('.react-flow__node:has-text("Sterilizer logbook")').first().waitFor();
  await nameField.blur();

  step("keyboard: F frames the selection");
  await page.getByRole("button", { name: /^Focus$/ }).waitFor();
  const before = await viewportTransform();
  await page.keyboard.press("f");
  await page.waitForTimeout(700);
  const framed = await viewportTransform();
  assert(framed !== before, "F should change the viewport");

  step("keyboard: ArrowLeft moves to the previous stage");
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(700);
  const selected = await selectedNodeIds();
  assert(
    selected.length === 1 && selected[0] !== "proc-sterilizer-logbook",
    `ArrowLeft should select a neighbour, got ${JSON.stringify(selected)}`,
  );
  assert(
    (await viewportTransform()) !== framed,
    "ArrowLeft should re-frame on the newly selected process",
  );

  step("spreadsheet: import a CSV");
  await page.getByRole("button", { name: /^Spreadsheet$/ }).click();
  const csvDir = mkdtempSync(join(tmpdir(), "precog-e2e-"));
  const csvPath = join(csvDir, "processes.csv");
  writeFileSync(
    csvPath,
    [
      "process,stage,description,owners,depends on,controls,cadence,systems,documented,procedure location",
      'Payroll,4,Run payroll twice a month,,,,monthly,Gusto,yes,"Shared drive > Ops > Payroll SOP"',
      "Supply ordering,3,Order clinical supplies weekly,,Clinical delivery,,weekly,Henry Schein portal,no,",
      "",
    ].join("\n"),
  );
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles(csvPath);
  await page
    .getByText(/1 new · 1 updated/)
    .first()
    .waitFor();
  await page.getByRole("button", { name: /^Apply/ }).click();
  await page.locator('.react-flow__node:has-text("Supply ordering")').first().waitFor();

  step("spreadsheet: imported record shows up in the form");
  await page
    .getByRole("button", { name: /^Payroll$/ })
    .first()
    .click();
  const cadence = page.getByLabel("How often it runs");
  await cadence.waitFor();
  assert((await cadence.inputValue()) === "monthly", "cadence should come from the CSV");

  step("undo the import with Ctrl+Z");
  await page
    .locator(".react-flow")
    .first()
    .click({ position: { x: 20, y: 400 } });
  await page.keyboard.press("Control+z");
  await page
    .locator('.react-flow__node:has-text("Supply ordering")')
    .first()
    .waitFor({ state: "detached" });

  assert(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);
  const realConsoleErrors = consoleErrors.filter((t) => !/favicon|net::ERR_/.test(t));
  assert(realConsoleErrors.length === 0, `console errors: ${realConsoleErrors.join(" | ")}`);

  console.log(JSON.stringify({ ok: true, baseUrl, steps: steps.length }));
} catch (err) {
  console.error(`FAILED at step "${steps.at(-1)}": ${err?.message || err}`);
  if (pageErrors.length) console.error("page errors:", pageErrors);
  if (failureShot && page) {
    await page.screenshot({ path: failureShot, fullPage: true }).catch(() => {});
    console.error(`screenshot: ${failureShot}`);
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
