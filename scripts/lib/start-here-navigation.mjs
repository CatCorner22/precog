/**
 * Start here's section and task links must reveal and focus what they name,
 * not merely switch tabs. A synthetic browser-only register puts the sole
 * task past the first 25-row page. Runs in the tabs smoke, desktop and phone.
 */
export async function checkStartHereNavigation(page, baseUrl, timeout) {
  await page.goto(`${baseUrl}/robots.txt`, { waitUntil: "load", timeout });
  await page.evaluate(() => {
    const active = Object.keys(localStorage).find((key) =>
      key.endsWith(":precog.practiceProfile.v2"),
    );
    const portfolioKey = Object.keys(localStorage).find((key) =>
      key.endsWith(":precog.portfolio.v1"),
    );
    if (!active || !portfolioKey) throw new Error("Navigation fixture needs a loaded sample");
    const profile = JSON.parse(localStorage.getItem(active));
    profile.customPeople = [
      { id: "nav-owner", name: "Dana", role: "Owner", active: true },
      { id: "nav-staff", name: "Kim", role: "Team member", active: true },
    ];
    profile.customKnowledge = Array.from({ length: 27 }, (_, i) => ({
      id: `nav-task-${i}`,
      name: i === 26 ? "Navigation sole task" : `Navigation shared task ${i}`,
      kind: "duty",
      criticality: i === 26 ? "critical" : "important",
      category: "process",
      description: "Browser navigation fixture",
      linkedProcessIds: [],
      documented: false,
    }));
    profile.customRelations = profile.customKnowledge.flatMap((item, i) =>
      (i === 26 ? ["nav-staff"] : ["nav-owner", "nav-staff"]).map((personId) => ({
        personId,
        knowledgeId: item.id,
        level: "proficient",
      })),
    );
    profile.plannedAbsences = [];
    localStorage.setItem(active, JSON.stringify(profile));
    const portfolio = JSON.parse(localStorage.getItem(portfolioKey));
    portfolio[profile.businessId] = profile;
    localStorage.setItem(portfolioKey, JSON.stringify(portfolio));
  });

  async function visibleAndFocused(id) {
    await page.waitForFunction((wanted) => document.activeElement?.id === wanted, id, { timeout });
    const box = await page.locator(`#${id}`).boundingBox();
    const headerBottom = await page
      .locator("header")
      .first()
      .evaluate((el) => el.getBoundingClientRect().bottom);
    if (!box || box.y < headerBottom || box.y >= page.viewportSize().height) {
      throw new Error(`${id} is not revealed below the sticky header: ${JSON.stringify(box)}`);
    }
  }

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout });
    await page
      .getByRole("button", {
        name: "Open Who knows what: Navigation sole task",
        exact: true,
      })
      .click();
    await page.waitForURL(/[?&]item=nav-task-26/, { timeout });
    await visibleAndFocused("selected-knowledge");
    const detail = page.locator("#selected-knowledge");
    if (!(await detail.innerText()).includes("Navigation sole task")) {
      throw new Error("Task link revealed a different task");
    }
    // The target also appears in the editable register's current page.
    const grid = page.getByRole("table");
    await grid.getByRole("button", { name: "Navigation sole task", exact: true }).waitFor();
    if (await grid.getByRole("button", { name: "Navigation shared task 0", exact: true }).count()) {
      throw new Error("Task link left the register on its first page");
    }

    await page.goto(`${baseUrl}/?tab=knowledge&item=absences`, {
      waitUntil: "networkidle",
      timeout,
    });
    const markOut = page.getByRole("button", { name: "Kim out today", exact: true });
    if (await markOut.count()) await markOut.click();
    await page.getByRole("button", { name: "Kim is already out today", exact: true }).waitFor();
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout });
    await page.getByRole("button", { name: "Open today's stand-in sheet", exact: true }).click();
    await page.waitForURL(/[?&]item=absences/, { timeout });
    await visibleAndFocused("absences");
    console.log(
      `  ✓ Start here reveals and focuses its task and Today section at ${viewport.width}px`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
