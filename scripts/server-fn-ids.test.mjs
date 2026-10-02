/**
 * Server-function ids come from each function's file path and export name. An
 * open tab keeps calling the ids it loaded with, so moving or renaming a
 * server-function file makes every save from an open tab fail ("Not found")
 * until the user reloads. This test holds the source to the committed
 * snapshot in ./server-fn-ids.json: a lost or changed id fails, and so does a
 * new one until the snapshot is refreshed with `npm run update:server-fn-ids`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SNAPSHOT, collectServerFnIds } from "./update-server-fn-ids.mjs";

const MOVED =
  "Moving or renaming a server-function file (or its export) changes its id, and every open tab then fails to save until it reloads. Keep the file and export where they are.";
const REFRESH = "Run `npm run update:server-fn-ids` and commit scripts/server-fn-ids.json.";

describe("server-function ids", () => {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const current = collectServerFnIds();

  it("keeps every id in the snapshot", () => {
    const lost = Object.entries(snapshot)
      .filter(([key, id]) => current[key] !== id)
      .map(([key]) => key);
    expect(
      lost,
      `${MOVED} Lost or changed: ${lost.join(", ")}. To remove a server function on purpose: ${REFRESH}`,
    ).toEqual([]);
  });

  it("has every current id in the snapshot", () => {
    const added = Object.keys(current).filter((key) => !(key in snapshot));
    expect(added, `New server functions: ${added.join(", ")}. ${REFRESH}`).toEqual([]);
  });

  it("finds the server functions the e2e scripts address", () => {
    expect(current["src/lib/precog/profile-server.ts#saveBusinessProfile"]).toBe(
      "24564b6e975ab453340542f84b412687c3e372c5735c46c5ddad219ed6120435",
    );
  });
});
