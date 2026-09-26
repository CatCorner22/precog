/**
 * Server-function ids for the production build. vite.config.ts hands
 * `serverFunctionId` to TanStack Start (`serverFns.generateFunctionId`), so
 * the id scheme belongs to this repository rather than to the bundle's chunk
 * names and formatting, and the compiled-server e2e computes the id of a
 * server function from its file and export name. The formula is TanStack's
 * default, so taking it over changed no id.
 */
import { createHash } from "node:crypto";

/** TanStack Start names each server function's handler `<export>_createServerFn_handler`. */
const HANDLER_SUFFIX = "_createServerFn_handler";

/** The id of a compiled server function, given TanStack's file and handler name. */
export function serverFunctionId({ filename, functionName }) {
  return createHash("sha256").update(`${filename}--${functionName}`).digest("hex");
}

/** The id of `export const <exportName> = createServerFn()...` in `filename` (relative to the repo root). */
export function serverFunctionIdOf(filename, exportName) {
  return serverFunctionId({ filename, functionName: `${exportName}${HANDLER_SUFFIX}` });
}
