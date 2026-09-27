import { afterEach, describe, expect, it, vi } from "vitest";
import { authTestEnvironment } from "./auth-test-env.mjs";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authTestEnvironment", () => {
  it("names DATABASE_URL when it is missing instead of failing on an invalid URL", () => {
    vi.stubEnv("PRECOG_AUTH_TEST", "1");
    vi.stubEnv("DATABASE_URL", "");
    expect(() => authTestEnvironment()).toThrow("Set DATABASE_URL");
  });

  it("accepts only the disposable local database and origin", () => {
    vi.stubEnv("PRECOG_AUTH_TEST", "1");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/precog");
    expect(() => authTestEnvironment()).toThrow("precog_safety_e2e");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/precog_safety_e2e");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:8080");
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32));
    expect(authTestEnvironment()).toMatchObject({ base: "http://localhost:8080" });
  });
});
