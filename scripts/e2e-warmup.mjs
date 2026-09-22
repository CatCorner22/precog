/**
 * Loads the app twice with a pause between, so Vite's dependency discovery and
 * any forced reload it triggers happen before the end-to-end suites start.
 * Prints nothing on success; exits non-zero if the page never loads.
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:8080/";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  for (let pass = 0; pass < 2; pass += 1) {
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(4_000);
  }
  console.log(JSON.stringify({ ok: true, baseUrl, passes: 2 }));
} finally {
  await browser.close();
}
