export type Environment = Readonly<Record<string, string | undefined>>;

/** Values are never included in an error or log; only missing configuration names. */
export function productionConfigurationErrors(env: Environment): string[] {
  const production = env.VERCEL_ENV === "production" || env.PRECOG_RUNTIME_MODE === "production";
  if (!production) return [];
  const required = [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "GROK_AUTH_CLIENT_ID",
    "GROK_AUTH_CLIENT_SECRET",
  ];
  const errors = required.filter((key) => !env[key]?.trim()).map((key) => `${key} is required`);
  if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.trim().length < 32) {
    errors.push("BETTER_AUTH_SECRET must contain at least 32 characters");
  }
  if (env.VITE_AUTH_ENABLED === "false") errors.push("Authentication cannot be disabled in production");
  if (env.PRECOG_BUILD_TARGET && env.PRECOG_BUILD_TARGET !== "vercel") {
    errors.push("The configured production deployment must use the Vercel build target");
  }
  if (env.BETTER_AUTH_URL) {
    try {
      if (new URL(env.BETTER_AUTH_URL).protocol !== "https:") errors.push("BETTER_AUTH_URL must use HTTPS in production");
    } catch {
      errors.push("BETTER_AUTH_URL is not a valid URL");
    }
  }
  return errors;
}
