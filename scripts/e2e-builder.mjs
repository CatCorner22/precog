#!/usr/bin/env node
/**
 * Headless end-to-end smoke for the map builder. Drives the real UI against a
 * running dev/preview server and exits non-zero when any step fails:
 *
 *   1. load the dental demo and open "How work flows" (?tab=map)
 *   2. enter Build mode, add a process, rename it
 *   3. keyboard: F frames the selection, ArrowLeft moves to the previous stage
 *   4. Spreadsheet: import a CSV that updates one process and adds another
 *   5. Ctrl+Z undoes the import
 *   6. the map completeness history records the edited map's score
 *
 * Usage: node scripts/e2e-builder.mjs [baseUrl]   (default http://127.0.0.1:8080/)
 * Env:   E2E_TIMEOUT_MS (default 45000), E2E_SCREENSHOT (PNG path on failure)
 *
 * Needs the Playwright chromium binary: npx playwright install --with-deps chromium
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  e2eOptions,
  openSetup,
  profileStorageKey,
  restingViewport,
  viewportTransform,
  withPage,
} from "./lib/e2e.mjs";
import { eventually, stepLogger } from "./lib/steps.mjs";

const options = e2eOptions();
const { baseUrl, timeout } = options;
const step = stepLogger();
let page;

await withPage(options, async (p, errors) => {
  page = p;
  step("load app");
  await openSetup(page, baseUrl, timeout);

  step("load the dental sample");
  await page.getByRole("radio", { name: /^Dental/ }).click();
  await page.getByRole("button", { name: "Explore the sample instead" }).click();
  // How work flows sits under Advanced; its address opens it directly, and
  // the sample chosen above stays the open business.
  await page.locator("nav[data-tab-count]").waitFor();
  await page.waitForLoadState("networkidle");
  await page.goto(`${baseUrl}/?tab=map`, { waitUntil: "networkidle", timeout });
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
  const [added] = await selectedNodeIds();
  assert(added, "the new process should stay selected after renaming");

  step("keyboard: F frames the selection");
  await page.getByRole("button", { name: /^Focus$/ }).waitFor();
  const before = await viewportTransform(page);
  await page.keyboard.press("f");
  const framed = await restingViewport(page, {
    from: before,
    message: "F should change the viewport",
  });

  step("keyboard: ArrowLeft moves to the previous stage");
  await page.keyboard.press("ArrowLeft");
  const selected = await eventually(async () => {
    const ids = await selectedNodeIds();
    return ids.length === 1 && ids[0] !== added && ids;
  }, "ArrowLeft should select a neighbour of the new process");
  await restingViewport(page, {
    from: framed,
    message: "ArrowLeft should re-frame on the newly selected process",
  });

  step("spreadsheet: import a CSV");
  // The spreadsheet panel sits in the builder's File menu.
  await page.getByRole("button", { name: /^File$/ }).click();
  await page.getByRole("menuitemcheckbox", { name: /^Spreadsheet/ }).click();
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

  step("the map completeness history records the edited map's score");
  // The map screen records the score once the map is assessed (the Dashboard
  // used to); the switcher's "map N% complete" and the report's change since
  // the first point read this history. The profile is stored a moment after
  // each edit, so wait for it.
  await eventually(
    async () => {
      const history = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.mapCompletenessHistory,
        profileStorageKey(),
      );
      return (
        Array.isArray(history) &&
        history.length >= 1 &&
        history.every((point) => Number.isInteger(point.score) && typeof point.at === "string")
      );
    },
    "the edited map's completeness score was not recorded",
    10_000,
  );

  assert(errors.page.length === 0, `page errors: ${errors.page.join(" | ")}`);
  assert(errors.console.length === 0, `console errors: ${errors.console.join(" | ")}`);

  console.log(
    JSON.stringify({ ok: true, baseUrl, steps: step.names.length, neighbour: selected[0] }),
  );
});
if (process.exitCode) console.error(`last step: "${step.names.at(-1)}"`);

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function selectedNodeIds() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".react-flow__node.selected")].map((n) =>
      n.getAttribute("data-id"),
    ),
  );
}
