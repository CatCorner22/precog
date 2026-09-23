import { describe, expect, it, vi } from "vitest";
import { HEALTH_ALLOWED_METHODS, healthMethodNotAllowed, healthResponse } from "./health";

describe("/api/health responses", () => {
  it("reports ok without naming the database backend", async () => {
    const res = await healthResponse(async () => undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(typeof body.latencyMs).toBe("number");
    expect(Object.keys(body).sort()).toEqual(["latencyMs", "ok"]);
    expect(JSON.stringify(body)).not.toMatch(/pglite|neon|postgres/i);
  });

  it("answers 503 when the database check fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await healthResponse(async () => {
      throw new Error("connection refused");
    });
    quiet.mockRestore();
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/connection refused|pglite|neon/i);
  });

  it("refuses other methods with 405 and an Allow header", async () => {
    const res = healthMethodNotAllowed();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe(HEALTH_ALLOWED_METHODS);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});
