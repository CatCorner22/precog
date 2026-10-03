/**
 * What the browser smokes share: the base URL and timeout from the command
 * line and environment, a headless Chromium page that collects page and
 * console errors, a screenshot on failure, waits for the page to settle, and
 * the browser storage key the app saves the business profile under. The step
 * logger and `eventually` live in ./steps.mjs.
 * Each script keeps only its own steps.
 */
import { chromium } from "playwright";
import { eventually } from "./steps.mjs";

export const IGNORED_CONSOLE = /favicon|net::ERR_|Download the React DevTools/;

/**
 * Copies of the app's storage names (WORKSPACE_PREFIX in
 * src/lib/precog/workspace-storage.ts, ACTIVE_PROFILE_KEY in
 * src/lib/precog/practice-profile.ts). The scripts run under plain Node and
 * cannot import TypeScript; scripts/lib/e2e.test.mjs fails when they drift.
 */
const WORKSPACE_PREFIX = "precog.workspace.v2:";
export const ACTIVE_PROFILE_KEY = "precog.practiceProfile.v2";

export function e2eOptions() {
  return {
    baseUrl: (process.argv[2] || process.env.E2E_BASE_URL || "http://127.0.0.1:8080/").replace(
      /\/$/,
      "",
    ),
    timeout: Number(process.env.E2E_TIMEOUT_MS || 45000),
    failureShot: process.env.E2E_SCREENSHOT || "",
  };
}

/**
 * Runs `body(page, errors)` in a fresh headless page. Uncaught page errors,
 * console errors (minus the ignored noise) and hydration warnings collect in
 * `errors`; `body` decides when to check them. Any failure, including a
 * browser that cannot launch, prints FAILED, saves the screenshot when one is
 * asked for, and sets the exit code. Resolves to true when the body passed,
 * so a script can skip its later sessions after a failure.
 */
export async function withPage(options, body) {
  let browser;
  let page;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
    page.setDefaultTimeout(options.timeout);
    const errors = { page: [], console: [] };
    page.on("pageerror", (err) => errors.page.push(String(err?.message || err)));
    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() === "error" && !IGNORED_CONSOLE.test(text)) errors.console.push(text);
      // React 19 logs hydration mismatches as errors, but keep the regex in case
      // a future version downgrades them to warnings.
      if (/hydrat/i.test(text) && !errors.console.includes(text)) errors.console.push(text);
    });
    await body(page, errors);
    return true;
  } catch (err) {
    console.error(`FAILED: ${err?.message || err}`);
    if (options.failureShot && page) {
      await page.screenshot({ path: options.failureShot, fullPage: true }).catch(() => {});
      console.error(`screenshot: ${options.failureShot}`);
    }
    process.exitCode = 1;
    return false;
  } finally {
    await browser?.close().catch(() => {});
  }
}

/**
 * Opens setup as a first-time guest: the home page sends a visitor with no
 * business to the landing page, whose "Set up your business" link comes
 * back with the industry radios open. Clears this browser's storage first,
 * so a sample a previous session left behind does not skip the landing; the
 * clearing happens on a same-origin page that runs none of Precog's code
 * (robots.txt), because the home page writes its state back on pagehide.
 */
export async function openSetup(page, baseUrl, timeout) {
  await page.goto(`${baseUrl}/robots.txt`, { waitUntil: "load", timeout });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout });
  await page.waitForURL(/\/welcome$/, { timeout });
  await page.getByRole("link", { name: "Set up your business" }).click();
  await page.getByRole("radiogroup").waitFor({ timeout });
}

/** Waits until `locator` matches exactly `count` elements (Playwright's count() does not wait). */
export async function waitForCount(locator, count, label = "locator") {
  let seen;
  await eventually(
    async () => (seen = await locator.count()) === count,
    () => `${label}: expected ${count}, saw ${seen}`,
  );
}

/** The React Flow canvas transform, e.g. "transform: translate(10px, 20px) scale(1)". */
export async function viewportTransform(page) {
  return page.evaluate(
    () => document.querySelector(".react-flow__viewport")?.getAttribute("style") ?? "",
  );
}

/**
 * Waits for the canvas to hold still for two reads 150 ms apart (a fit
 * animation has finished) and returns where it came to rest. With `from`, it
 * also waits for the canvas to have moved away from that transform.
 */
export async function restingViewport(page, { from, message = "the canvas did not settle" } = {}) {
  let last;
  return eventually(
    async () => {
      const now = await viewportTransform(page);
      await page.waitForTimeout(150);
      last = await viewportTransform(page);
      return last === now && last !== from && last;
    },
    () => `${message} (last seen: ${last === from ? "unchanged" : last || "no canvas"})`,
  );
}

/** The localStorage key of the active business profile for a guest or a signed-in account. */
export function profileStorageKey(accountId = null) {
  const scope = accountId === null ? "guest" : `account:${encodeURIComponent(accountId)}`;
  return `${WORKSPACE_PREFIX}${scope}:${ACTIVE_PROFILE_KEY}`;
}
