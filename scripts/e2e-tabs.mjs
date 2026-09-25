#!/usr/bin/env node
/**
 * Headless tab walk: for every industry demo, open every top-level tab and the
 * standalone routes (/threat, /report, /login, /share/<bad token>) and fail on
 * any uncaught page error, React error-boundary card, hydration warning, or
 * console error. This is the check that would have caught the /threat
 * hydration mismatch and any tab that throws on a template it was not written for.
 *
 * Usage: node scripts/e2e-tabs.mjs [baseUrl]   (default http://127.0.0.1:8080/)
 * Env:   E2E_TIMEOUT_MS (default 45000), E2E_SCREENSHOT (PNG path on failure)
 */
import { e2eOptions, withPage } from "./lib/e2e.mjs";

const options = e2eOptions();
const { baseUrl, timeout, failureShot } = options;

const INDUSTRIES = [
  "Dental",
  "Retail",
  "Professional",
  "Restaurant",
  "Construction",
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
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: new RegExp(`^${industry}`) })
      .first()
      .click();
    await page.getByRole("button", { name: /^Load .* demo$/ }).click();
    await page.locator("nav button").first().waitFor();
    await drain(`${industry}: load demo`);

    // Lazy tabs show a loading state first; wait for it to clear.
    const settle = () =>
      page
        .getByText(/^Loading/)
        .first()
        .waitFor({ state: "detached", timeout: 15000 })
        .catch(() => {});

    // The six primary tabs sit in the strip; the rest are behind "More".
    const primary = await page.locator('nav [role="tab"]').allInnerTexts();
    let lastLabel = "";
    for (let i = 0; i < primary.length; i++) {
      const label = primary[i].trim().split("\n")[0];
      await page.locator('nav [role="tab"]').nth(i).click();
      await settle();
      await drain(`${industry}: tab "${label}"`);
      lastLabel = label;
    }
    await page.locator("nav [data-more-tabs]").click();
    const advanced = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts();
    await page.keyboard.press("Escape");
    for (const text of advanced) {
      const label = text.trim().split("\n")[0];
      await page.locator("nav [data-more-tabs]").click();
      await page.locator('[role="menu"] [role="menuitem"]', { hasText: label }).first().click();
      await settle();
      await drain(`${industry}: tab "${label}"`);
      lastLabel = label;
    }
    if (primary.length + advanced.length < 15) {
      throw new Error(
        `${industry}: expected 15 tabs, found ${primary.length} primary and ${advanced.length} advanced`,
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

    for (const path of ["/threat", "/report"]) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle", timeout });
      await drain(`${industry}: ${path}`);
    }
  }

  for (const path of ["/login", "/privacy", "/terms", "/firm", "/share/not-a-real-token"]) {
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
