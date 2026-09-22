/** current = revision stored server-side (null when no row); base = revision the client last loaded (null when it never loaded this business). */
export function isStaleSave(current: number | null, base: number | null): boolean {
  if (current === null) return false;
  return base === null || base !== current;
}
