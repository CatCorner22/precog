/**
 * What the browser smokes share: the base URL and timeout from the command
 * line and environment, a headless Chromium page that collects page and
 * console errors, and a screenshot on failure. Each script keeps only its
 * own steps.
 */
import { chromium } from "playwright";

export const IGNORED_CONSOLE = /favicon|net::ERR_|Download the React DevTools/;

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
 * `errors`; `body` decides when to check them. A throw prints the failure,
 * saves the screenshot when one is asked for, and sets the exit code.
 */
export async function withPage(options, body) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  let page;
  try {
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
  } catch (err) {
    console.error(`FAILED: ${err?.message || err}`);
    if (options.failureShot && page) {
      await page.screenshot({ path: options.failureShot, fullPage: true }).catch(() => {});
      console.error(`screenshot: ${options.failureShot}`);
    }
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
