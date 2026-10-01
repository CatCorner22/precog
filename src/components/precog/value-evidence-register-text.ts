import { count, verb } from "@/lib/precog/text";

/** The status line after an evidence import: what was added, replaced and left alone. */
export function importEvidenceMessage(
  result: { added: number; updated: number },
  itemsBefore: number,
): string {
  const unchanged = itemsBefore - result.updated;
  const done = [
    result.added > 0 ? `added ${count(result.added, "new item")}` : "",
    result.updated > 0 ? `replaced ${count(result.updated, "item")} with the same id` : "",
  ].filter(Boolean);
  return [
    `Precog imported ${count(result.added + result.updated, "record")}`,
    done.length ? `: it ${done.join(" and ")}` : "",
    ".",
    unchanged > 0
      ? ` The ${count(unchanged, "other item")} ${verb(unchanged, "stays as it was", "stay as they were")}.`
      : "",
  ].join("");
}
