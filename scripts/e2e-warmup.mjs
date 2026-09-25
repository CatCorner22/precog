/**
 * Loads the app twice with a pause between, so Vite's dependency discovery and
 * any forced reload it triggers happen before the end-to-end suites start.
 * Exits non-zero if the page never loads.
 */
import { e2eOptions, withPage } from "./lib/e2e.mjs";

const options = { ...e2eOptions(), timeout: 60_000 };
await withPage(options, async (page) => {
  for (let pass = 0; pass < 2; pass += 1) {
    await page.goto(`${options.baseUrl}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(4_000);
  }
  console.log(JSON.stringify({ ok: true, baseUrl: options.baseUrl, passes: 2 }));
});
