import { describe, expect, it } from "vitest";
import { RequestError } from "@/lib/request-errors";
import {
  newProcedure,
  newStep,
  verificationsAsHeld,
  verifyProcedure,
  withoutOthersVerifications,
  withProcedureEdit,
} from "./lifecycle";
import type { Procedure } from "./types";
import {
  assertVerificationsAllowed,
  newVerifications,
  PREPARER_CANNOT_VERIFY,
  VERIFICATION_ACCOUNT_MISMATCH,
  WRITING_BLOCKS_VERIFICATION,
  type SaverRole,
} from "./verify-guard";

const TODAY = "2026-09-28";
/** The latest day a client may claim on TODAY (see latestClientDay). */
const LATEST = "2026-09-29";
const written = (id = "proc-1"): Procedure =>
  newProcedure(
    {
      id,
      industry: "general",
      title: "Make the deposit",
      purpose: "Gets the day's cash to the bank. Done when the bank shows the deposit.",
      trigger: "Every day at close",
      module: "Front-office safe",
      steps: [newStep("Count the drawer.")],
    },
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

function save(
  previous: unknown,
  next: unknown,
  saverRole: SaverRole,
  saverId = ada.id,
  saverNames = [ada.name, "ada@example.test"],
) {
  return refusal(() =>
    assertVerificationsAllowed({
      previousProfile: previous,
      nextProfile: next,
      saverId,
      saverRole,
      saverNames,
      latestDay: LATEST,
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
    const fresh = (next: unknown) => newVerifications(profileWith(v), next, LATEST).length;
    expect(fresh(profileWith({ ...v, verifiedAt: TODAY }))).toBe(1);
    expect(fresh(profileWith({ ...v, verifiedBy: "p2" }))).toBe(1);
    expect(fresh(profileWith(v))).toBe(0);
  });

  it("sees a verification however the JSON hides it, as the app would show it", () => {
    const v = verifyProcedure(written(), "owner", TODAY);
    // A first entry the app drops (no title) followed by the verified copy.
    const repeated = profileWith({ id: v.id, industry: "general" }, v);
    expect(save(before, repeated, "preparer")).toBe(PREPARER_CANNOT_VERIFY);
    // A padded id reads as the same procedure.
    const padded = profileWith({ ...v, id: ` ${v.id} ` });
    expect(save(before, padded, "preparer")).toBe(PREPARER_CANNOT_VERIFY);
  });

  it("refuses a preparer who keeps a verification on steps they changed", () => {
    const verified = verifyProcedure(written(), "owner", TODAY, ada);
    const rewritten = { ...verified, steps: [newStep("Pay account 999 at another bank.")] };
    expect(save(profileWith(verified), profileWith(rewritten), "preparer", "user-pat")).toBe(
      PREPARER_CANNOT_VERIFY,
    );
    const moved = { ...verified, module: "Payments › Wire" };
    expect(save(profileWith(verified), profileWith(moved), "preparer", "user-pat")).toBe(
      PREPARER_CANNOT_VERIFY,
    );
  });

  it("checks the recorded-by name: a preparer cannot rename it, and a stamp needs the saver's own name", () => {
    const verified = verifyProcedure(written(), "owner", TODAY, ada);
    const renamed = { ...verified, verifiedByAccountName: "Olga Owner, CPA" };
    expect(save(profileWith(verified), profileWith(renamed), "preparer", "user-pat")).toBe(
      PREPARER_CANNOT_VERIFY,
    );
    const underOtherName = profileWith(
      verifyProcedure(written(), "owner", TODAY, { id: ada.id, name: "Olga Owner, CPA" }),
    );
    expect(save(before, underOtherName, "owner")).toBe(VERIFICATION_ACCOUNT_MISMATCH);
    const underEmail = profileWith(
      verifyProcedure(written(), "owner", TODAY, { id: ada.id, name: "ada@example.test" }),
    );
    expect(save(before, underEmail, "owner")).toBeNull();
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

describe("the writing standards on the server", () => {
  it("refuses a new verification of a procedure whose writing has errors (422)", () => {
    const loose = verifyProcedure(
      { ...written(), steps: [newStep("The drawer is counted.")] },
      "owner",
      TODAY,
      ada,
    );
    let status = 0;
    let message = "";
    try {
      assertVerificationsAllowed({
        previousProfile: profileWith(written()),
        nextProfile: profileWith(loose),
        saverId: ada.id,
        saverRole: null,
        saverNames: [ada.name],
        latestDay: LATEST,
      });
    } catch (err) {
      status = (err as RequestError).status;
      message = (err as Error).message;
    }
    expect([status, message]).toEqual([422, WRITING_BLOCKS_VERIFICATION]);
  });

  it("never re-checks a verification already stored on unchanged steps", () => {
    const loose = verifyProcedure(
      { ...written(), steps: [newStep("The drawer is counted.")] },
      "owner",
      TODAY,
      ada,
    );
    expect(save(profileWith(loose), profileWith(loose), null)).toBeNull();
  });
});

describe("bringing back a version that carries an older verification", () => {
  const rex = { id: "user-rex", name: "Rex Reviewer" };
  const verifiedByRex = verifyProcedure(written(), "owner", "2026-09-10", rex);
  const editedSince = withProcedureEdit(
    verifiedByRex,
    { ...verifiedByRex, steps: [newStep("Count the drawer twice.")] },
    TODAY,
  );

  it("a history restore saves: the old stamp goes and is kept as the last verification", () => {
    expect(save(profileWith(editedSince), profileWith(verifiedByRex), "owner")).toBe(
      VERIFICATION_ACCOUNT_MISMATCH,
    );
    const [restored] = verificationsAsHeld([verifiedByRex], [editedSince]);
    expect(restored.verifiedAt).toBeUndefined();
    expect(restored.lastVerifiedAt).toBe("2026-09-10");
    expect(restored.steps[0].text).toBe("Count the drawer.");
    expect(save(profileWith(editedSince), profileWith(restored), "owner")).toBeNull();
    expect(save(profileWith(editedSince), profileWith(restored), "preparer")).toBeNull();
  });

  it("a restore keeps the verification the account holds for the same steps", () => {
    const [restored] = verificationsAsHeld([verifiedByRex], [verifiedByRex]);
    expect(restored.verifiedByAccountId).toBe("user-rex");
    expect(save(profileWith(verifiedByRex), profileWith(restored), "preparer")).toBeNull();
  });

  it("a copy kept as a new business saves without another account's verification", () => {
    expect(save(null, profileWith(verifiedByRex), "owner")).toBe(VERIFICATION_ACCOUNT_MISMATCH);
    const [copied] = withoutOthersVerifications([verifiedByRex], ada.id);
    expect(save(null, profileWith(copied), "owner")).toBeNull();
    const own = verifyProcedure(written(), "owner", "2026-09-10", ada);
    expect(withoutOthersVerifications([own], ada.id)[0].verifiedByAccountId).toBe(ada.id);
  });
});
