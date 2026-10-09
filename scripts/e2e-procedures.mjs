#!/usr/bin/env node
/**
 * Headless end-to-end check of Procedures via Analyze, as a guest on the dental
 * sample: add a place, start a procedure from a register item nothing is
 * written for, write two steps (one that looks like a password, which must
 * warn), draft two more from notes, save, verify, follow it step by step and
 * record the run, download and print it, see the register item count as
 * written, and start a recommended procedure whose steps stay marked as
 * suggestions until someone edits them.
 *
 * Usage: node scripts/e2e-procedures.mjs [baseUrl]   (default http://127.0.0.1:8080/)
 * Env:   E2E_TIMEOUT_MS (default 45000), E2E_SCREENSHOT (PNG path on failure),
 *        E2E_SHOTS (a directory to save desktop and phone screenshots in)
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { e2eOptions, exploreSample, openSetup, profileStorageKey, withPage } from "./lib/e2e.mjs";
import { eventually, stepLogger } from "./lib/steps.mjs";
import { checkedUrl } from "./browser-guard.mjs";

const options = e2eOptions();
const base = checkedUrl(options.baseUrl);
const step = stepLogger();
const shots = process.env.E2E_SHOTS || "";

const passed = await withPage(options, writeVerifyAndLink);
if (passed) console.log(JSON.stringify({ ok: true, steps: step.names.length }));

async function writeVerifyAndLink(page, errors) {
  step("open the dental sample and choose Procedures from Analyze");
  await openSetup(page, base, options.timeout);
  await exploreSample(page, "Dental");
  // Procedures sits under Analyze, not in the tab strip.
  await page.locator("[data-more-tabs]").click();
  await page.locator('[role="menu"] [role="menuitem"][data-tab-id="procedures"]').click();
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

  step("the best-practice check says what a stand-in would still need");
  const check = page.getByRole("region", { name: "Best-practice check" });
  await check.getByText("Say when to do it.").waitFor();
  await check
    .getByText(
      "Name at least one stand-in: a person who can follow it when the usual person is out.",
    )
    .waitFor();
  await page.getByLabel("When to do it").fill("Every evening at close");
  await eventually(
    async () => (await check.getByText("Say when to do it.").count()) === 0,
    "the check did not follow the edit",
  );

  step("draft two more steps from notes; signed out, they come from the notes themselves");
  await page.getByRole("button", { name: "Draft steps from notes" }).click();
  await page
    .getByLabel(/Describe the task the way you would tell someone/)
    .fill("Need: the day-sheet binder\nThen sign the sheet; file it in the binder.");
  await page.getByRole("button", { name: "Draft the steps" }).click();
  await page.getByText("From your notes", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add these steps" }).click();
  assert.equal(
    await page.getByLabel("Step 4", { exact: true }).inputValue(),
    "File it in the binder.",
  );
  if (shots) await page.screenshot({ path: `${shots}/procedures-editor.png`, fullPage: true });

  step("save, then verify");
  await page.getByRole("button", { name: "Save procedure" }).click();
  await page.getByRole("heading", { name: itemName }).waitFor();
  const saved = await waitProfile(
    page,
    (p) => p.procedures?.length === 1 && p.procedures[0].steps.length === 4,
    "the procedure was not saved",
  );
  assert.equal(saved.procedures[0].module, "Reports › Day sheet");
  assert.deepEqual(saved.procedures[0].prerequisites, ["The day-sheet binder"]);
  assert.ok(!saved.procedures[0].steps.some((s) => s.aiDrafted), "local drafts are not AI drafts");
  assert.equal(saved.procedures[0].verifiedAt, undefined);
  // No purpose yet: a writing error, so the verify button waits until it is written.
  const verify = page.getByRole("button", { name: /verified these steps today/ });
  assert.ok(await verify.isDisabled(), "verify must wait for the writing errors to be fixed");
  await page.getByText(/^Fix the writing error in the best-practice check/).waitFor();
  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByLabel("Why it matters and what done looks like")
    .fill(
      "Shows the day's takings match the deposit. Done when the closer has signed the day sheet.",
    );
  await page.getByRole("button", { name: "Save procedure" }).click();
  await page.getByRole("heading", { name: itemName }).waitFor();
  await verify.click();
  await waitProfile(page, (p) => Boolean(p.procedures[0].verifiedAt), "verification not saved");
  await page.getByText("Verified", { exact: true }).first().waitFor();

  step("follow it step by step; finishing opens the form to record the run");
  await page.getByRole("button", { name: "Follow it step by step" }).click();
  const follow = page.getByRole("dialog", { name: itemName });
  await follow.getByText("Step 1 of 4").waitFor();
  await follow.getByText("Open Reports and choose Day sheet.").waitFor();
  for (let i = 0; i < 3; i++) await follow.getByRole("button", { name: "Done, next step" }).click();
  await follow.getByRole("button", { name: "Done, finish" }).click();
  await follow.getByText("You have done every step.").waitFor();
  if (shots) await page.screenshot({ path: `${shots}/procedures-follow.png` });
  await follow.getByRole("button", { name: "Record this run" }).click();
  await follow.waitFor({ state: "detached" });

  step("record an unaided run by someone else; accepting the offer logs a decision");
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

  step("download it as Markdown, and print it without the app around it");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const file = await download;
  assert.match(file.suggestedFilename(), /\.md$/);
  const markdown = await readFile(await file.path(), "utf8");
  assert.ok(markdown.startsWith(`# ${itemName}`), "the Markdown starts with the title");
  assert.ok(markdown.includes("4. File it in the binder."), "the Markdown lists the steps");
  await page.evaluate(() => {
    window.__printed = 0;
    window.print = () => {
      window.__printed += 1;
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await eventually(
    async () => (await page.evaluate(() => window.__printed)) === 1,
    "the print dialog did not open",
  );
  await eventually(
    async () => (await page.locator(".procedure-print").count()) === 0,
    "the print view was not removed after printing",
  );

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
    (p) => !p.procedures[0].verifiedAt && p.procedures[0].version === 3,
    "an edit did not clear the verification",
  );
  await page.getByText("Changed since verified", { exact: true }).first().waitFor();

  step("start a recommended procedure; its steps stay suggestions until edited");
  const recommended = "Reconcile the bank account";
  // The dental sample fits more than the card shows at first.
  await page.getByRole("button", { name: /^Show all \d+ recommendations$/ }).click();
  await page
    .getByRole("button", { name: `Start from the recommended procedure: ${recommended}` })
    .click();
  await page.getByRole("heading", { name: "New procedure" }).waitFor();
  await page
    .getByText(/^Suggested common practice\. Change it/)
    .first()
    .waitFor();
  await page
    .getByRole("region", { name: "Best-practice check" })
    .getByText("Fit the 8 suggested steps to your own screens, names and people.")
    .waitFor();
  await page.getByRole("button", { name: "Save procedure" }).click();
  await page.getByRole("heading", { name: recommended }).waitFor();
  await page
    .getByText("Suggested common practice; not yet fitted to this business.")
    .first()
    .waitFor();
  const fromLibrary = (p) => p.procedures.find((x) => x.libraryId === "lib-bank-rec");
  await waitProfile(
    page,
    (p) => fromLibrary(p)?.steps.every((s) => s.suggested),
    "the recommended procedure was not saved with its steps marked as suggestions",
  );
  assert.equal(
    await page
      .getByRole("button", { name: /^Start from the recommended procedure: Reconcile the bank/ })
      .count(),
    0,
    "a started recommendation must leave the list",
  );
  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByLabel("Step 1", { exact: true })
    .fill("Download last month's statement from Chase.");
  await page.getByRole("button", { name: "Save procedure" }).click();
  await waitProfile(
    page,
    (p) => !fromLibrary(p).steps[0].suggested && fromLibrary(p).steps[1].suggested,
    "editing a suggested step did not make it the business's own",
  );

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
