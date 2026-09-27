/** A server environment variable, trimmed; undefined when unset or blank. */
export function env(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}
