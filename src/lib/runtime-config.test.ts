import { describe, expect, it } from "vitest";
import { productionConfigurationErrors } from "./runtime-config";

describe("production configuration", () => {
  it("permits isolated local development without production credentials", () => {
    expect(productionConfigurationErrors({})).toEqual([]);
  });
  it("refuses production fallback and disabled authentication", () => {
    const errors = productionConfigurationErrors({ VERCEL_ENV: "production", VITE_AUTH_ENABLED: "false" });
    expect(errors).toContain("DATABASE_URL is required");
    expect(errors).toContain("Authentication cannot be disabled in production");
  });
  it("accepts explicit production configuration without exposing values", () => {
    const env = {
      VERCEL_ENV: "production",
      DATABASE_URL: "postgresql://unused.example/test",
      BETTER_AUTH_SECRET: "s".repeat(40),
      BETTER_AUTH_URL: "https://example.test",
      GROK_AUTH_CLIENT_ID: "fixture",
      GROK_AUTH_CLIENT_SECRET: "fixture-secret",
    };
    expect(productionConfigurationErrors(env)).toEqual([]);
    expect(productionConfigurationErrors({ ...env, BETTER_AUTH_URL: "http://example.test" })).toEqual([
      "BETTER_AUTH_URL must use HTTPS in production",
    ]);
  });
});
