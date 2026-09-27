/** Small string helpers shared across the domain, the importers and the UI. */

/** A URL- and id-safe token from free text: lower-case, hyphens, at most 40 characters. */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * A readable id from a name, `p-ana-ruiz`, made unique against `taken` by
 * adding -2, -3 and so on. A name with no letters or digits falls back to
 * `fallback`, so the id is never just the prefix.
 */
export function uniqueId(
  prefix: string,
  name: string,
  taken: ReadonlySet<string>,
  fallback = "item",
): string {
  const base = `${prefix}-${slug(name) || fallback}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** A unique id for things created in the browser, e.g. `proc_lx3k9a1b_4fz2qk`. */
export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * "a", "a and b", "a, b and c". With `max`, a longer list names the first
 * `max` and counts the rest: "Ana, Ben and 3 more". A list only one longer
 * than `max` is named in full, never "and 1 more".
 */
export function joinWithAnd(parts: readonly string[], max?: number): string {
  return joinList(parts, "and", max);
}

/** "a", "a or b", "a, b or c", and with `max` "Ana, Ben or 3 more": joinWithAnd for alternatives. */
export function joinWithOr(parts: readonly string[], max?: number): string {
  return joinList(parts, "or", max);
}

/** The phrase inside double quotes, as advice names a register entry or process: `"Payroll"`. */
export function quoted(name: string): string {
  return `"${name}"`;
}

/**
 * A label lower-cased for use mid-sentence ("Bank reconciliation" reads
 * "bank reconciliation", "A second person" reads "a second person"), unless
 * its first word is an acronym or a code ("ACH initiation", "A/R
 * write-offs", "X-ray").
 */
export function midSentence(label: string): string {
  return /^(?:[A-Z][a-z]|A\s)/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
}

/** "1 person", "3 people", "2 entries": the number and the noun that agrees with it. */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** The word that agrees with `n`: verb(1, "is", "are") is "is", verb(3, "is", "are") is "are". */
export function verb(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/** Short form of a name for advice wording: the first given name, skipping an honorific such as "Dr.". */
export function firstName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const given = parts.find((p) => !HONORIFIC.test(p));
  return given ?? parts[0] ?? "";
}

/**
 * The key two spellings of one person's name (or one title, id or token)
 * share: accents folded, case ignored, and everything but letters and digits
 * dropped. "José  Pérez" and "jose perez" share a key.
 */
export function nameKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** A job title (or other short label) for comparison: invisible controls removed, trimmed, lower-case, single spaces. */
export function titleKey(value: string): string {
  return stripInvisibleControls(value).trim().toLowerCase().replace(/\s+/g, " ");
}

/** The text with invisible and direction-changing control characters removed. */
export function stripInvisibleControls(value: string): string {
  return value.replace(INVISIBLE_CONTROLS, "");
}

/**
 * JSON with every object's keys in a fixed order, so two values with the same
 * content give the same text however their keys were written. For comparing
 * content, never for storing.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : entry,
  );
}

function joinList(parts: readonly string[], word: "and" | "or", max?: number): string {
  if (max !== undefined && parts.length > max + 1) {
    return `${parts.slice(0, max).join(", ")} ${word} ${parts.length - max} more`;
  }
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} ${word} ${parts[parts.length - 1]}`;
}

const HONORIFIC = /^(dr|mr|mrs|ms|mx|prof|rev)\.?$/i;

/**
 * Control characters that change how text around them is drawn or hide
 * inside it: C0 and C1 controls other than tab and line breaks, the
 * right-to-left and left-to-right marks, embeddings, overrides and isolates,
 * zero-width space, word joiner and a stray byte-order mark. A right-to-left
 * override in a pasted name reversed every sentence that named the person.
 * Zero-width joiners stay: some scripts need them.
 */
const INVISIBLE_CONTROLS =
  // eslint-disable-next-line no-control-regex -- matching control characters is the point.
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
