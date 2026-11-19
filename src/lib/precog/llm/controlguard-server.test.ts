import { expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({
  access: { userId: "u1", grok: "rate_limited" },
  spend: vi.fn().mockResolvedValue({ budget: "allowed" }),
  extract: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      validator: () => chain,
      handler:
        (handler: (input: { data: unknown; context: { llm: typeof seams.access } }) => unknown) =>
        ({ data }: { data?: unknown } = {}) =>
          handler({ data, context: { llm: seams.access } }),
    };
    return chain;
  },
}));
vi.mock("./middleware", () => ({ deterministicCheckMiddleware: {}, heavyLlmMiddleware: {} }));
vi.mock("./guard.server", () => ({ spendCallerDailyUnit: seams.spend }));
vi.mock("./controlguard-provider.server", () => ({
  controlguardProvider: () => ({ model: "combined" }),
  extractControlGuardInput: seams.extract,
}));

import {
  extractControlGuardFacts,
  readControlGuardReference,
  runControlGuardCheck,
} from "./controlguard-server";

it.each(["leave", "policy"] as const)("rejects missing or blank text for %s", async (name) => {
  for (const text of [undefined, "", " \t\n "]) {
    await expect(
      runControlGuardCheck({ data: { name, facts: JSON.stringify({ text }), entries: [] } }),
    ).resolves.toEqual({ error: "Enter text to check." });
  }
});

it("keeps a rate-limited draft on the manual path without spending a model unit", async () => {
  await expect(
    extractControlGuardFacts({ data: { prompt: "Find the notice date." } }),
  ).resolves.toBeNull();
  expect(seams.spend).not.toHaveBeenCalled();
  expect(seams.extract).not.toHaveBeenCalled();
});

it("returns readable catalog text, preserving currency and comparison thresholds", async () => {
  const catalogs = await readControlGuardReference();
  const text = Object.fromEntries(
    catalogs.flatMap(({ items }) => items.map((item) => [item.id, item.text])),
  );
  expect(text["TW-02"]).toContain("for example, multiple $49 write-offs under a $50 cap");
  expect(text["TW-02"]).toContain("within 72.0 hours");
  expect(text["TW-05"]).toContain("edit distance ≤ 2");
  expect(text["TW-05"]).toContain("Power $1.4M");
  for (const label of Object.values(text)) {
    expect(label).not.toMatch(/\\|[*\x60]|\$[^0-9]|\$$|\be\.g\.|\bshould\b/i);
  }
});

it.each([
  [10, 5.99, "59.90", "P2", "336"],
  [5, 6.98, "34.90", "P3", "—"],
  [6.103515625, 9.8304, "60.00", "P1", "48"],
])(
  "displays %s × %s without noise and keeps the right priority",
  async (impact, exploitability, score, priority, remediation) => {
    const response = await runControlGuardCheck({
      data: {
        name: "sod",
        entries: [],
        facts: JSON.stringify({
          subject: "Cash reviewer",
          asset_class: "Cash",
          vertices: ["custody", "reconciliation"],
          impact,
          exploitability,
        }),
      },
    });
    expect(response.result).toEqual(
      expect.arrayContaining([
        ["score", score],
        ["priority", priority],
        ["remediation hours", remediation],
      ]),
    );
  },
);
