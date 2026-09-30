import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "@/lib/request-errors";
import { withExecutionHttpStatus } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("control execution client errors", () => {
  it("leaves successful responses and their bodies unchanged", async () => {
    const response = new Response("saved");
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetch);
    const result = await withExecutionHttpStatus(async (request) => {
      const received = await request("https://example.test/check", { method: "POST" });
      expect(received).toBe(response);
      return received.text();
    });
    expect(result).toBe("saved");
    expect(fetch).toHaveBeenCalledWith("https://example.test/check", { method: "POST" });
  });

  it.each([401, 409, 422])(
    "preserves HTTP %s after the RPC serializer drops custom fields",
    async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("encoded error", { status })));
      // The actual compiled handler serializes only the Error message, not its custom status.
      const message = "Inquiry alone cannot support this no-exception review.";
      const result = withExecutionHttpStatus(async (request) => {
        const response = await request("https://example.test/check");
        expect(await response.text()).toBe("encoded error");
        throw new Error(message);
      });
      await expect(result).rejects.toMatchObject({ name: "RequestError", status, message });
    },
  );

  it("does not invent confirmation or a client status for an offline failure", async () => {
    const offline = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(offline));
    await expect(
      withExecutionHttpStatus((request) => request("https://example.test/check")),
    ).rejects.toBe(offline);
  });

  it("does not classify a server failure as a known client rejection", async () => {
    const failure = new Error("Server failure");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("failed", { status: 500 })));
    await expect(
      withExecutionHttpStatus(async (request) => {
        await request("https://example.test/check");
        throw failure;
      }),
    ).rejects.toBe(failure);
  });

  it("keeps concurrent operation statuses isolated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input) =>
          new Response("encoded", { status: String(input).endsWith("conflict") ? 409 : 200 }),
      ),
    );
    let release: () => void = () => {};
    const later = new Promise<void>((resolve) => {
      release = resolve;
    });
    const conflict = withExecutionHttpStatus(async (request) => {
      await request("https://example.test/conflict");
      await later;
      throw new Error("Reload the changed check.");
    });
    const success = await withExecutionHttpStatus(async (request) => {
      const response = await request("https://example.test/success");
      return response.text();
    });
    expect(success).toBe("encoded");
    release();
    await expect(conflict).rejects.toBeInstanceOf(RequestError);
    await expect(conflict).rejects.toHaveProperty("status", 409);
  });
});
