import { count, verb } from "@/lib/precog/text";

/** The status line after an evidence import: what was added, replaced and left alone. */
export function importEvidenceMessage(
  result: { added: number; updated: number },
  itemsBefore: number,
): string {
  const unchanged = itemsBefore - result.updated;
  return [
    `Imported ${count(result.added + result.updated, "record")}: ${count(result.added, "new item")} added`,
    result.updated > 0 ? `, ${count(result.updated, "item")} with the same id replaced` : "",
    ".",
    unchanged > 0
      ? ` The ${count(unchanged, "other item")} ${verb(unchanged, "stays as it was", "stay as they were")}.`
      : "",
  ].join("");
}
