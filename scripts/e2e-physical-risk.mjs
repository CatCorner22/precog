#!/usr/bin/env node
import assert from "node:assert/strict";
import { e2eOptions, exploreSample, openSetup, profileStorageKey, withPage } from "./lib/e2e.mjs";
import { eventually, stepLogger } from "./lib/steps.mjs";
import { checkedUrl } from "./browser-guard.mjs";

const options = e2eOptions();
const base = checkedUrl(options.baseUrl);
const step = stepLogger();
const inputs = [
  ["Building year", "1900"],
  ["Structural condition (0 worst, 1 best)", "0.2"],
  ["Occupants", "500"],
  ["Floor area (square metres)", "1000"],
  ["Seismic zone (0 to 4)", "4"],
  ["Pipe age (years)", "80"],
  ["Last inspection date", "2020-01-01"],
];
const passed = await withPage(options, async (page, errors) => {
  step("guest: open the optional building and pipe card under What could happen");
  await openSetup(page, base, options.timeout);
  await exploreSample(page, "Dental");
  await page.goto(`${base}/?tab=precog`, { waitUntil: "networkidle" });
  await page.getByText("Building and pipe estimate (optional)", { exact: true }).click();
  const card = page.getByLabel("Building and pipe estimate", { exact: true });
  await card.getByText(/Pipe estimate skipped:/).waitFor();
  await card.getByText(/Building estimate skipped:/).waitFor();
  assert.equal(await card.getByLabel(/flood zone/i).count(), 0);
  step("enter known source inputs and see Review bands, never percentages");
  for (const [label, value] of inputs) await card.getByLabel(label, { exact: true }).fill(value);
  await card.getByLabel("Pipe material", { exact: true }).selectOption("cast_iron");
  await card.getByLabel("Fire suppression present", { exact: true }).selectOption("false");
  await card.getByRole("button", { name: "Save building and pipe inputs", exact: true }).click();
  for (const name of ["Pipe", "Building"])
    await card
      .getByLabel(`${name} estimate result`, { exact: true })
      .getByText("Review", { exact: true })
      .waitFor();
  assert(!(await card.innerText()).includes("%"));
  await eventually(
    async () =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "{}").physicalRisk?.pipeAge === 80,
        profileStorageKey(),
      ),
    "physical inputs did not reach guest storage",
  );
  step("reload: every input and both bands persist in guest mode");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Building and pipe estimate (optional)", { exact: true }).click();
  for (const [label, value] of inputs)
    assert.equal(await card.getByLabel(label, { exact: true }).inputValue(), value);
  assert.equal(await card.getByLabel("Pipe material", { exact: true }).inputValue(), "cast_iron");
  assert.equal(
    await card.getByLabel("Fire suppression present", { exact: true }).inputValue(),
    "false",
  );
  for (const name of ["Pipe", "Building"])
    await card
      .getByLabel(`${name} estimate result`, { exact: true })
      .getByText("Review", { exact: true })
      .waitFor();
  await card
    .getByText("Rough estimate, not from a published source. It feeds no score.", { exact: true })
    .waitFor();
  await card
    .getByText("Weather and flood risk come later, from published sources.", { exact: true })
    .waitFor();
  assert.deepEqual(errors, { page: [], console: [] });
  if (process.env.E2E_PHYSICAL_SCREENSHOT)
    await card.screenshot({ path: process.env.E2E_PHYSICAL_SCREENSHOT });
});
if (passed)
  console.log(JSON.stringify({ ok: true, steps: step.names.length, authenticated: false }));
