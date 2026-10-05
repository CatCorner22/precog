import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECOVERY_DIALOG_TEXT } from "./workspace-recovery-dialog";

describe("the local recovery dialog", () => {
  it("names guest copy and legacy export in the title", () => {
    expect(RECOVERY_DIALOG_TEXT.title).toBe("Local recovery and guest work");
    expect(RECOVERY_DIALOG_TEXT.close).toBe("Close");
    const source = readFileSync(
      new URL("./workspace-recovery-dialog.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("WorkspaceRecoveryPanel");
    expect(source).toContain("showModal");
  });
});
