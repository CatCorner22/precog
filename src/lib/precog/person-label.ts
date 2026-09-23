/**
 * "Linda Faulkner (Bookkeeper, PT)": a person and their job title, for
 * sentences that name someone. A title's own brackets ("Bookkeeper (PT)")
 * become a comma, so the label never nests one bracket inside another.
 */
export function personLabel(name: string, role: string): string {
  return `${name} (${flatRole(role)})`;
}

/** A job title with its bracketed parts read as comma-separated: "Bookkeeper (PT)" is "Bookkeeper, PT". */
export function flatRole(role: string): string {
  return role
    .replace(/\s*[([]\s*([^()[\]]*?)\s*[)\]]/g, (_, inner: string) => (inner ? `, ${inner}` : ""))
    .replace(/^,\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
