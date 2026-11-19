import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const refreshScript = fileURLToPath(new URL("./refresh_reference.py", import.meta.url));

describe("practice reference refresh", () => {
  it("preserves GitHub anchor separators and indexes grouped citation keys", () => {
    const directory = mkdtempSync(join(tmpdir(), "refresh-reference-"));
    const path = join(directory, "reference.md");
    writeFileSync(
      path,
      [
        "<!-- toc:start -->",
        "<!-- toc:end -->",
        "<!-- authorities:start -->",
        "<!-- authorities:end -->",
        "<!-- index:start -->",
        "<!-- index:end -->",
        "<!-- health:start -->",
        "<!-- health:end -->",
        "## [01] SOP — index",
        "Grouped sources: [S1; S3 at 4] and [S1, S2].",
        "## [02] Sources",
        "- [S1] Source one. https://example.com/one",
        "- [S2] Source two. https://example.com/two",
      ].join("\n"),
    );

    try {
      const result = spawnSync("python3", [refreshScript, path, "--check"], {
        encoding: "utf8",
      });
      const refreshed = readFileSync(path, "utf8");
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(refreshed).toContain("[01 SOP — index](#01-sop--index)");
      expect(refreshed).toContain("- [S1] Source one → §01");
      expect(refreshed).toContain("- [S2] Source two → §01");
      expect(refreshed).toContain("Undefined cite key [S3] used in §01");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
