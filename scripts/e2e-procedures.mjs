#!/usr/bin/env node
/**
 * Headless end-to-end check of the Procedures tab, as a guest on the dental
 * sample: add a place, start a procedure from a register item nothing is
 * written for, write two steps (one that looks like a password, which must
 * warn), save, verify, and see the register item count as written.
 *
 * Usage: node scripts/e2e-procedures.mjs [baseUrl]   (default http://127.0.0.1:8080/)
 * Env:   E2E_TIMEOUT_MS (default 45000), E2E_SCREENSHOT (PNG path on failure),
 *        E2E_SHOTS (a directory to save desktop and phone screenshots in)
 */
import assert from "node:assert/strict";
import { e2eOptions, profileStorageKey, withPage } from "./lib/e2e.mjs";
import { eventually, stepLogger } from "./lib/steps.mjs";
import { checkedUrl } from "./browser-guard.mjs";

const options = e2eOptions();
const base = checkedUrl(options.baseUrl);
const step = stepLogger();
const shots = process.env.E2E_SHOTS || "";

const passed = await withPage(options, writeVerifyAndLink);
if (passed) console.log(JSON.stringify({ ok: true, steps: step.names.length }));

async function writeVerifyAndLink(page, errors) {
  step("open the dental sample on Procedures");
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /^Dental/ }).click();
  await page.getByRole("button", { name: "Explore the sample instead" }).click();
  await page.getByRole("tab", { name: /Procedures/ }).click();
  await page.getByRole("heading", { name: "Procedures", level: 1 }).waitFor();

  step("add a place from the suggestions");
  await page.getByRole("button", { name: "Practice-management system" }).click();
  await waitProfile(page, (p) => p.places?.length === 1, "the place was not saved");

  step("start a procedure from a register item nothing is written for");
  const start = page.getByRole("button", { name: /^Start a procedure for / }).first();
  const label = await start.getAttribute("aria-label");
  const itemName = label.replace("Start a procedure for ", "");
  await start.click();
  await page.getByRole("heading", { name: "New procedure" }).waitFor();
  assert.equal(await page.getByLabel("Title").inputValue(), itemName);

  step("write two steps; a password in a step warns");
  await page.getByLabel("Platform or place").selectOption({ label: "Practice-management system" });
  await page.getByLabel("Module or screen").fill("Reports › Day sheet");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByLabel("Step 1", { exact: true }).fill("Open Reports and choose Day sheet.");
  // A guest's pictures would have nowhere to go: the step asks them to sign in.
  await page.getByText("Sign in to add pictures.").first().waitFor();
  assert.equal(await page.getByRole("button", { name: /^Add a picture/ }).count(), 0);
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByLabel("Step 2", { exact: true }).fill("Sign in with password: Summer2026!");
  await page.getByRole("alert").filter({ hasText: "looks like a password" }).waitFor();
  await page.getByLabel("Step 2", { exact: true }).fill("Print the day sheet and initial it.");
  await eventually(
    async () => (await page.getByRole("alert").filter({ hasText: "password" }).count()) === 0,
    "the password warning did not clear",
  );
  if (shots) await page.screenshot({ path: `${shots}/procedures-editor.png`, fullPage: true });

  step("save, then verify");
  await page.getByRole("button", { name: "Save procedure" }).click();
  await page.getByRole("heading", { name: itemName }).waitFor();
  const saved = await waitProfile(
    page,
    (p) => p.procedures?.length === 1 && p.procedures[0].steps.length === 2,
    "the procedure was not saved",
  );
  assert.equal(saved.procedures[0].module, "Reports › Day sheet");
  assert.equal(saved.procedures[0].verifiedAt, undefined);
  await page.getByRole("button", { name: /checked these steps today/ }).click();
  await waitProfile(page, (p) => Boolean(p.procedures[0].verifiedAt), "verification not saved");
  await page.getByText("Verified", { exact: true }).first().waitFor();

  step("record an unaided run by someone else; accepting the offer logs a decision");
  await page.getByRole("button", { name: /Record a run by someone else/ }).click();
  await page.getByRole("button", { name: "Record the run" }).click();
  await waitProfile(page, (p) => p.procedures[0].proofs?.length === 1, "the run was not saved");
  const raise = page.getByRole("button", { name: "Mark as able to do it alone" });
  if (await raise.count()) {
    await raise.click();
    await waitProfile(
      page,
      (p) => p.decisions.some((d) => d.linkedTab === "procedures"),
      "accepting the level raise did not log a decision",
    );
  }
  await page
    .getByText(/did it alone/)
    .first()
    .waitFor();
  if (shots) await page.screenshot({ path: `${shots}/procedures-desktop.png`, fullPage: true });

  step("the register item now counts as written, and links back");
  const id = saved.procedures[0].knowledgeIds[0];
  await page.goto(`${base}/?tab=knowledge&item=${encodeURIComponent(id)}`, {
    waitUntil: "networkidle",
  });
  await page.getByText("Written in Procedures:").waitFor();
  await page.getByRole("link", { name: itemName }).first().click();
  await page.getByRole("heading", { name: itemName }).waitFor();
  const stored = await readProfile(page);
  const item = (stored.customKnowledge ?? []).find((k) => k.id === id);
  assert.ok(!item || !("linkedProcedures" in item), "derived links must never be stored");

  step("editing the steps clears the verification");
  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByLabel("Step 2", { exact: true })
    .fill("Print the day sheet and initial it twice.");
  await page.getByRole("button", { name: "Save procedure" }).click();
  await waitProfile(
    page,
    (p) => !p.procedures[0].verifiedAt && p.procedures[0].version === 2,
    "an edit did not clear the verification",
  );
  await page.getByText("Changed since verified", { exact: true }).first().waitFor();

  if (shots) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${shots}/procedures-phone.png`, fullPage: true });
  }
  assert.deepEqual(errors.page, [], "uncaught browser errors");
  assert.deepEqual(errors.console, [], "unexpected browser console errors");
}

function readProfile(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), profileStorageKey());
}

async function waitProfile(page, predicate, message) {
  return eventually(async () => {
    const profile = await readProfile(page);
    return profile && predicate(profile) && profile;
  }, message);
}
