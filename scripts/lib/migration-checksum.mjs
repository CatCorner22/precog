/**
 * The checksum each migration ledger stores for an applied file: SHA-256 of
 * its text with CRLF line endings read as LF, so a checkout that converts
 * line endings does not look like an edit. Web Crypto, so the deploy migrator
 * (scripts/migrate-core.mjs) and the PGlite preview (src/lib/db.ts) share it.
 */
export async function migrationChecksum(source) {
  const bytes = new TextEncoder().encode(source.replace(/\r\n/g, "\n"));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The error for an applied file whose text no longer matches its ledger row. */
export function changedMigrationError(name) {
  return new Error(`migrations/${name} changed after it was applied; add a new migration instead`);
}
