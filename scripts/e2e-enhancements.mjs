/** Insurance confirmation, map history, and exception-first setup in the real UI. */
import assert from "node:assert/strict";
import { e2eOptions, withPage } from "./lib/e2e.mjs";
import { checkedUrl } from "./browser-guard.mjs";

const options = e2eOptions();
const base = checkedUrl(options.baseUrl);
const profileKey = "precog.workspace.v2:guest:precog.practiceProfile.v2";
const steps = [];
const step = (name) => {
  steps.push(name);
  console.log(`· ${name}`);
};
const readProfile = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), profileKey);
async function waitProfile(page, predicate, message) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const profile = await readProfile(page);
    if (profile && predicate(profile)) return profile;
    await page.waitForTimeout(100);
  }
  throw new Error(message);
}
function noErrors(errors) {
  assert.deepEqual(errors.page, [], "uncaught browser errors");
  assert.deepEqual(errors.console, [], "unexpected browser console errors");
}

await withPage(options, async (page, errors) => {
  step("demo: open insurance settings");
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Load Dental/ }).click();
  await page.goto(`${base}/?tab=precog`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Dynamic variables", exact: true }).click();
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
  await page.getByText("Enter an amount from 0 to 50000.", { exact: true }).waitFor();
  assert.equal((await readProfile(page)).riskVariables.basePremiumAnnual, 1234.56);

  step("insurance: reload retains explicit status and the exact premium");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Dynamic variables", exact: true }).click();
  assert.equal(await status.inputValue(), "reported");
  assert.equal(await premium.inputValue(), "1234.56");
  await status.selectOption("unknown");
  await page
    .getByText(
      "Insurance not assessed; no recovery modeled. This does not mean you are uninsured.",
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
  await page.waitForTimeout(700);
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
});

await withPage(options, async (page, errors) => {
  step("setup: exception-first review retains every imported person");
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Set up my own business", exact: true }).click();
  await page.getByLabel("Business name", { exact: true }).fill("Review Workflow Example");
  await page
    .getByText("Paste your team from Workday, SAP, Oracle, or your payroll export", { exact: true })
    .click();
  await page
    .getByLabel("Pasted roster", { exact: true })
    .fill("Maya Roe, Bookkeeper\nCal Diaz, Front Desk\nRiver Vale, Quantum Wrangler");
  await page.getByRole("button", { name: "Fill the table", exact: true }).click();
  const names = page.getByRole("textbox", { name: /^Person \d+ name$/ });
  assert.equal(await names.count(), 4);
  const filter = page.getByRole("checkbox", {
    name: "Show only incomplete or uncertain rows",
    exact: true,
  });
  await filter.check();
  assert.equal(await names.count(), 2);
  const owner = page.getByRole("textbox", { name: "Person 1 name", exact: true });
  await owner.pressSequentially("Jordan Owner");
  assert.equal(await owner.inputValue(), "Jordan Owner");
  assert.equal(await owner.evaluate((element) => document.activeElement === element), true);
  await page.getByRole("combobox", { name: "River Vale role", exact: true }).fill("Cashier");
  await page.getByRole("combobox", { name: "River Vale role", exact: true }).blur();
  await filter.uncheck();
  assert.equal(await names.count(), 4);

  step("setup: reload recovery and completion preserve the whole roster");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page.getByLabel("Business name", { exact: true }).inputValue(),
    "Review Workflow Example",
  );
  assert.equal(await names.count(), 4);
  await page.getByRole("button", { name: "Show me my findings", exact: true }).click();
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
  await page.locator("nav").waitFor();
  noErrors(errors);
});

await withPage(options, async (page, errors) => {
  step("setup: refused draft storage is reported rather than claimed saved");
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.endsWith(":precog.onboarding-draft.v1"))
        throw new DOMException("Test quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Set up my own business", exact: true }).click();
  await page.getByLabel("Business name", { exact: true }).fill("Unsaved draft example");
  await page.getByText(/This tab cannot save your setup draft/).waitFor();
  noErrors(errors);
});
if (!process.exitCode)
  console.log(JSON.stringify({ ok: true, steps: steps.length, authenticated: false }));
