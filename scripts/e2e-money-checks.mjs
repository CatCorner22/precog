#!/usr/bin/env node
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { e2eOptions, exploreSample, openSetup, profileStorageKey, withPage } from "./lib/e2e.mjs";
import { eventually, stepLogger } from "./lib/steps.mjs";
import { checkedUrl } from "./browser-guard.mjs";

const options = e2eOptions();
const base = checkedUrl(options.baseUrl);
const step = stepLogger();
const note = "Compared the statement and recorded the follow-up review.";
const passed = await withPage(options, async (page, errors) => {
  step("guest: open Money checks inside Monthly review");
  await openSetup(page, base, options.timeout);
  await exploreSample(page, "Dental");
  await page.goto(`${base}/?tab=money-checks`, { waitUntil: "networkidle" });
  const screen = page.getByLabel("Money checks workspace", { exact: true });
  await screen.waitFor();
  step("upload the committed bank and books fixture CSVs");
  for (const [label, fixture] of [
    ["Bank file", "bank"],
    ["Books file", "books"],
  ]) {
    await screen
      .getByLabel(label, { exact: true })
      .setInputFiles(
        fileURLToPath(new URL(`../src/lib/precog/money-checks/${fixture}.csv`, import.meta.url)),
      );
  }
  await eventually(
    async () => (await screen.getByText("3 rows imported", { exact: true }).count()) === 2,
    "both fixtures were not imported",
  );
  step("run checks, reject a short explanation, then save a valid explanation");
  await screen.getByRole("button", { name: "Run checks", exact: true }).click();
  const finding = screen.getByRole("article").first();
  await finding.waitFor();
  await finding.getByText("Explain", { exact: true }).click();
  await finding.getByLabel("Explanation note", { exact: true }).fill("short");
  await finding.getByRole("button", { name: "Save explanation", exact: true }).click();
  await finding.getByRole("alert").filter({ hasText: "at least 10 characters" }).waitFor();
  await finding.getByLabel("Explanation note", { exact: true }).fill(note);
  await finding.getByRole("button", { name: "Save explanation", exact: true }).click();
  await finding.getByText(`Explanation (`, { exact: false }).waitFor();
  await eventually(
    async () =>
      page.evaluate(
        ({ key, note }) =>
          JSON.parse(localStorage.getItem(key) || "{}").moneyChecks?.ledger.some(
            (r) => r.explained?.note === note,
          ),
        { key: profileStorageKey(), note },
      ),
    "explanation did not reach guest storage",
  );
  step("reload: explanation persists, uploaded rows do not");
  await page.reload({ waitUntil: "networkidle" });
  await screen.locator("article > p").filter({ hasText: note }).waitFor();
  assert.equal(await screen.getByText("3 rows imported", { exact: true }).count(), 0);
  const stored = await page.evaluate((key) => localStorage.getItem(key), profileStorageKey());
  assert(!stored.includes("Synthetic receipt"));
  assert(!stored.includes('"amountCents"'));
  assert.deepEqual(errors, { page: [], console: [] });
  if (process.env.E2E_MONEY_SCREENSHOT) {
    await screen.scrollIntoViewIfNeeded();
    await page.locator("#money-checks").screenshot({ path: process.env.E2E_MONEY_SCREENSHOT });
  }
});
if (passed)
  console.log(JSON.stringify({ ok: true, steps: step.names.length, authenticated: false }));
