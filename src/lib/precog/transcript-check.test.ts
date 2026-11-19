import { describe, expect, it } from "vitest";
import { compareTranscripts, MAX_TRANSCRIPT_CHARS } from "./transcript-check";

describe("deterministic transcript wording check", () => {
  it.each([
    ["I did pay.", "I did not pay.", "negation"],
    ["I never paid.", "I paid.", "negation"],
    ["No funds moved.", "Funds moved.", "negation"],
    ["I didn't pay.", "I did pay.", "negation"],
    ["I can’t pay.", "I can pay.", "negation"],
    ["I paid $100.", "I paid $101.", "amount"],
    ["I paid 100€.", "I paid 100£.", "amount"],
    ["100€ - cash", "100£ - cash", "amount"],
    ["100€ + fees", "100£ + fees", "amount"],
    ["I paid 100€.", "I paid 100.", "amount"],
    ["There were 12 files.", "There were 13 files.", "amount"],
    ["I paid -$100.", "I paid $100.", "amount"],
    ["I paid ($100).", "I paid $100.", "amount"],
    ["I paid (100).", "I paid 100.", "amount"],
    ["I paid 9007199254740992.01.", "I paid 9007199254740992.02.", "amount"],
    ["I paid -1e-2.", "I paid 1e-2.", "amount"],
    ["On 2026-11-19 we met.", "On 2026-11-20 we met.", "date"],
    ["On November 19, 2026 we met.", "On November 20, 2026 we met.", "date"],
    ["We met Monday.", "We met Tuesday.", "date"],
    ["I met Alice.", "I met Bob.", "name"],
    ["Alice paid.", "Bob paid.", "name"],
    ["I met José.", "I met María.", "name"],
  ] as const)("finds %s versus %s as %s", (a, b, kind) => {
    expect(compareTranscripts(a, b).map((d) => d.kind)).toContain(kind);
  });
  it.each([
    ["Alice did not pay $1,234.50 on 2026-11-19.", "Alice did not pay $1,234.50 on 2026-11-19."],
    ["Alice, did not pay $1,234.50!", "  alice DID\nNOT pay $1234.500  "],
    ["I didn’t pay.", "i did not pay"],
    ["I cannot pay.", "I can't pay."],
    ["I won't pay.", "I will not pay."],
    ["On November 19, 2026.", "on 2026/11/19"],
    ["On 19 Nov 2026.", "On 11/19/2026."],
    ["We paid 1e3.", "We paid 1000.00."],
    ["We paid €100.", "We paid 100€."],
    ["We paid €100.", "We paid 100 €."],
    ["We paid €100.", "We paid 100\t€."],
    ["Invoice 1\n$100", "Invoice 1: $100"],
    ["Invoice 1 $100", "Invoice 1: $100"],
    ["Invoice 1 $-100", "Invoice 1: $-100"],
    ["Invoice 1 $ .50", "Invoice 1: $ .50"],
    ["We paid (100).", "We paid -100."],
    ["We paid ($100).", "We paid -$100."],
    ["We paid (100 €).", "We paid -€100."],
    ["We paid -1e-2.", "We paid -.0100."],
    ["We paid one hundred and twenty-three dollars.", "We paid $123.00."],
    ["We counted one thousand and two files.", "We counted 1002 files."],
    ["one and two", "1 and 2"],
    ["The balance was -0.00.", "the balance was 0"],
    ["", ""],
  ])("ignores identical values and presentation noise: %s", (a, b) =>
    expect(compareTranscripts(a, b)).toEqual([]),
  );
  it("compares locations, not global bags of critical tokens", () => {
    const result = compareTranscripts(
      "Alice paid $100; Bob paid $200.",
      "Alice paid $200; Bob paid $100.",
    );
    expect(result.filter((d) => d.kind === "amount")).toHaveLength(2);
  });
  it("does not transfer a following amount's currency across a line break", () => {
    const a = "We paid 100\n€200",
      b = "We paid €100\n200";
    const amounts = compareTranscripts(a, b).filter((d) => d.kind === "amount");
    expect(amounts).toHaveLength(2);
    expect(amounts.map((d) => a.slice(d.transcript.start, d.transcript.end))).toEqual([
      "100",
      "€200",
    ]);
    expect(amounts.map((d) => b.slice(d.reference.start, d.reference.end))).toEqual([
      "€100",
      "200",
    ]);
  });
  it("retains raw excerpts, exact offsets, line/column and empty insertion points", () => {
    const a = "First line.\nI paid $100 to Alice.",
      b = "First line.\nI did not pay $200 to Bob.";
    const found = compareTranscripts(a, b);
    const amount = found.find((d) => d.kind === "amount")!;
    expect(a.slice(amount.transcript.start, amount.transcript.end)).toBe("$100");
    expect(b.slice(amount.reference.start, amount.reference.end)).toBe("$200");
    expect(amount.transcript).toMatchObject({
      line: 2,
      column: 8,
      snippet: expect.stringContaining("I paid $100 to Alice."),
    });
    const insertion = compareTranscripts("I did pay.", "I did not pay.")[0];
    expect(insertion.transcript.start).toBe(insertion.transcript.end);
    expect(compareTranscripts("", "Alice paid $1").map((d) => d.kind)).toEqual(["name", "amount"]);
  });
  it("keeps complete words at both excerpt edges and marks clipped context", () => {
    const prefix = "Outside the excerpt. " + "extraordinarilylongcontextword ".repeat(3);
    const suffix =
      " " + "anotherextraordinarilylongcontextword ".repeat(3) + "Outside the excerpt.";
    const a = `${prefix}$100${suffix}`,
      b = `${prefix}$200${suffix}`;
    const [difference] = compareTranscripts(a, b);
    expect(difference.transcript.snippet).toBe(
      "… extraordinarilylongcontextword extraordinarilylongcontextword $100 anotherextraordinarilylongcontextword …",
    );
    expect(a.slice(difference.transcript.start, difference.transcript.end)).toBe("$100");
    expect(compareTranscripts("Paid $100.", "Paid $200.")[0].transcript.snippet).toBe("Paid $100.");
  });
  it("is deterministic over repeated words and never mutates input", () => {
    const a = "I said no. I said yes. Alice paid $100.",
      b = "I said yes. I said no. Alice paid $101.";
    expect(compareTranscripts(a, b)).toEqual(compareTranscripts(a, b));
    expect(a).toBe("I said no. I said yes. Alice paid $100.");
  });
  it("allows the exact size cap, refuses either side beyond it", () => {
    const text = "x".repeat(MAX_TRANSCRIPT_CHARS);
    expect(compareTranscripts(text, text)).toEqual([]);
    expect(() => compareTranscripts(`${text}x`, "")).toThrow("200,000 characters");
    expect(() => compareTranscripts("", `${text}x`)).toThrow("200,000 characters");
  });
  it("bounds divergent alignment rather than returning a partial comparison", () => {
    const a = Array.from({ length: 2000 }, (_, i) => `a${i}`).join(" ");
    const b = Array.from({ length: 2000 }, (_, i) => `b${i + 4000}`).join(" ");
    expect(() => compareTranscripts(a, b)).toThrow("no partial result");
  });
});
