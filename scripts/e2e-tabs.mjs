#!/usr/bin/env node
/**
 * Headless tab walk: for every industry demo, open every top-level tab, each
 * view of How Precog scores, and the standalone routes (/report, /login,
 * /privacy, /terms, /pricing, /welcome, /firm, /share/<bad token>, /share/report/<bad token>,
 * /join/client/<bad token>)
 * and fail on any uncaught page
 * error, React error-boundary card, hydration warning, or console error. This
 * is the check that catches a hydration mismatch and any tab that throws on a
 * template it was not written for.
 * Once, signed out, it also checks the header (Needs attention), the
 * phone strip ("All sections" names every main section), the
 * Monthly review tab, old tab ids in the address (?tab=journal, ?tab=layers,
 * ?tab=command, ?tab=value), the retired /threat page, the Analyze menu's
 * links to the firm workspace, the tab count, and the home footer's Privacy
 * link.
 *
 * Usage: node scripts/e2e-tabs.mjs [baseUrl]   (default http://127.0.0.1:8080/)
 * Env:   E2E_TIMEOUT_MS (default 45000), E2E_SCREENSHOT (PNG path on failure)
 */
import { e2eOptions, exploreSample, openSetup, withPage } from "./lib/e2e.mjs";

const options = e2eOptions();
const { baseUrl, timeout, failureShot } = options;

const INDUSTRIES = [
  "Dental",
  "Retail",
  "Professional",
  "Restaurant",
  "Construction",
  "Auto",
  "Nonprofit",
  "General",
];
const failures = [];

function record(where, problems) {
  if (!problems.length) return;
  failures.push({ where, problems });
  console.log(`  ✗ ${where}: ${problems.join(" | ")}`);
}

await withPage(options, async (page, errors) => {
  async function drain(where) {
    await page.waitForTimeout(400);
    const boundary = await page.getByText(/This view hit an error|failed to download/).count();
    const problems = [
      ...errors.page.map((e) => `pageerror: ${e}`),
      ...errors.console.map((e) => `console: ${e.slice(0, 200)}`),
      ...(boundary ? ["error boundary rendered"] : []),
    ];
    errors.page = [];
    errors.console = [];
    record(where, problems);
  }

  for (const industry of INDUSTRIES) {
    console.log(`· ${industry}`);
    await openSetup(page, baseUrl, timeout);
    await exploreSample(page, industry);
    await page.locator("nav button").first().waitFor();
    await drain(`${industry}: load the sample`);

    // Lazy tabs show a loading state first; wait for it to clear.
    const settle = () =>
      page
        .getByText(/^Loading/)
        .first()
        .waitFor({ state: "detached", timeout: 15000 })
        .catch(() => {});

    // The primary tabs sit in the strip; Ask Pioneer is a header button; the
    // rest are behind "Analyze".
    const primary = await page.locator('nav [role="tab"]').allInnerTexts();
    let lastLabel = "";
    for (let i = 0; i < primary.length; i++) {
      const label = primary[i].trim().split("\n")[0];
      await page.locator('nav [role="tab"]').nth(i).click();
      await settle();
      await drain(`${industry}: tab "${label}"`);
      lastLabel = label;
    }
    await page.locator("[data-more-tabs]").click();
    // The menu is placed under its button after it opens; read it once it shows.
    await page.locator('[role="menu"] [role="menuitem"]').first().waitFor();
    // Analyze views only: its links to other pages are checked once, below.
    const advanced = await page
      .locator('[role="menu"] [role="menuitem"]:not([data-route-link])')
      .allInnerTexts();
    await page.keyboard.press("Escape");
    for (const text of advanced) {
      const label = text.trim().split("\n")[0];
      await page.locator("[data-more-tabs]").click();
      await page
        .locator('[role="menu"] [role="menuitem"]:not([data-route-link])', { hasText: label })
        .first()
        .click();
      await settle();
      await drain(`${industry}: tab "${label}"`);
      lastLabel = label;
    }
    const headerTabs = await page.locator("[data-header-tab]").count();
    const expected = Number(
      await page.locator("nav[data-tab-count]").getAttribute("data-tab-count"),
    );
    if (primary.length + advanced.length + headerTabs !== expected) {
      throw new Error(
        `${industry}: expected ${expected} tabs, found ${primary.length} primary, ${advanced.length} under Analyze and ${headerTabs} in the header`,
      );
    }

    // The open tab lives in the URL: the last tab clicked must survive a reload.
    const lastUrl = page.url();
    if (!/[?&]tab=/.test(lastUrl)) {
      throw new Error(
        `${industry}: expected ?tab= in the URL after clicking a tab, got ${lastUrl}`,
      );
    }
    await page.reload({ waitUntil: "networkidle", timeout });
    const current = await page
      .locator('nav [role="tab"][aria-selected="true"]')
      .first()
      .innerText();
    if (current.trim().split("\n")[0] !== lastLabel) {
      throw new Error(`${industry}: tab did not survive reload (got "${current}")`);
    }
    await drain(`${industry}: reload on ${new URL(lastUrl).search}`);

    // How Precog scores holds three views; each opens from the address.
    for (const view of ["residual", "coverage", "patterns"]) {
      await page.goto(`${baseUrl}/?tab=scores&item=${view}`, { waitUntil: "networkidle", timeout });
      await settle();
      await drain(`${industry}: How Precog scores, view "${view}"`);
    }

    // Who controls what opens on its Controls view from the address.
    await page.goto(`${baseUrl}/?tab=sod&item=controls`, { waitUntil: "networkidle", timeout });
    await settle();
    await drain(`${industry}: Who controls what, view "controls"`);

    await page.goto(`${baseUrl}/report`, { waitUntil: "networkidle", timeout });
    await drain(`${industry}: /report`);
  }

  await shellChecks(page);
  await drain("signed-out shell checks");

  for (const path of [
    "/login",
    "/privacy",
    "/terms",
    "/pricing",
    "/welcome",
    "/firm",
    "/share/not-a-real-token",
    "/share/report/not-a-real-token",
    "/join/client/not-a-real-token",
  ]) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle", timeout });
    await drain(path);
  }

  if (failures.length) {
    console.error(`\n${failures.length} view(s) with problems`);
    if (failureShot) await page.screenshot({ path: failureShot, fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ ok: true, industries: INDUSTRIES.length }));
  }
});

/**
 * The header, the Monthly review tab, an alias in the address and the home
 * footer, checked once, signed out, on the sample the walk left open.
 */
async function shellChecks(page) {
  console.log("· shell, signed out");
  const home = async (search = "") => {
    await page.goto(`${baseUrl}/${search}`, { waitUntil: "networkidle", timeout });
    await page.locator("nav[data-tab-count]").waitFor();
  };

  // Ten tabs: five in the strip, four under Analyze, Ask Pioneer in the header.
  await home();
  const tabCount = await page.locator("nav[data-tab-count]").getAttribute("data-tab-count");
  if (tabCount !== "10") throw new Error(`expected 10 tabs, data-tab-count is ${tabCount}`);

  const selectedTab = async () =>
    (await page.locator('nav [role="tab"][aria-selected="true"]').first().innerText())
      .trim()
      .split("\n")[0];

  // The retired Dashboard opens Start here.
  await home("?tab=command");
  if ((await selectedTab()) !== "Start here") {
    throw new Error(`?tab=command opened "${await selectedTab()}", not Start here`);
  }
  if (/[?&]tab=/.test(page.url())) throw new Error(`?tab=command kept a tab: ${page.url()}`);

  // The retired /threat page opens How Precog scores, on What is still exposed.
  await page.goto(`${baseUrl}/threat`, { waitUntil: "networkidle", timeout });
  await page.locator("nav[data-tab-count]").waitFor();
  if (!/[?&]tab=scores/.test(page.url()) || !/[?&]item=residual/.test(page.url())) {
    throw new Error(`/threat did not open What is still exposed: ${page.url()}`);
  }
  if ((await selectedTab()) !== "How Precog scores") {
    throw new Error(`/threat opened "${await selectedTab()}", not How Precog scores`);
  }

  // Value proof moved to the firm workspace: the old address and the Advanced
  // link both land on its section, in view, while signed out.
  const valueProofInView = async (how) => {
    await page.waitForURL(/\/firm#value-proof$/, { timeout });
    await page.getByRole("heading", { name: "Value proof (this business)" }).waitFor({ timeout });
    await page.waitForFunction(
      () => {
        const el = document.getElementById("value-proof");
        if (!el) return false;
        const box = el.getBoundingClientRect();
        return box.top < window.innerHeight && box.bottom > 0;
      },
      null,
      { timeout },
    );
    console.log(`  ✓ ${how} lands on Value proof`);
  };
  await page.goto(`${baseUrl}/?tab=value`, { waitUntil: "networkidle", timeout });
  await valueProofInView("?tab=value");
  await page.goto(`${baseUrl}/?tab=snapshots`, { waitUntil: "networkidle", timeout });
  await page.waitForURL(/\/firm#history$/, { timeout });
  await page.getByRole("heading", { name: "History", exact: true }).waitFor({ timeout });

  await home();
  await page.locator("[data-more-tabs]").click();
  await page.locator('[role="menu"] [data-route-link="value"]').click();
  await valueProofInView("Analyze › Value proof");

  await home();

  // The header no longer carries a Report link: the sample hides the Control
  // report (its link on Start here is for an owner's own business), and the
  // page itself still renders signed out.
  await page.locator('a[href="/report"]').waitFor({ state: "detached", timeout });
  // The report keeps the network busy while it loads its figures, so wait for
  // the page's own control rather than for network silence.
  await page.goto(`${baseUrl}/report`, { waitUntil: "domcontentloaded", timeout });
  await page.getByRole("button", { name: "Print / Save as PDF" }).waitFor({ timeout });

  // The Monthly review tab opens on its heading, signed out.
  await home();
  await page.locator('nav [role="tab"]', { hasText: "Monthly review" }).click();
  await page.getByRole("heading", { level: 1, name: "Monthly review" }).waitFor();

  // An old tab id lands on the tab and section it became.
  await home("?tab=journal");
  const selected = await page.locator('nav [role="tab"][aria-selected="true"]').first().innerText();
  if (selected.trim().split("\n")[0] !== "Monthly review") {
    throw new Error(`?tab=journal opened "${selected}", not Monthly review`);
  }
  if (!/[?&]item=decisions/.test(page.url())) {
    throw new Error(`?tab=journal did not open the Decisions log section: ${page.url()}`);
  }
  await page.locator("#decisions").waitFor();

  // The retired Where risk sits tab lands on Who controls what, on Controls.
  await home("?tab=layers");
  const sod = await page.locator('nav [role="tab"][aria-selected="true"]').first().innerText();
  if (!sod.trim().startsWith("Who controls what")) {
    throw new Error(`?tab=layers opened "${sod}", not Who controls what`);
  }
  if (!/[?&]item=controls/.test(page.url())) {
    throw new Error(`?tab=layers did not open the Controls view: ${page.url()}`);
  }
  await page.locator('#sod-tab-safeguards[aria-selected="true"]').waitFor({ timeout });
  await page
    .locator("#sod-view-safeguards")
    .getByRole("heading", { name: "Controls", exact: true })
    .waitFor();
  // Dual release sits below the controls on the same sub-tab.
  await page.locator("#sod-section-dual").waitFor();

  // Choosing a sub-tab puts its first view in the address, so a reload opens it on screen.
  await page.locator("#sod-tab-duties").click();
  await page.waitForURL(/[?&]item=power/, { timeout });
  await page.reload({ waitUntil: "networkidle", timeout });
  await page.locator('#sod-tab-duties[aria-selected="true"]').waitFor({ timeout });
  // A later link to Controls still switches the view in place.
  await page.goBack({ waitUntil: "networkidle", timeout });
  await page.locator('#sod-tab-safeguards[aria-selected="true"]').waitFor({ timeout });

  // The older view addresses still work: the matrix opens its fold under
  // Duty conflicts and takes focus; Duties by person is a section of Duty assignments.
  await home("?tab=sod&item=matrix");
  await page.locator('#sod-tab-conflicts[aria-selected="true"]').waitFor({ timeout });
  await page.locator("#sod-section-matrix details[open]").waitFor({ timeout });
  await page.waitForFunction(() => document.activeElement?.id === "sod-section-matrix", null, {
    timeout,
  });
  await home("?tab=sod&item=roles");
  await page.locator('#sod-tab-duties[aria-selected="true"]').waitFor({ timeout });
  await page.waitForFunction(() => document.activeElement?.id === "sod-section-roles", null, {
    timeout,
  });

  // Picking a scenario puts it in the address, so reload and a shared link
  // open the scenario on screen, not the one picked before it.
  await home("?tab=precog");
  const scenarioCards = page.locator('[role="group"][aria-label="Scenarios"] button');
  await scenarioCards.first().waitFor({ timeout });
  await scenarioCards.nth(1).click();
  await page.waitForURL(/[?&]item=(?!failure|compare|variables|cascades)[^&]+/, { timeout });
  const pickedScenario = new URL(page.url()).searchParams.get("item");
  await page.reload({ waitUntil: "networkidle", timeout });
  await page
    .locator('[role="group"][aria-label="Scenarios"] button[aria-pressed="true"]')
    .waitFor({ timeout });
  if (new URL(page.url()).searchParams.get("item") !== pickedScenario) {
    throw new Error(`reload lost the picked scenario: ${page.url()}`);
  }
  const pressedScenario = await scenarioCards.evaluateAll((nodes) =>
    nodes.findIndex((n) => n.getAttribute("aria-pressed") === "true"),
  );
  if (pressedScenario !== 1) {
    throw new Error(`reload shows scenario ${pressedScenario}, not the picked second one`);
  }

  // "What if this fails?" from the bottom of the Controls list opens What
  // could happen from its top: the picker is on screen, not above the header.
  await home("?tab=sod&item=controls");
  const whatIfFails = page.getByRole("button", { name: /^What if .+ fails\?$/ }).first();
  await whatIfFails.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await whatIfFails.click();
  await page.waitForURL(/[?&]item=failure(:|%3A)control(:|%3A)/, { timeout });
  await page.locator("#control-failure-target").waitFor({ timeout });
  const picker = await page.evaluate(() => {
    const el = document.getElementById("control-failure-target");
    return {
      top: el ? Math.round(el.getBoundingClientRect().top) : null,
      view: window.innerHeight,
    };
  });
  const pickerTop = picker.top;
  if (pickerTop === null || pickerTop < 0 || pickerTop > picker.view) {
    throw new Error(`control-failure picker is off screen at y=${pickerTop}`);
  }
  console.log(`  ✓ "What if this fails?" lands with the picker at y=${pickerTop}`);

  // The header opens Ask Pioneer. Someone is out lives on Who knows what;
  // Needs attention and older links open the same absence cards.
  await home();
  await page.locator("[data-header-tab=pioneer]").click();
  await page.waitForURL(/[?&]tab=pioneer/, { timeout });
  if ((await selectedTab()) !== "Ask Pioneer") {
    throw new Error(`the header's Ask Pioneer opened "${await selectedTab()}"`);
  }
  await home("?tab=knowledge&item=absences");
  if (!/[?&]tab=knowledge(&|$)/.test(page.url()) || !/[?&]item=absences/.test(page.url())) {
    throw new Error(`the absence cards did not open: ${page.url()}`);
  }
  await page.locator("#absences").waitFor({ timeout });
  await page.waitForFunction(() => document.activeElement?.id === "absences", null, { timeout });

  // Needs attention lists its own items, and they never count as Analyze views.
  await home();
  const attention = page.locator("[data-needs-attention]");
  let attentionItems = [];
  if (await attention.count()) {
    await attention.click();
    attentionItems = await page
      .locator('[role="menu"][aria-label="Needs attention"] [role="menuitem"]')
      .allInnerTexts();
    if (!attentionItems.length) throw new Error("Needs attention opened with no items");
    await page.keyboard.press("Escape");
    await page
      .locator('[role="menu"][aria-label="Needs attention"]')
      .waitFor({ state: "detached" });
  }
  await page.locator("[data-more-tabs]").click();
  await page.locator('[role="menu"] [role="menuitem"]').first().waitFor();
  const advanced = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts();
  await page.keyboard.press("Escape");
  const leaked = advanced.filter((text) => attentionItems.includes(text));
  if (leaked.length) {
    throw new Error(`Needs attention items counted as Analyze views: ${leaked.join(", ")}`);
  }

  // On a phone the header is two rows: the business with Needs attention and
  // Sign in, then wording, save status and Ask Pioneer. No More disclosure.
  await page.setViewportSize({ width: 390, height: 844 });
  await home();
  if (await page.locator("[aria-controls=header-more]").count()) {
    throw new Error("phone header still folds actions behind More");
  }
  if (await page.locator("[data-header-link=absences]").count()) {
    throw new Error('phone header still shows "Someone is out"');
  }
  const rows = await page.evaluate(() => {
    const top = (sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().top ?? -1);
    return {
      business: top("[aria-controls=business-switcher-panel]"),
      attention: top("[data-needs-attention]"),
      pioneer: top("[data-header-tab=pioneer]"),
      tabs: top("nav[data-tab-count]"),
      header: Math.round(document.querySelector("header")?.getBoundingClientRect().height ?? 0),
    };
  });
  if (rows.attention < 0 || Math.abs(rows.attention - rows.business) > 24) {
    throw new Error(
      `phone header: Needs attention is not beside the business: ${JSON.stringify(rows)}`,
    );
  }
  if (rows.pioneer <= rows.business || rows.tabs <= rows.pioneer) {
    throw new Error(
      `phone header: Ask Pioneer is not between the business and the tabs: ${JSON.stringify(rows)}`,
    );
  }
  if (rows.header > 220) {
    throw new Error(`phone header: ${rows.header}px tall: ${JSON.stringify(rows)}`);
  }
  console.log(`  ✓ phone header is ${rows.header}px: Ask Pioneer under the business, no More`);

  // On a phone the strip shows the open tab, with its label, and "All
  // sections" names every main section, so none hides off the edge.
  const shownTabs = await page.locator('nav [role="tab"]:visible').allInnerTexts();
  if (shownTabs.length !== 1 || !shownTabs[0].trim()) {
    throw new Error(`phone strip shows ${JSON.stringify(shownTabs)}, not the open tab alone`);
  }
  const mainSections = await page
    .locator('nav [role="tab"]')
    .evaluateAll((tabs) => tabs.map((t) => t.id.replace(/^tab-/, "")));
  await page.locator("[data-sections-menu]").click();
  // The menu renders after the click: wait for its items before reading them.
  const sectionItems = page.locator('[role="menu"][aria-label="All sections"] [role="menuitem"]');
  await sectionItems.first().waitFor({ state: "visible" });
  const listed = await sectionItems.evaluateAll((items) =>
    items.map((i) => i.getAttribute("data-tab-id") ?? i.textContent),
  );
  const missing = mainSections.filter((id) => !listed.includes(id));
  if (missing.length) throw new Error(`All sections leaves out: ${missing.join(", ")}`);
  await page.keyboard.press("Escape");
  console.log(`  ✓ phone "All sections" lists ${listed.length} places by name`);
  await page.setViewportSize({ width: 1440, height: 900 });

  // The home footer links to the privacy notice.
  await page
    .getByRole("navigation", { name: "Legal" })
    .getByRole("link", { name: "Privacy" })
    .click();
  await page.waitForURL(/\/privacy/, { timeout });
}
