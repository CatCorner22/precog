import { describe, expect, it } from "vitest";
import { RequestError } from "@/lib/request-errors";
import { newProcedure, newStep, verifyProcedure, withProcedureEdit } from "./lifecycle";
import type { Procedure } from "./types";
import {
  assertVerificationsAllowed,
  newVerifications,
  PREPARER_CANNOT_VERIFY,
  VERIFICATION_ACCOUNT_MISMATCH,
  type SaverRole,
} from "./verify-guard";

const TODAY = "2026-09-28";
const written = (id = "proc-1"): Procedure =>
  newProcedure(
    { id, industry: "general", title: "Make the deposit", steps: [newStep("Count the drawer.")] },
    "2026-09-01",
  );
const profileWith = (...procedures: unknown[]) => ({ procedures });
const ada = { id: "user-ada", name: "Ada Owner" };

function refusal(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(RequestError);
    expect((err as RequestError).status).toBe(403);
    return (err as Error).message;
  }
}

function save(previous: unknown, next: unknown, saverRole: SaverRole, saverId = ada.id) {
  return refusal(() =>
    assertVerificationsAllowed({
      previousProfile: previous,
      nextProfile: next,
      saverId,
      saverRole,
    }),
  );
}

describe("recording who verified", () => {
  it("stamps the account that pressed the button, and drops a stale stamp when signed out", () => {
    const stamped = verifyProcedure(written(), "owner", TODAY, ada);
    expect([stamped.verifiedByAccountId, stamped.verifiedByAccountName]).toEqual([
      "user-ada",
      "Ada Owner",
    ]);
    const again = verifyProcedure(stamped, "owner", TODAY, null);
    expect(again.verifiedByAccountId).toBeUndefined();
    expect(again.verifiedByAccountName).toBeUndefined();
  });

  it("clears the stamp with the verification when the steps change, and keeps it otherwise", () => {
    const stamped = verifyProcedure(written(), "owner", TODAY, ada);
    const relinked = withProcedureEdit(stamped, { ...stamped, knowledgeIds: ["k1"] }, TODAY);
    expect(relinked.verifiedByAccountId).toBe("user-ada");
    const edited = withProcedureEdit(
      stamped,
      { ...stamped, steps: [newStep("Count the drawer twice.")] },
      TODAY,
    );
    expect(edited.verifiedAt).toBeUndefined();
    expect(edited.verifiedByAccountId).toBeUndefined();
    expect(edited.verifiedByAccountName).toBeUndefined();
  });
});

describe("who may verify, checked when the business is saved", () => {
  const before = profileWith(written());
  const after = profileWith(verifyProcedure(written(), "owner", TODAY, ada));

  it("lets an owner outside any firm, a firm owner and a firm reviewer verify", () => {
    for (const role of [null, "owner", "reviewer"] as const) {
      expect(save(before, after, role)).toBeNull();
    }
  });

  it("refuses a firm preparer, for a new business as well as a stored one", () => {
    expect(save(before, after, "preparer")).toBe(PREPARER_CANNOT_VERIFY);
    expect(save(null, after, "preparer")).toBe(PREPARER_CANNOT_VERIFY);
    const unstamped = profileWith(verifyProcedure(written(), "owner", TODAY));
    expect(save(before, unstamped, "preparer")).toBe(PREPARER_CANNOT_VERIFY);
  });

  it("lets a preparer save anything else, stored verifications included", () => {
    const edited = profileWith({
      ...verifyProcedure(written(), "owner", TODAY, ada),
      knowledgeIds: ["k1"],
    });
    expect(save(after, edited, "preparer", "user-pat")).toBeNull();
    expect(save(after, profileWith(), "preparer", "user-pat")).toBeNull();
  });

  it("refuses a verification stamped with another account", () => {
    expect(save(before, after, "reviewer", "user-rex")).toBe(VERIFICATION_ACCOUNT_MISMATCH);
  });

  it("treats a verification made again, or credited to someone else, as new", () => {
    const v = verifyProcedure(written(), "owner", "2026-09-01", ada);
    expect(newVerifications(profileWith(v), profileWith({ ...v, verifiedAt: TODAY }))).toHaveLength(
      1,
    );
    expect(newVerifications(profileWith(v), profileWith({ ...v, verifiedBy: "p2" }))).toHaveLength(
      1,
    );
    expect(newVerifications(profileWith(v), profileWith(v))).toHaveLength(0);
  });

  it("sees a verification however the JSON hides it, as the app would show it", () => {
    const v = verifyProcedure(written(), "owner", TODAY);
    // A first entry the app drops (no title) followed by the verified copy.
    const repeated = profileWith({ id: v.id, industry: "general" }, v);
    expect(save(before, repeated, "preparer")).toBe(PREPARER_CANNOT_VERIFY);
    // Padded id, and a date after today that the app would show once it arrives.
    const padded = profileWith({ ...v, id: ` ${v.id} `, verifiedAt: "2027-01-01" });
    expect(save(before, padded, "preparer")).toBe(PREPARER_CANNOT_VERIFY);
  });

  it("ignores junk the app would not show as a verification", () => {
    const junk = [
      null,
      "text",
      { ...written(), verifiedAt: 20260928 },
      { ...written("x"), verifiedAt: "not a day" },
    ];
    expect(save(before, profileWith(...junk), "preparer")).toBeNull();
    expect(save(before, { procedures: "nope" }, "preparer")).toBeNull();
  });
});
