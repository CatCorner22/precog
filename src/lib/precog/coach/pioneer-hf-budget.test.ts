import { afterEach, describe, expect, it, vi } from "vitest";
import { utcDateKey } from "../dates";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { readPioneerRequest, selectPioneerHighlights } from "./pioneer-answer";

const spend = vi.hoisted(() =>
  vi.fn(
    async (
      _loadSql: unknown,
      _userId: string,
      _limits: unknown,
      _purge: unknown,
      _address: string | null,
      _plan: string,
    ) => "spent" as const,
  ),
);

vi.mock("../llm/daily-usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../llm/daily-usage")>();
  return { ...actual, checkDailyBudget: spend };
});

describe("Voyager Hugging Face budget", () => {
  afterEach(() => {
    spend.mockClear();
    vi.unstubAllEnvs();
  });

  it("spends a daily unit before Hugging Face even when Grok may also run", async () => {
    vi.stubEnv("HF_TOKEN", "test-token");
    vi.stubEnv("XAI_API_KEY", "");
    const data = readPioneerRequest({
      question: "Who can pay a vendor alone?",
      profile: defaultProfile("dental") as never,
      today: utcDateKey(new Date()),
    });
    const res = await selectPioneerHighlights(data, { userId: "owner-1", grok: "allowed" });
    expect(spend).toHaveBeenCalled();
    expect(spend.mock.calls[0]?.[1]).toBe("owner-1");
    expect(["free", "paid"]).toContain(spend.mock.calls[0]?.[5]);
    expect(res.ok && res.ranker).toBeUndefined();
  });
});
