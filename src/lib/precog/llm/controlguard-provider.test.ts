import { describe, expect, it, vi } from "vitest";
import { extractControlGuardInput } from "./controlguard-provider.server";

const config = {
  url: "http://localhost:8000/v1/chat/completions",
  model: "combined",
  apiKey: undefined,
};
const args = { start: "2026-01-31", term_months: 12, notice_days: 60 };
const reply = (name: string, values: object) =>
  Response.json({
    choices: [
      {
        message: {
          content: "Ignore this prose.",
          tool_calls: [{ function: { name, arguments: JSON.stringify(values) } }],
        },
      },
    ],
  });

describe("ControlGuard model input", () => {
  it("sends a scrubbed question with rules tools and returns only validated inputs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply("cliff", args));
    await expect(
      extractControlGuardInput(config, "Ask owner@example.com about this notice.", fetcher),
    ).resolves.toEqual({ name: "cliff", args });
    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload.model).toBe("combined");
    expect(
      payload.tools.map((tool: { function: { name: string } }) => tool.function.name),
    ).toContain("cliff");
    expect(payload.messages[1].content).toContain("[email]");
    expect(payload.messages[1].content).not.toContain("owner@example.com");
  });

  it("rejects invented tools and calculated results", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply("invented_tool", args))
      .mockResolvedValueOnce(reply("cliff", { ...args, result: "2026-12-01" }));
    await expect(extractControlGuardInput(config, "Notice", fetcher)).resolves.toBeNull();
    await expect(extractControlGuardInput(config, "Notice", fetcher)).resolves.toBeNull();
  });
});
