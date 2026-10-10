#!/usr/bin/env node
/**
 * One step of a signed-in CPA persona's walk through Precog's firm workspace,
 * in a browser profile that persists between calls, against the fixture that
 * ./serve-firm.mjs serves. Signs in with the cookie that fixture wrote.
 *
 * Usage: node scripts/ux/cpa/drive.mjs <persona> '<json actions>'
 *   persona: a short name; the profile lives in <UX_DIR>/profiles/<persona>
 *   actions: a JSON array, run in order, for example
 *     [{"goto":"/"}, {"click":{"role":"button","name":"Explore the fictional sample"}},
 *      {"fill":{"label":"Business name","value":"Bayside Dental"}}, {"press":"Enter"},
 *      {"clickText":"Monthly review"}, {"scroll":800}, {"wait":500}]
 *   Optional first element {"viewport":"phone"} uses 390x844 instead of 1440x900.
 *   Beyond the owner driver's actions: hoverText, wheel, scrollToText, clickIn
 *   (a control inside a named region) and snap (a mid-run screenshot and text).
 *
 * Env: UX_BASE, the fixture's address (default http://localhost:8089);
 *      UX_DIR, where profiles, screenshots, cookies and downloads go (default
 *      .tmp/ux in the repository); UX_AS, which seeded user to sign in as
 *      ("sam", the firm owner, or "jordan", the preparer); UX_PROMPT, the text
 *      typed into a prompt() dialog; UX_DISMISS=1 dismisses dialogs instead of
 *      accepting them; UX_FIND, a regex whose matching lines are printed.
 *
 * After the actions it saves a screenshot to <UX_DIR>/shots/<persona>-<n>.png
 * and prints: the URL, the page title, the visible text (trimmed), and the
 * buttons, links, tabs and fields a user can see, with their accessible names.
 * Any action error is printed, not thrown, so the persona sees what a user sees.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const DIR = process.env.UX_DIR ?? resolve(HERE, "../../../.tmp/ux");
const BASE = process.env.UX_BASE ?? "http://localhost:8089";
const [persona, raw = "[]"] = process.argv.slice(2);
if (!persona || !/^[a-z0-9-]+$/.test(persona))
  throw new Error("persona: lowercase letters, digits, dashes");
let actions = JSON.parse(raw);
let viewport = { width: 1440, height: 900 };
if (actions[0]?.viewport === "phone") {
  viewport = { width: 390, height: 844 };
  actions = actions.slice(1);
}
mkdirSync(`${DIR}/shots`, { recursive: true });
const ctx = await chromium.launchPersistentContext(`${DIR}/profiles/${persona}`, {
  headless: true,
  viewport,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  acceptDownloads: true,
  downloadsPath: `${DIR}/cpa/downloads`,
});
{
  const ck = JSON.parse(readFileSync(`${DIR}/cpa/cookies.json`, "utf8"));
  await ctx.addCookies([ck[process.env.UX_AS ?? "sam"]]);
}
const page = ctx.pages()[0] ?? (await ctx.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
page.on("dialog", async (d) => {
  errors.push(
    `dialog (${d.type()}): ${d.message()}${d.type() === "prompt" ? ` -> typed: ${process.env.UX_PROMPT ?? "(nothing)"}` : ""}`,
  );
  if (process.env.UX_DISMISS === "1") await d.dismiss();
  else await d.accept(d.type() === "prompt" ? (process.env.UX_PROMPT ?? "") : undefined);
});
page.on("download", async (d) => {
  const p = `${DIR}/cpa/downloads/${d.suggestedFilename()}`;
  errors.push(`download started: ${d.suggestedFilename()}`);
  await d.saveAs(p).catch(() => {});
});
const first = actions[0];
if (!first || !("goto" in first)) {
  // Reopen the page the persona was on at the end of the last step.
  const saved = `${DIR}/profiles/${persona}.url`;
  const last = existsSync(saved) ? readFileSync(saved, "utf8").trim() : BASE + "/";
  await page.goto(last, { waitUntil: "networkidle" }).catch(() => {});
}
for (const a of actions) {
  try {
    if ("goto" in a) await page.goto(BASE + a.goto, { waitUntil: "networkidle" });
    else if ("click" in a)
      await page
        .getByRole(a.click.role, { name: a.click.name, exact: a.click.exact ?? false })
        .first()
        .click({ timeout: 8000 });
    else if ("clickText" in a)
      await page
        .getByText(a.clickText, { exact: a.exact ?? false })
        .first()
        .click({ timeout: 8000 });
    else if ("fill" in a)
      await page
        .getByLabel(a.fill.label, { exact: a.fill.exact ?? false })
        .first()
        .fill(a.fill.value, { timeout: 8000 });
    else if ("fillPlaceholder" in a)
      await page
        .getByPlaceholder(a.fillPlaceholder.placeholder)
        .first()
        .fill(a.fillPlaceholder.value, { timeout: 8000 });
    else if ("select" in a)
      await page
        .getByLabel(a.select.label)
        .first()
        .selectOption({ label: a.select.option }, { timeout: 8000 });
    else if ("check" in a) await page.getByLabel(a.check.label).first().check({ timeout: 8000 });
    else if ("press" in a) await page.keyboard.press(a.press);
    else if ("scroll" in a) await page.mouse.wheel(0, a.scroll);
    else if ("hoverText" in a)
      await page
        .getByText(a.hoverText, { exact: a.exact ?? false })
        .first()
        .hover({ timeout: 8000 });
    else if ("wheel" in a) await page.mouse.wheel(a.wheel[0], a.wheel[1]);
    else if ("scrollToText" in a)
      await page
        .getByText(a.scrollToText, { exact: a.exact ?? false })
        .first()
        .scrollIntoViewIfNeeded({ timeout: 8000 });
    else if ("clickIn" in a)
      await page
        .getByRole(a.clickIn.region.role, { name: a.clickIn.region.name })
        .first()
        .getByRole(a.clickIn.role, { name: a.clickIn.name, exact: a.clickIn.exact ?? false })
        .first()
        .click({ timeout: 8000 });
    else if ("wait" in a) await page.waitForTimeout(Math.min(a.wait, 5000));
    else if ("snap" in a) {
      // Mid-run look at the screen, so a multi-step flow stays in one session.
      const k = readdirSync(`${DIR}/shots`).filter((f) => f.startsWith(persona + "-")).length + 1;
      const p = `${DIR}/shots/${persona}-${String(k).padStart(3, "0")}.png`;
      await page.screenshot({ path: p });
      const t = (
        await page
          .locator("body")
          .innerText()
          .catch(() => "")
      )
        .replace(/\n{2,}/g, "\n")
        .trim();
      const c = await page
        .evaluate(() =>
          [...document.querySelectorAll("button,a[href],input,select,textarea")]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            })
            .map(
              (el) =>
                `${el.tagName.toLowerCase()}${el.type && el.tagName === "INPUT" ? `[${el.type}]` : ""}: ${(el.getAttribute("aria-label") || el.innerText || el.value || el.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 70)}${el.disabled ? " [disabled]" : ""}`,
            ),
        )
        .then((l) => l.slice(0, a.snap.controls ?? 30));
      console.log(
        `--- SNAP ${a.snap.label ?? ""} ${page.url().replace(BASE, "")} ${p}\n${t.slice(0, a.snap.chars ?? 1200)}\n[controls] ${c.join(" | ")}\n`,
      );
    }
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  } catch (e) {
    errors.push(`action failed ${JSON.stringify(a)}: ${String(e.message).split("\n")[0]}`);
  }
}
const n = readdirSync(`${DIR}/shots`).filter((f) => f.startsWith(persona + "-")).length + 1;
const shot = `${DIR}/shots/${persona}-${String(n).padStart(3, "0")}.png`;
await page.screenshot({ path: shot, fullPage: false });
const text = (
  await page
    .locator("body")
    .innerText()
    .catch(() => "")
)
  .replace(/\n{3,}/g, "\n\n")
  .trim();
const controls = await page.evaluate(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const name = (el) =>
    (el.getAttribute("aria-label") || el.innerText || el.value || el.placeholder || el.title || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);
  const out = [];
  for (const el of document.querySelectorAll(
    "button,a[href],[role=tab],[role=button],[role=menuitem],input,select,textarea,[role=radio]",
  )) {
    if (!vis(el)) continue;
    const role = el.getAttribute("role") || el.tagName.toLowerCase();
    const label = el.labels?.[0]?.innerText?.trim().slice(0, 60);
    out.push(
      `${role}${el.type && el.tagName === "INPUT" ? `[${el.type}]` : ""}: ${name(el)}${label ? ` (label: ${label})` : ""}${el.disabled ? " [disabled]" : ""}`,
    );
  }
  return [...new Set(out)].slice(0, 120);
});
writeFileSync(`${DIR}/profiles/${persona}.url`, page.url());
console.log(`URL: ${page.url().replace(BASE, "")}`);
console.log(`SCREENSHOT: ${shot}`);
if (errors.length) console.log(`EVENTS:\n- ${errors.join("\n- ")}`);
console.log(`VISIBLE TEXT (${text.length} chars, first 6000):\n${text.slice(0, 6000)}`);
if (process.env.UX_FIND) {
  const re = new RegExp(process.env.UX_FIND, "i");
  console.log(
    `FIND /${process.env.UX_FIND}/:\n` +
      text
        .split("\n")
        .filter((l) => re.test(l))
        .join("\n"),
  );
}
console.log(`CONTROLS:\n${controls.join("\n")}`);
await ctx.close();
