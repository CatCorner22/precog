/** The decision in ./check-migrations-unchanged.mjs: only additions pass. */
import { describe, expect, it } from "vitest";
import { migrationEditProblems, renamedJsonProblem } from "./check-migrations-unchanged.mjs";

const RENAMED = '{"0003_b.sql":"0002_b.sql"}';

describe("migrationEditProblems", () => {
  it("passes an empty diff and added files", () => {
    expect(migrationEditProblems("")).toEqual([]);
    expect(migrationEditProblems("A\tmigrations/0033_new.sql\n")).toEqual([]);
  });

  it("names a modified, deleted or renamed migration", () => {
    const listing = [
      "M\tmigrations/0007_snapshot_value_proof.sql",
      "D\tmigrations/0008_map_share_privacy.sql",
      "R095\tmigrations/0009_business_revision.sql\tmigrations/0040_business_revision.sql",
      "A\tmigrations/0033_new.sql",
    ].join("\n");
    expect(migrationEditProblems(listing)).toEqual([
      "migrations/0007_snapshot_value_proof.sql: modified",
      "migrations/0008_map_share_privacy.sql: deleted",
      "migrations/0009_business_revision.sql -> migrations/0040_business_revision.sql: renamed",
    ]);
  });

  it("lets renamed.json gain keys but not lose or change one", () => {
    const listing = "M\tmigrations/renamed.json";
    const added = '{"0003_b.sql":"0002_b.sql","0005_c.sql":"0004_c.sql"}';
    expect(migrationEditProblems(listing, { renamedBefore: RENAMED, renamedAfter: added })).toEqual(
      [],
    );
    expect(
      migrationEditProblems(listing, { renamedBefore: RENAMED, renamedAfter: '{"x.sql":"y"}' }),
    ).toEqual(["migrations/renamed.json: removes or changes 0003_b.sql (only add keys)"]);
    expect(migrationEditProblems("D\tmigrations/renamed.json")).toEqual([
      "migrations/renamed.json: deleted",
    ]);
  });
});

describe("renamedJsonProblem", () => {
  it("refuses a changed value, invalid JSON and a non-object", () => {
    expect(renamedJsonProblem(RENAMED, '{"0003_b.sql":"other.sql"}')).toContain("0003_b.sql");
    expect(renamedJsonProblem(RENAMED, "{bad")).toBe("is not valid JSON");
    expect(renamedJsonProblem(RENAMED, "[]")).toBe("is not a JSON object");
    expect(renamedJsonProblem(null, RENAMED)).toBeNull();
  });
});
