import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { askedAfter, DigestStateProvider, useDigestState, weeklyDigestAfter } from "./digest-state";

function Probe() {
  const { change } = useDigestState();
  return <span>{change ? `changed:${change.weeklyDigest}` : "unchanged"}</span>;
}

describe("the digest state shared by the header switch and the one-time question", () => {
  it("shows the loaded settings until something on the page changes them", () => {
    expect(askedAfter(null, false)).toBe(false);
    expect(askedAfter(null, true)).toBe(true);
    expect(weeklyDigestAfter(null, false)).toBe(false);
    expect(weeklyDigestAfter(null, true)).toBe(true);
  });

  it("lets an answer or a flip on this page win over what loaded", () => {
    // "Yes, weekly" on the question: the header reads on, the question is answered.
    expect(weeklyDigestAfter({ asked: true, weeklyDigest: true }, false)).toBe(true);
    expect(askedAfter({ asked: true, weeklyDigest: true }, false)).toBe(true);
    // The header switch flipped off: the question stays hidden.
    expect(weeklyDigestAfter({ asked: true, weeklyDigest: false }, true)).toBe(false);
    expect(askedAfter({ asked: true, weeklyDigest: false }, false)).toBe(true);
  });

  it("starts with no change, inside and outside the provider", () => {
    expect(
      renderToStaticMarkup(
        <DigestStateProvider>
          <Probe />
        </DigestStateProvider>,
      ),
    ).toContain("unchanged");
    expect(renderToStaticMarkup(<Probe />)).toContain("unchanged");
  });
});
