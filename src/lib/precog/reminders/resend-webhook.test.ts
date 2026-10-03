import { describe, expect, it } from "vitest";
import {
  parseResendEvent,
  signSvixPayload,
  suppressionsFrom,
  verifySvixSignature,
} from "./resend-webhook";

// A signing secret in Resend's shape: "whsec_" and a base64 key.
const SECRET = `whsec_${btoa("a-test-signing-key-of-some-length")}`;
const NOW = 1_760_000_000;

async function signed(payload: string, id = "msg_1", timestamp = NOW) {
  const sig = await signSvixPayload(SECRET, id, timestamp, payload);
  return { id, timestamp: String(timestamp), signature: `v1,${sig}` };
}

describe("svix signatures", () => {
  const payload = JSON.stringify({ type: "email.bounced", data: { to: ["a@x.test"] } });

  it("accepts a fresh signature made with the secret", async () => {
    expect(await verifySvixSignature(payload, await signed(payload), SECRET, NOW)).toBe(true);
  });

  it("accepts any v1 entry in a space-separated header, and only a v1 entry", async () => {
    const good = await signed(payload);
    const several = {
      ...good,
      signature: `v1,AAAA v2,${good.signature.slice(3)} ${good.signature}`,
    };
    expect(await verifySvixSignature(payload, several, SECRET, NOW)).toBe(true);
    const wrongVersion = { ...good, signature: `v2,${good.signature.slice(3)}` };
    expect(await verifySvixSignature(payload, wrongVersion, SECRET, NOW)).toBe(false);
  });

  it("rejects a different payload, id, secret or a missing header", async () => {
    const good = await signed(payload);
    expect(await verifySvixSignature(`${payload} `, good, SECRET, NOW)).toBe(false);
    expect(await verifySvixSignature(payload, { ...good, id: "msg_2" }, SECRET, NOW)).toBe(false);
    expect(await verifySvixSignature(payload, good, `whsec_${btoa("other")}`, NOW)).toBe(false);
    expect(await verifySvixSignature(payload, { ...good, signature: null }, SECRET, NOW)).toBe(
      false,
    );
    expect(await verifySvixSignature(payload, { ...good, id: null }, SECRET, NOW)).toBe(false);
    expect(await verifySvixSignature(payload, good, "whsec_not*base64", NOW)).toBe(false);
  });

  it("rejects a stale timestamp and a timestamp that is not a number", async () => {
    const old = await signed(payload, "msg_1", NOW - 301);
    expect(await verifySvixSignature(payload, old, SECRET, NOW)).toBe(false);
    const recent = await signed(payload, "msg_1", NOW - 299);
    expect(await verifySvixSignature(payload, recent, SECRET, NOW)).toBe(true);
    const text = { ...(await signed(payload)), timestamp: "soon" };
    expect(await verifySvixSignature(payload, text, SECRET, NOW)).toBe(false);
  });
});

describe("resend events", () => {
  it("reads the type, the recipients, the email id and the bounce type", () => {
    const event = parseResendEvent(
      JSON.stringify({
        type: "email.bounced",
        created_at: "2026-10-03T10:00:00.000Z",
        data: {
          email_id: "em_1",
          to: ["dead@shop.test", 42, "second@shop.test"],
          bounce: { type: "Permanent", subType: "General" },
        },
      }),
    );
    expect(event).toEqual({
      type: "email.bounced",
      emailId: "em_1",
      to: ["dead@shop.test", "second@shop.test"],
      bounceType: "Permanent",
    });
  });

  it("returns null for a malformed delivery", () => {
    expect(parseResendEvent("not json")).toBeNull();
    expect(parseResendEvent(JSON.stringify({ data: {} }))).toBeNull();
    expect(parseResendEvent(JSON.stringify(null))).toBeNull();
    expect(parseResendEvent(JSON.stringify({ type: "email.sent" }))).toEqual({
      type: "email.sent",
      emailId: null,
      to: [],
      bounceType: null,
    });
  });

  it("stops every recipient of a permanent bounce or a complaint, nobody for a transient bounce", () => {
    const to = ["a@shop.test", "b@shop.test"];
    expect(
      suppressionsFrom({ type: "email.bounced", emailId: null, to, bounceType: "Permanent" }),
    ).toEqual([
      { email: "a@shop.test", reason: "bounced" },
      { email: "b@shop.test", reason: "bounced" },
    ]);
    // Resend gave no classification: treated as a hard bounce.
    expect(
      suppressionsFrom({ type: "email.bounced", emailId: null, to, bounceType: null }),
    ).toHaveLength(2);
    expect(
      suppressionsFrom({ type: "email.bounced", emailId: null, to, bounceType: "Transient" }),
    ).toEqual([]);
    expect(
      suppressionsFrom({ type: "email.complained", emailId: "em_2", to, bounceType: null }),
    ).toEqual([
      { email: "a@shop.test", reason: "complained" },
      { email: "b@shop.test", reason: "complained" },
    ]);
    expect(
      suppressionsFrom({ type: "email.delivered", emailId: null, to, bounceType: null }),
    ).toEqual([]);
  });
});
