import { describe, expect, it } from "vitest";
import fixtures from "./controlguard-fixtures.json";
import catalogs from "./controlguard-catalogs.json";
import { controlguardTools } from "./llm/controlguard-tools";
import { isControlGuardTool } from "./llm/controlguard-tool-info";
import { appendFridayEntry, readFridayLedger } from "./sod/controlguard-ledger";

describe("ControlGuard parity", () => {
  it.each(fixtures.cases.map((row, index) => ({ ...row, index })))(
    "$tool case $index",
    async (row) => {
      if (!isControlGuardTool(row.tool)) throw new Error("Unknown fixture tool.");
      const signoff = row.now
        ? await readFridayLedger(fixtures.entries, new Date(row.now))
        : undefined;
      expect(controlguardTools[row.tool].run(row.args, signoff)).toEqual(row.result);
    },
  );

  it("writes the same hash chain and rejects changed evidence", async () => {
    const [first, second] = fixtures.entries;
    const input = {
      subject: first.subject,
      control: first.control,
      signer: first.signer,
      actor: first.actor,
      cadence: first.cadence,
      artifact: first.artifact,
    };
    expect(await appendFridayEntry([], input, new Date(first.signed_at))).toEqual(first);
    expect(await appendFridayEntry([first], input, new Date(second.signed_at))).toEqual(second);
    await expect(
      readFridayLedger([first, { ...second, actor: "Changed" }], new Date(second.signed_at)),
    ).rejects.toThrow("Ledger verification failed");
  });

  it("carries all four spec reference catalogs", () => {
    expect(Object.values(catalogs).map((catalog) => Object.keys(catalog).length)).toEqual([
      19, 7, 12, 12,
    ]);
  });
});
