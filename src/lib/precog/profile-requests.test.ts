import { describe, expect, it } from "vitest";
import { clientErrorStatus } from "@/lib/request-errors";
import { defaultProfile } from "./practice-profile";
import { mergeProfile } from "./profile-merge";
import { UNANSWERED } from "./onboarding/setup-answers";
import {
  parseDeleteBusinessRequest,
  parseOpenBusinessRequest,
  parseSaveBusinessRequest,
} from "./profile-requests";

const profile = { ...defaultProfile("dental"), businessId: "biz_1" };

function statusOf(run: () => unknown): number | null {
  try {
    run();
  } catch (error) {
    return clientErrorStatus(error);
  }
  return null;
}

describe("a save request", () => {
  it("keeps setup answers through save and profile-load normalization", () => {
    const answers = { ...UNANSWERED, bankRec: "outside" as const };
    const profile = { ...defaultProfile("general"), setupAnswers: answers };
    const saved = parseSaveBusinessRequest({ expectedAccountId: "u1", profile });
    expect(JSON.parse(saved.json).setupAnswers).toEqual(answers);
    expect(
      mergeProfile(
        {
          name: saved.profile.practiceName,
          industry: saved.profile.industry,
          profile: JSON.parse(saved.json),
        },
        saved.today,
      ).setupAnswers,
    ).toEqual(answers);
  });

  it("reads a well-formed save", () => {
    const parsed = parseSaveBusinessRequest({
      expectedAccountId: "u1",
      profile,
      baseRevision: 3,
    });
    expect(parsed).toMatchObject({
      businessId: "biz_1",
      expectedAccountId: "u1",
      industry: "dental",
      baseRevision: 3,
    });
    expect(JSON.parse(parsed.json).businessId).toBe("biz_1");
  });

  it("treats a missing base revision as a business the account never held", () => {
    expect(parseSaveBusinessRequest({ expectedAccountId: "u1", profile }).baseRevision).toBeNull();
  });

  it("refuses revision 0, a fraction or a string with 400", () => {
    for (const baseRevision of [0, 1.5, "2", -1]) {
      expect(
        statusOf(() =>
          parseSaveBusinessRequest({ expectedAccountId: "u1", profile, baseRevision }),
        ),
      ).toBe(400);
    }
  });

  it("refuses an unknown industry with 400", () => {
    expect(
      statusOf(() =>
        parseSaveBusinessRequest({ expectedAccountId: "u1", profile, industry: "space" }),
      ),
    ).toBe(400);
  });

  it("asks for a reload (409) when the browser does not say which account it saves for", () => {
    expect(statusOf(() => parseSaveBusinessRequest({ profile }))).toBe(409);
  });

  it("refuses a request that is not an object with 400", () => {
    expect(statusOf(() => parseSaveBusinessRequest(null))).toBe(400);
  });
});

describe("open and delete requests", () => {
  it("refuse a business id outside the allowed characters with 400", () => {
    expect(statusOf(() => parseOpenBusinessRequest({ id: "../x" }))).toBe(400);
    expect(statusOf(() => parseDeleteBusinessRequest({ id: "a b", expectedAccountId: "u1" }))).toBe(
      400,
    );
  });

  it("need the signed-in account to delete", () => {
    expect(statusOf(() => parseDeleteBusinessRequest({ id: "biz_1" }))).toBe(400);
    expect(parseDeleteBusinessRequest({ id: "biz_1", expectedAccountId: "u1" })).toEqual({
      id: "biz_1",
      expectedAccountId: "u1",
    });
  });

  it("reads the id to open", () => {
    expect(parseOpenBusinessRequest({ id: "biz_1" }).id).toBe("biz_1");
  });
});
