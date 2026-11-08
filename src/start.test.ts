import { describe, expect, it } from "vitest";
import { RequestError } from "@/lib/request-errors";
import { requestErrorAdapter } from "./start";

describe("requestErrorAdapter", () => {
  it("carries a refusal's status and message across the transport", () => {
    const refused = new RequestError(401, "Unauthorized");
    expect(requestErrorAdapter.test(refused)).toBe(true);
    expect(requestErrorAdapter.test(new Error("Unauthorized"))).toBe(false);
    const restored = requestErrorAdapter.fromSerializable(
      JSON.parse(JSON.stringify(requestErrorAdapter.toSerializable(refused))),
    );
    expect(restored).toBeInstanceOf(RequestError);
    expect([restored.status, restored.message]).toEqual([401, "Unauthorized"]);
  });
});
