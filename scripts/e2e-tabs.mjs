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
import { chromium } from "playwright";

const baseUrl = (process.argv[2] || process.env.E2E_BASE_URL || "http://127.0.0.1:8080/").replace(
  /\/$/,
  "",
);
const timeout = Number(process.env.E2E_TIMEOUT_MS || 45000);
const failureShot = process.env.E2E_SCREENSHOT || "";

const INDUSTRIES = [
  "Dental",
  "Retail",
  "Professional",
  "Restaurant",
  "Construction",
  "Nonprofit",
  "General",
];
const IGNORED_CONSOLE = /favicon|net::ERR_|Download the React DevTools/;

const failures = [];
let page;

function record(where, problems) {
  if (!problems.length) return;
  failures.push({ where, problems });
  console.log(`  ✗ ${where}: ${problems.join(" | ")}`);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.setDefaultTimeout(timeout);

  let pageErrors = [];
  let consoleErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error" && !IGNORED_CONSOLE.test(text)) consoleErrors.push(text);
    // React 19 logs hydration mismatches as errors, but keep the regex in case
    // a future version downgrades them to warnings.
    if (/hydrat/i.test(text) && !consoleErrors.includes(text)) consoleErrors.push(text);
  });

  async function drain(where) {
    await page.waitForTimeout(400);
    const boundary = await page.getByText(/This view hit an error|failed to download/).count();
    const problems = [
      ...pageErrors.map((e) => `pageerror: ${e}`),
      ...consoleErrors.map((e) => `console: ${e.slice(0, 200)}`),
      ...(boundary ? ["error boundary rendered"] : []),
    ];
    pageErrors = [];
    consoleErrors = [];
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

    const tabs = await page.locator("nav button").allInnerTexts();
    for (let i = 0; i < tabs.length; i++) {
      const label = tabs[i].trim().split("\n")[0];
      await page.locator("nav button").nth(i).click();
      // Lazy tabs show a loading state first; wait for it to clear.
      await page
        .getByText(/^Loading/)
        .first()
        .waitFor({ state: "detached", timeout: 15000 })
        .catch(() => {});
      await drain(`${industry}: tab "${label}"`);
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
    if (current.trim().split("\n")[0] !== tabs[tabs.length - 1].trim().split("\n")[0]) {
      throw new Error(`${industry}: tab did not survive reload (got "${current}")`);
    }
    await drain(`${industry}: reload on ${new URL(lastUrl).search}`);

    for (const path of ["/threat", "/report"]) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle", timeout });
      await drain(`${industry}: ${path}`);
    }
  }

  for (const path of ["/login", "/share/not-a-real-token"]) {
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
} catch (err) {
  console.error(`FAILED: ${err?.message || err}`);
  if (failureShot && page)
    await page.screenshot({ path: failureShot, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
