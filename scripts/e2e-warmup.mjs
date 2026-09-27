#!/usr/bin/env node
/**
 * Loads the app and waits until Vite's dependency discovery has settled: the
 * page must stay put, with no forced reload, for four quiet seconds after the
 * network goes idle. Run it before the end-to-end suites so a mid-test reload
 * ("Failed to fetch dynamically imported module") cannot land in them. Exits
 * non-zero if the page never loads or never settles within a minute.
 *
 * Usage: node scripts/e2e-warmup.mjs [baseUrl]   (default http://127.0.0.1:8080/)
 */
import { e2eOptions, withPage } from "./lib/e2e.mjs";

const QUIET_MS = 4_000;
const options = { ...e2eOptions(), timeout: 60_000 };

await withPage(options, async (page) => {
  const deadline = Date.now() + options.timeout;
  let reloads = 0;
  await page.goto(`${options.baseUrl}/`, { waitUntil: "networkidle" });
  for (;;) {
    const reloaded = await page
      .waitForEvent("framenavigated", {
        predicate: (frame) => frame === page.mainFrame(),
        timeout: QUIET_MS,
      })
      .then(
        () => true,
        () => false,
      );
    if (!reloaded) break;
    reloads += 1;
    if (Date.now() > deadline) throw new Error(`the page kept reloading (${reloads} times)`);
    await page.waitForLoadState("networkidle");
  }
  console.log(JSON.stringify({ ok: true, baseUrl: options.baseUrl, reloads }));
});
