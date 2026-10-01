import { describe, expect, it, vi } from "vitest";
import { signOffWithNote } from "./report-versions-actions";

describe("signOffWithNote", () => {
  it("signs nothing off when the reviewer cancels the prompt", async () => {
    const send = vi.fn(async (note: string) => ({ note }));
    await expect(signOffWithNote(3, send, () => null)).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("signs off with an empty note on OK, and with the note when one is typed", async () => {
    const send = vi.fn(async (note: string) => ({ note }));
    await expect(signOffWithNote(3, send, () => "")).resolves.toEqual({ note: "" });
    await expect(signOffWithNote(3, send, () => "Tied to the ledger")).resolves.toEqual({
      note: "Tied to the ledger",
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("names the version in the question", async () => {
    const ask = vi.fn(() => null);
    await signOffWithNote(7, async () => undefined, ask);
    expect(ask).toHaveBeenCalledWith(expect.stringContaining("Sign off version 7 as reviewed?"));
  });
});
