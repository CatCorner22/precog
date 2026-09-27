import { afterEach, describe, expect, it, vi } from "vitest";
import { openSafetyDb } from "./safety-db";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("openSafetyDb on PostgreSQL", () => {
  it("names DATABASE_URL when it is missing instead of failing on an invalid URL", async () => {
    vi.stubEnv("PRECOG_LIFECYCLE_POSTGRES", "1");
    vi.stubEnv("DATABASE_URL", "");
    await expect(openSafetyDb()).rejects.toThrow("Set DATABASE_URL");
  });

  it("refuses a database that is not local", async () => {
    vi.stubEnv("PRECOG_LIFECYCLE_POSTGRES", "1");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@db.example.com/prod");
    await expect(openSafetyDb()).rejects.toThrow("isolated local PostgreSQL");
  });
});
