#!/usr/bin/env node
/**
 * Headless end-to-end checks for insurance confirmation, map history, and
 * exception-first setup in the real UI, as a guest. Three browser sessions;
 * a failed session skips the ones after it.
 *
 * Usage: node scripts/e2e-enhancements.mjs [baseUrl]   (default http://127.0.0.1:8080/)
 * Env:   E2E_TIMEOUT_MS (default 45000), E2E_SCREENSHOT (PNG path on failure)
 */
import assert from "node:assert/strict";
import {
  e2eOptions,
  exploreSample,
  openSetup,
  profileStorageKey,
  restingViewport,
  waitForCount,
  withPage,
} from "./lib/e2e.mjs";
import { eventually, stepLogger } from "./lib/steps.mjs";
import { checkedUrl } from "./browser-guard.mjs";

const options = e2eOptions();
const base = checkedUrl(options.baseUrl);
const step = stepLogger();

const passed =
  (await withPage(options, insuranceAndMapHistory)) &&
  (await withPage(options, exceptionFirstSetup)) &&
  (await withPage(options, refusedDraftStorage));
if (passed)
  console.log(JSON.stringify({ ok: true, steps: step.names.length, authenticated: false }));

async function insuranceAndMapHistory(page, errors) {
  step("demo: open insurance settings");
  await openSetup(page, base, options.timeout);
  await exploreSample(page, "Dental");
  await page.goto(`${base}/?tab=precog`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Settings and insurance", exact: true }).click();
  // Only a theft or fraud scenario can be modeled as covered by a crime
  // policy; the sample opens on a staffing scenario, so pick the cash one.
  await page
    .getByLabel("Scenario for these figures", { exact: true })
    .getByRole("button", { name: "One person posts payments and reconciles the bank" })
    .click();
  const status = page.getByRole("combobox", { name: "Insurance information status", exact: true });
  await status.selectOption("reported");
  const assumption = page.getByRole("checkbox", {
    name: /Model this scenario as potentially covered/,
  });
  assert.equal(await assumption.isDisabled(), true);

  step("insurance: explicitly confirm values matching the demo");
  for (const field of [
    "base annual premium",
    "deductible",
    "policy limit",
    "unreimbursed share above deductible",
  ]) {
    await page.getByRole("checkbox", { name: new RegExp(`^Confirm ${field}:`) }).check();
  }
  assert.equal(await assumption.isEnabled(), true);
  await assumption.check();
  const confirmed = await waitProfile(
    page,
    (p) => p.riskVariables.insurance?.modeledScenarioIds.length === 1,
    "confirmed scenario assumption was not saved",
  );
  assert.equal(confirmed.riskVariables.insurance.confirmedFields.length, 4);

  step("insurance: exact amount edits invalidate confirmation and recovery assumptions");
  const premium = page.getByRole("spinbutton", { name: "Base annual premium", exact: true });
  await premium.fill("1234.56");
  await premium.blur();
  const edited = await waitProfile(
    page,
    (p) => p.riskVariables.basePremiumAnnual === 1234.56,
    "exact premium did not persist",
  );
  assert.ok(!edited.riskVariables.insurance.confirmedFields.includes("basePremiumAnnual"));
  assert.deepEqual(edited.riskVariables.insurance.modeledScenarioIds, []);
  assert.equal(await assumption.isDisabled(), true);
  await premium.fill("");
  await premium.blur();
  await page.getByText("Enter an amount from 0 to 1,000,000.", { exact: true }).waitFor();
  assert.equal((await readProfile(page)).riskVariables.basePremiumAnnual, 1234.56);

  step("insurance: reload retains explicit status and the exact premium");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Settings and insurance", exact: true }).click();
  await page
    .getByLabel("Scenario for these figures", { exact: true })
    .getByRole("button", { name: "One person posts payments and reconciles the bank" })
    .click();
  assert.equal(await status.inputValue(), "reported");
  assert.equal(await premium.inputValue(), "1234.56");
  await status.selectOption("unknown");
  await page
    .getByText(
      "Nobody has assessed insurance, so Precog models no recovery. This does not mean you are uninsured.",
      { exact: true },
    )
    .first()
    .waitFor();

  step("map: moving a process is undoable and redoable");
  await page.goto(`${base}/?tab=map`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Build", exact: true }).first().click();
  await page.getByRole("button", { name: /Add process/ }).click();
  const field = page.locator('[data-builder-field="name"]');
  await field.fill("Upgrade history check");
  await field.blur();
  await page.keyboard.press("f");
  await restingViewport(page);
  const node = page.locator(".react-flow__node.selected").first();
  const id = await node.getAttribute("data-id");
  assert.ok(id);
  const before = (await readProfile(page)).mapLayout?.[id];
  await node.scrollIntoViewIfNeeded();
  await node.hover();
  const box = await node.boundingBox();
  assert.ok(box);
  const dragPoint = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const hitId = await page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest(".react-flow__node")?.getAttribute("data-id"),
    dragPoint,
  );
  assert.equal(hitId, id, "the drag must start on the visible process, not another panel");
  await page.mouse.move(dragPoint.x, dragPoint.y);
  await page.mouse.down();
  await page.mouse.move(dragPoint.x + 70, dragPoint.y + 60, { steps: 10 });
  await page.mouse.up();
  const moved = await waitProfile(
    page,
    (p) => JSON.stringify(p.mapLayout?.[id]) !== JSON.stringify(before),
    "node movement did not save a new position",
  );
  const position = moved.mapLayout[id];
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await waitProfile(
    page,
    (p) => JSON.stringify(p.mapLayout?.[id]) === JSON.stringify(before),
    "undo did not restore the earlier layout",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await waitProfile(
    page,
    (p) => JSON.stringify(p.mapLayout?.[id]) === JSON.stringify(position),
    "redo did not restore the moved position",
  );
  noErrors(errors);
}

async function exceptionFirstSetup(page, errors) {
  step("setup: exception-first review retains every imported person");
  await openSetup(page, base, options.timeout);
  await page.getByRole("button", { name: "Set up my own business", exact: true }).click();
  await answerSetupQuestions(page);
  await page.getByRole("button", { name: "Skip these questions", exact: true }).click();
  await page.getByLabel("Business name", { exact: true }).fill("Review Workflow Example");
  await page
    .getByText("Paste your team from Workday, SAP, Oracle, or your payroll export", { exact: true })
    .click();
  await page
    .getByLabel("Pasted roster", { exact: true })
    .fill("Maya Roe, Bookkeeper\nCal Diaz, Front Desk\nRiver Vale, Quantum Wrangler");
  await page.getByRole("button", { name: "Fill the table", exact: true }).click();
  const names = page.getByRole("textbox", { name: /^Person \d+ name$/ });
  await waitForCount(names, 4, "roster rows after filling the table");
  const filter = page.getByRole("checkbox", {
    name: "Show only rows to review",
    exact: true,
  });
  await filter.check();
  await waitForCount(names, 2, "rows needing review");
  const owner = page.getByRole("textbox", { name: "Person 1 name", exact: true });
  await owner.pressSequentially("Jordan Owner");
  assert.equal(await owner.inputValue(), "Jordan Owner");
  assert.equal(await owner.evaluate((element) => document.activeElement === element), true);
  await page.getByRole("combobox", { name: "River Vale job title", exact: true }).fill("Cashier");
  await page.getByRole("combobox", { name: "River Vale job title", exact: true }).blur();
  await filter.uncheck();
  await waitForCount(names, 4, "roster rows with the filter off");

  step("setup: reload recovery and completion preserve the whole roster");
  await page.reload({ waitUntil: "networkidle" });
  // The draft is restored in an effect after hydration, so wait for it.
  await eventually(
    async () =>
      (await page.getByLabel("Business name", { exact: true }).inputValue()) ===
      "Review Workflow Example",
    "the business name was not restored after reload",
  );
  await waitForCount(names, 4, "roster rows restored after reload");
  await page.getByRole("button", { name: "Show me my gaps", exact: true }).click();
  const profile = await waitProfile(
    page,
    (p) => p.onboardingComplete && p.customPeople?.length === 4,
    "setup completion lost people hidden during exception review",
  );
  assert.deepEqual(profile.customPeople.map((p) => p.name).sort(), [
    "Cal Diaz",
    "Jordan Owner",
    "Maya Roe",
    "River Vale",
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("nav[data-tab-count]").waitFor();
  noErrors(errors);
}

async function refusedDraftStorage(page, errors) {
  step("setup: refused draft storage is reported rather than claimed saved");
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.endsWith(":precog.onboarding-draft.v1"))
        throw new DOMException("Test quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await openSetup(page, base, options.timeout);
  await page.getByRole("button", { name: "Set up my own business", exact: true }).click();
  await answerSetupQuestions(page);
  await page.getByRole("button", { name: "Skip these questions", exact: true }).click();
  await page.getByLabel("Business name", { exact: true }).fill("Unsaved draft example");
  await page.getByText(/This browser will not keep your progress/).waitFor();
  noErrors(errors);
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

function noErrors(errors) {
  assert.deepEqual(errors.page, [], "uncaught browser errors");
  assert.deepEqual(errors.console, [], "unexpected browser console errors");
}

/**
 * Answers the four setup questions (role, workforce, locations, how to start)
 * that come before the money questions, choosing a small team entered person
 * by person so the team step opens as it did before the questions.
 */
async function answerSetupQuestions(page) {
  for (const answer of [
    "I lead or own this business",
    "2–6 people",
    "1 location",
    "Enter people now",
  ]) {
    // A label holds the answer and, for how to start, a line of detail after it.
    await page.getByRole("radio", { name: new RegExp(`^${answer}`) }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
}
