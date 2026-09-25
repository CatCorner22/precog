/** Small string helpers shared across the domain, the importers and the UI. */

/** A URL- and id-safe token from free text: lower-case, hyphens, at most 40 characters. */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** A short unique id for things created in the browser, e.g. `proc-lx3k9a1b`. */
export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** "a", "a and b", "a, b and c". */
export function joinWithAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
