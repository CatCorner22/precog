import { describe, expect, it } from "vitest";
import { knowledgeItem } from "@/test/fixtures";
import { resolveTemplate } from "../active-template";
import {
  documentationDebt,
  documentationState,
  procedurePointer,
} from "../continuity/documentation";
import { defaultProfile, normalizeCustomKnowledge, normalizeProfile } from "../practice-profile";
import {
  procedureFits,
  withKnowledge,
  withProcedure,
  withProcedureVerified,
  withoutProcedure,
} from "../profile-actions";
import { restoredProfile, snapshotSlice } from "../snapshot-profile";
import { linkProcedures } from "./coverage-link";
import { findLikelySecrets, maskLikelySecrets, secretKindsIn } from "./credential-guard";
import {
  newProcedure,
  newStep,
  procedureStatus,
  verifyProcedure,
  withProcedureEdit,
} from "./lifecycle";
import {
  normalizePlaces,
  normalizeProcedures,
  PROCEDURE_LIMITS,
  proceduresBytes,
  webUrl,
} from "./normalize";
import { placeSuggestions } from "./places";
import { unwrittenProcedureRows } from "./starter";
import type { Procedure } from "./types";

const TODAY = "2026-10-01";

function written(extra: Partial<Procedure> = {}): Procedure {
  return newProcedure(
    {
      industry: "general",
      title: "Reconcile the checking account",
      steps: [newStep("Open Banking."), newStep("Match each deposit to the statement.")],
      ...extra,
    },
    TODAY,
  );
}

describe("normalizeProcedures", () => {
  it("keeps a well-formed procedure and drops entries with no id, title or industry", () => {
    const good = written();
    const out = normalizeProcedures(
      [
        good,
        { id: "x", industry: "general" },
        { title: "No id", industry: "general" },
        { id: "y", title: "t", industry: "mars" },
      ],
      TODAY,
    );
    expect(out.map((p) => p.id)).toEqual([good.id]);
  });

  it("bounds lengths, counts and dates", () => {
    const steps = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, text: "x".repeat(500) }));
    const [p] = normalizeProcedures(
      [
        {
          ...written(),
          steps,
          verifiedAt: "2099-01-01",
          reviewEveryDays: 5,
          url: "javascript:alert(1)",
        },
      ],
      TODAY,
    );
    expect(p.steps).toHaveLength(PROCEDURE_LIMITS.steps);
    expect(p.steps[0].text).toHaveLength(PROCEDURE_LIMITS.stepText);
    expect(p.verifiedAt).toBeUndefined();
    expect(p.reviewEveryDays).toBe(30);
    expect(p.url).toBeUndefined();
  });

  it("keeps a backup who is not also the owner", () => {
    const [p] = normalizeProcedures(
      [{ ...written(), ownerPersonId: "p1", backupPersonIds: ["p1", "p2", "p2"] }],
      TODAY,
    );
    expect(p.backupPersonIds).toEqual(["p2"]);
  });

  it("stops at the byte budget instead of failing to open", () => {
    const big = (i: number) =>
      written({
        id: `big-${i}`,
        steps: Array.from({ length: 25 }, (_, j) => ({ id: `s${j}`, text: "y".repeat(300) })),
      });
    const out = normalizeProcedures(
      Array.from({ length: 120 }, (_, i) => big(i)),
      TODAY,
    );
    expect(out.length).toBeLessThan(120);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(PROCEDURE_LIMITS.bytes + out.length);
  });
});

describe("step pictures", () => {
  it("keeps well-formed picture ids and the photo flag, and drops anything else", () => {
    const [p] = normalizeProcedures(
      [
        {
          ...written(),
          steps: [
            {
              id: "s1",
              text: "Open the safe.",
              imageIds: ["img_abc_1", "img_abc_1", "../etc/passwd", 42, "img_x"],
              requiresPhoto: true,
            },
            { id: "s2", text: "Count the drawer.", imageIds: "img_abc_1", requiresPhoto: "yes" },
          ],
        },
      ],
      TODAY,
    );
    expect(p.steps[0]).toEqual({
      id: "s1",
      text: "Open the safe.",
      imageIds: ["img_abc_1", "img_x"],
      requiresPhoto: true,
    });
    expect(p.steps[1]).toEqual({ id: "s2", text: "Count the drawer." });
  });

  it("caps pictures per step", () => {
    const imageIds = Array.from({ length: 10 }, (_, i) => `img_${i}`);
    const [p] = normalizeProcedures(
      [{ ...written(), steps: [{ id: "s", text: "t", imageIds }] }],
      TODAY,
    );
    expect(p.steps[0].imageIds).toHaveLength(PROCEDURE_LIMITS.imagesPerStep);
  });

  it("clears the verification when a picture is added or the photo flag changes", () => {
    const verified = verifyProcedure(written(), "owner", TODAY);
    const withPicture = withProcedureEdit(
      verified,
      {
        ...verified,
        steps: verified.steps.map((s, i) => (i === 0 ? { ...s, imageIds: ["img_a"] } : s)),
      },
      "2026-10-02",
    );
    expect(withPicture.verifiedAt).toBeUndefined();
    expect(withPicture.changelog[0].summary).toBe("Changed pictures");
    const flagged = withProcedureEdit(
      verified,
      {
        ...verified,
        steps: verified.steps.map((s, i) => (i === 1 ? { ...s, requiresPhoto: true as const } : s)),
      },
      "2026-10-02",
    );
    expect(flagged.verifiedAt).toBeUndefined();
  });
});

describe("places and addresses", () => {
  it("accepts only http and https links", () => {
    expect(webUrl("https://qbo.intuit.com/app/banking")).toBe("https://qbo.intuit.com/app/banking");
    expect(webUrl("javascript:alert(1)")).toBe("");
    expect(webUrl("data:text/html,hi")).toBe("");
    expect(webUrl("not a url")).toBe("");
  });

  it("normalizes places and defaults their kind to software", () => {
    expect(
      normalizePlaces([
        { id: "a", name: " QuickBooks Online ", kind: "software" },
        { id: "b", name: "Front safe", kind: "physical" },
        { id: "c", name: "" },
        { id: "a", name: "duplicate" },
        { id: "d", name: "Portal", kind: "cloud" },
      ]),
    ).toEqual([
      { id: "a", kind: "software", name: "QuickBooks Online" },
      { id: "b", kind: "physical", name: "Front safe" },
      { id: "d", kind: "software", name: "Portal" },
    ]);
  });

  it("suggests the systems the processes name, then the usual ones, without repeats", () => {
    const got = placeSuggestions(
      "dental",
      [{ systems: ["Dentrix", "Bank portal"] }],
      [{ name: "dentrix" }],
    );
    expect(got[0]).toEqual({ kind: "software", name: "Bank portal", source: "process" });
    expect(got.map((s) => s.name)).toContain("Practice-management system");
    expect(got.map((s) => s.name)).not.toContain("Dentrix");
    expect(got.filter((s) => s.name === "Bank portal")).toHaveLength(1);
  });
});

describe("review lifecycle", () => {
  it("moves from empty to draft to verified to stale", () => {
    expect(procedureStatus(newProcedure({ industry: "general", title: "t" }, TODAY), TODAY)).toBe(
      "empty",
    );
    const draft = written();
    expect(procedureStatus(draft, TODAY)).toBe("draft");
    const verified = verifyProcedure(draft, "owner", TODAY);
    expect(procedureStatus(verified, TODAY)).toBe("verified");
    expect(procedureStatus(verified, "2027-03-30")).toBe("verified");
    expect(procedureStatus(verified, "2027-03-31")).toBe("stale");
  });

  it("clears the verification when the steps change, and logs the change", () => {
    const verified = verifyProcedure(written(), "p2", TODAY);
    const edited = withProcedureEdit(
      verified,
      { ...verified, steps: [...verified.steps, newStep("Save the report as a PDF.")] },
      "2026-10-05",
    );
    expect(edited.verifiedAt).toBeUndefined();
    expect(edited.lastVerifiedAt).toBe(TODAY);
    expect(edited.version).toBe(2);
    expect(edited.changelog[0]).toEqual({ version: 2, on: "2026-10-05", summary: "Added 1 step" });
    expect(procedureStatus(edited, "2026-10-05")).toBe("needs_reverify");
  });

  it("keeps the verification when only who does it or what it links to changes", () => {
    const verified = verifyProcedure(written(), "p2", TODAY);
    const relinked = withProcedureEdit(
      verified,
      { ...verified, backupPersonIds: ["p3"], knowledgeIds: ["k1"], title: "Renamed" },
      "2026-10-05",
    );
    expect(relinked.verifiedAt).toBe(TODAY);
    expect(relinked.version).toBe(1);
    expect(relinked.changelog).toEqual([]);
  });

  it("names a reworded step even when the same save adds one", () => {
    const verified = verifyProcedure(written(), "p2", TODAY);
    const [first, second] = verified.steps;
    const edited = withProcedureEdit(
      verified,
      {
        ...verified,
        steps: [{ ...first, text: "Open Banking › Reconcile." }, second, newStep("Save it.")],
      },
      "2026-10-05",
    );
    expect(edited.changelog[0].summary).toBe("Added 1 step, edited steps");
  });

  it("keeps the verification when only an empty step is added", () => {
    const verified = verifyProcedure(written(), "p2", TODAY);
    const padded = withProcedureEdit(
      verified,
      { ...verified, steps: [...verified.steps, newStep("")] },
      "2026-10-05",
    );
    expect(padded.verifiedAt).toBe(TODAY);
    expect(padded.version).toBe(1);
  });

  it("does not verify a procedure with no steps", () => {
    const empty = newProcedure({ industry: "general", title: "t" }, TODAY);
    expect(verifyProcedure(empty, "owner", TODAY).verifiedAt).toBeUndefined();
  });
});

describe("credential guard", () => {
  it("finds passwords, combinations, card numbers, SSNs and long keys", () => {
    expect(secretKindsIn(["The password: Summer2026!"])).toEqual(["password"]);
    expect(secretKindsIn(["Safe combination is 12-34-56"])).toEqual(["password"]);
    expect(secretKindsIn(["Pay with 4111 1111 1111 1111"])).toEqual(["card"]);
    expect(secretKindsIn(["SSN 123-45-6789"])).toEqual(["ssn"]);
    expect(secretKindsIn(["Recovery code a8f3k2m9q7x1z5c4v6b0n2l8"])).toEqual(["token"]);
  });

  it("does not flag where a secret is kept, or ordinary numbers", () => {
    expect(
      findLikelySecrets(
        'The password is in the 1Password vault entry "Bank". Invoice 10045 for $1,250 on 10/01.',
      ),
    ).toEqual([]);
    expect(findLikelySecrets("Card ending 4417")).toEqual([]);
  });

  it("masks what it finds", () => {
    expect(maskLikelySecrets("PIN: 4417 then press Enter")).toBe("[removed] then press Enter");
  });

  it("finds a secret written with spaces, a phrase before it, or no separator", () => {
    const masked = (t: string) => maskLikelySecrets(t);
    expect(masked("Safe combination is 12 34 56")).toBe("Safe [removed]");
    expect(masked("Combo is 36 24 12, then turn the handle")).toBe(
      "[removed], then turn the handle",
    );
    expect(masked("The password is correct horse battery staple")).toBe("The [removed]");
    expect(masked("Password for the bank portal: Tr0ub4dor")).toBe("[removed]");
    expect(masked("pw: hunter22")).toBe("[removed]");
    expect(masked("Door code is 4417")).toBe("[removed]");
    expect(masked("Enter PIN 4417 and press OK")).toBe("Enter [removed] and press OK");
    expect(masked("SSN 123 45 6789")).toBe("SSN [removed]");
  });

  it("still leaves alone where a secret is kept and how it is handled", () => {
    for (const text of [
      "The password is kept in the office manager's vault",
      "The door code is changed every quarter",
      "Password for payroll is stored in 1Password",
      "Zip code 90210 and invoice 10045",
    ]) {
      expect(findLikelySecrets(text), text).toEqual([]);
    }
  });
});

describe("linking procedures to the register", () => {
  const k1 = knowledgeItem("k1");
  const k2 = knowledgeItem("k2");

  it("marks an item with a written procedure as written and findable", () => {
    const linked = linkProcedures([k1, k2], [written({ knowledgeIds: ["k1"] })], "general");
    expect(documentationState(linked[0])).toBe("located");
    expect(procedurePointer(linked[0])).toBe(
      'steps in Procedures: "Reconcile the checking account"',
    );
    expect(documentationState(linked[1])).toBe("none");
  });

  it("ignores empty procedures and other industries' procedures", () => {
    const empty = newProcedure({ industry: "general", title: "t", knowledgeIds: ["k1"] }, TODAY);
    const dental = written({ industry: "dental", knowledgeIds: ["k1"] });
    const list = [k1];
    expect(linkProcedures(list, [empty, dental], "general")).toBe(list);
  });

  it("counts toward the documented index", () => {
    const profile = {
      ...defaultProfile("general"),
      customKnowledge: [k1, k2],
      customRelations: [],
      procedures: [written({ knowledgeIds: ["k1", "k2"] })],
    };
    expect(documentationDebt(resolveTemplate(profile)).documentedIndex).toBe(100);
  });

  it("never stores the derived links", () => {
    const profile = {
      ...defaultProfile("general"),
      customKnowledge: [k1],
      procedures: [written({ knowledgeIds: ["k1"] })],
    };
    const fromTemplate = resolveTemplate(profile).knowledge;
    expect(fromTemplate[0].linkedProcedures).toHaveLength(1);
    const saved = withKnowledge(profile, fromTemplate);
    expect(saved.customKnowledge?.[0]).not.toHaveProperty("linkedProcedures");
    expect(normalizeCustomKnowledge(fromTemplate, TODAY)?.[0]).not.toHaveProperty(
      "linkedProcedures",
    );
  });

  it("lists unwritten register items, duties first, most critical first", () => {
    const rows = unwrittenProcedureRows(
      [
        knowledgeItem("know", { kind: "knowledge" }),
        knowledgeItem("minor", { kind: "duty", criticality: "nice-to-have" }),
        knowledgeItem("major", { kind: "duty" }),
        knowledgeItem("elsewhere", { kind: "duty", documented: true }),
        knowledgeItem("done", { kind: "duty" }),
      ],
      [written({ knowledgeIds: ["done"] })],
      "general",
    );
    expect(rows.map((r) => r.item.id)).toEqual(["major", "minor", "know"]);
  });

  it("still lists an item whose procedure has no steps, to continue that one", () => {
    const empty = newProcedure({ industry: "general", title: "t", knowledgeIds: ["major"] }, TODAY);
    const rows = unwrittenProcedureRows(
      [knowledgeItem("major", { kind: "duty" })],
      [empty],
      "general",
    );
    expect(rows).toEqual([{ item: expect.objectContaining({ id: "major" }), startedId: empty.id }]);
  });
});

describe("profile actions", () => {
  it("adds, edits, verifies and removes a procedure", () => {
    const base = defaultProfile("general");
    const p = written({
      purpose: "Keeps the books matching the bank. Done when every line matches.",
      trigger: "When the statement arrives",
      module: "Banking › Reconcile",
    });
    const added = withProcedure(base, p, TODAY);
    expect(added.procedures?.map((x) => x.id)).toEqual([p.id]);
    const verified = withProcedureVerified(added, p.id, "owner", TODAY);
    expect(verified.procedures?.[0].verifiedAt).toBe(TODAY);
    // Saving the same content keeps the verification.
    const resaved = withProcedure(verified, { ...p, title: "New title" }, "2026-10-02");
    expect(resaved.procedures?.[0].verifiedAt).toBe(TODAY);
    expect(resaved.procedures?.[0].title).toBe("New title");
    expect(withoutProcedure(resaved, p.id).procedures).toEqual([]);
  });

  it("leaves a procedure unverified while its writing has errors", () => {
    const loose = written({ steps: [newStep("The drawer is counted.")] });
    const added = withProcedure(defaultProfile("general"), loose, TODAY);
    const pressed = withProcedureVerified(added, loose.id, "owner", TODAY);
    expect(pressed.procedures?.[0].verifiedAt).toBeUndefined();
  });

  it("refuses a save past the byte budget and says so", () => {
    const huge = written({
      steps: Array.from({ length: 25 }, (_, j) => ({ id: `s${j}`, text: "z".repeat(300) })),
    });
    let profile = defaultProfile("general");
    let refused = false;
    for (let i = 0; i < 120 && !refused; i++) {
      const next = { ...huge, id: `p${i}` };
      if (!procedureFits(profile, next, TODAY)) {
        refused = true;
        expect(withProcedure(profile, next, TODAY)).toBe(profile);
      } else profile = withProcedure(profile, next, TODAY);
    }
    expect(refused).toBe(true);
  });

  it("says a save fits exactly when it will be stored, change-log entry included", () => {
    let profile = defaultProfile("general");
    const base = written({
      steps: Array.from({ length: 25 }, (_, j) => ({ id: `s${j}`, text: "z".repeat(300) })),
    });
    // Fill close to the budget, then edit the first procedure in small steps across the boundary.
    for (let i = 0; procedureFits(profile, { ...base, id: `p${i}` }, TODAY); i++) {
      profile = withProcedure(profile, { ...base, id: `p${i}` }, TODAY);
    }
    const first = profile.procedures!.find((x) => x.id === "p0")!;
    for (let n = 0; n < 60; n++) {
      const next = { ...first, purpose: "x".repeat(n * 5) };
      const stored = withProcedure(profile, next, TODAY) !== profile;
      expect(procedureFits(profile, next, TODAY), `purpose of ${n * 5}`).toBe(stored);
    }
  });

  it("measures the budget in UTF-8 bytes, as the 2 MB profile cap does", () => {
    const heavy = (i: number) =>
      written({
        id: `cjk${i}`,
        steps: Array.from({ length: 25 }, (_, j) => ({ id: `s${j}`, text: "日".repeat(300) })),
      });
    const kept = normalizeProcedures(
      Array.from({ length: 120 }, (_, i) => heavy(i)),
      TODAY,
    );
    const bytes = new TextEncoder().encode(JSON.stringify(kept)).length;
    expect(bytes).toBeLessThanOrEqual(PROCEDURE_LIMITS.bytes + kept.length);
    expect(proceduresBytes(kept)).toBeLessThanOrEqual(PROCEDURE_LIMITS.bytes);
  });

  it("survives a round trip through the normaliser", () => {
    const profile = withProcedure(defaultProfile("general"), written(), TODAY);
    const again = normalizeProfile(JSON.parse(JSON.stringify(profile)), { today: TODAY });
    expect(again.procedures).toEqual(profile.procedures);
  });

  it("keeps procedures written since a snapshot when it is restored", () => {
    const then = defaultProfile("general");
    const now = withProcedure(then, written(), TODAY);
    const slice = snapshotSlice(then);
    expect(slice).not.toHaveProperty("procedures");
    const restored = restoredProfile({ profile: { ...then, ...slice } }, now);
    expect(restored?.procedures).toEqual(now.procedures);
  });
});
