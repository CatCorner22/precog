import { describe, expect, it } from "vitest";
import { CONTROL_CATALOG } from "../evidence/controls";
import { INDUSTRIES } from "../industry";
import { ENTITLEMENTS } from "../sod/conflict-rules";
import { controlMeasures } from "../sod/control-measures";
import { getIndustryTemplate } from "../templates";
import { findLikelySecrets } from "./credential-guard";
import { verifyProcedure, withProcedureEdit } from "./lifecycle";
import {
  ifYouCannotSeparateFor,
  libraryRows,
  procedureFromLibrary,
  RECOMMENDED_PROCEDURES,
} from "./library";
import { normalizeProcedure, PROCEDURE_LIMITS } from "./normalize";
import { procedureRecommendations } from "./quality";
import { stepWritingIssues } from "./writing";

const TODAY = "2026-10-01";

describe("the recommended procedures", () => {
  it("each has a unique id and fits every limit a stored procedure has", () => {
    const ids = RECOMMENDED_PROCEDURES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const duties = new Set<string>(ENTITLEMENTS.map((e) => e.id));
    for (const r of RECOMMENDED_PROCEDURES) {
      expect(r.id.length, r.id).toBeLessThanOrEqual(60);
      expect(r.title.length, r.id).toBeLessThanOrEqual(PROCEDURE_LIMITS.title);
      expect(r.purpose.length, r.id).toBeLessThanOrEqual(PROCEDURE_LIMITS.purpose);
      expect(r.trigger.length, r.id).toBeLessThanOrEqual(PROCEDURE_LIMITS.trigger);
      expect(r.prerequisites.length, r.id).toBeLessThanOrEqual(PROCEDURE_LIMITS.prerequisites);
      for (const need of r.prerequisites)
        expect(need.length, need).toBeLessThanOrEqual(PROCEDURE_LIMITS.prerequisite);
      expect(r.steps.length, r.id).toBeGreaterThan(0);
      expect(r.steps.length, r.id).toBeLessThanOrEqual(PROCEDURE_LIMITS.steps);
      expect(new Set(r.steps.map((s) => s.text)).size, r.id).toBe(r.steps.length);
      for (const s of r.steps) {
        expect(s.text.length, s.text).toBeLessThanOrEqual(PROCEDURE_LIMITS.stepText);
        expect(s.caution?.length ?? 0, s.caution).toBeLessThanOrEqual(PROCEDURE_LIMITS.caution);
      }
      for (const d of r.dutyIds) expect(duties.has(d), d).toBe(true);
      expect(r.source.trim(), r.id).not.toBe("");
    }
  });

  it("writes every step the way the best-practice check asks, and no secret", () => {
    for (const r of RECOMMENDED_PROCEDURES) {
      r.steps.forEach((s, i) => {
        const step = { id: `s${i}`, text: s.text, ...(s.caution ? { caution: s.caution } : {}) };
        expect(stepWritingIssues(step, i + 1), s.text).toEqual([]);
        expect(findLikelySecrets(`${s.text} ${s.caution ?? ""}`), s.text).toEqual([]);
      });
    }
  });

  it("names no owner, so the steps read right for a nonprofit", () => {
    for (const r of RECOMMENDED_PROCEDURES) {
      const words = [
        r.purpose,
        ...r.steps.flatMap((s) => [s.text, s.caution ?? ""]),
        r.ifYouCannotSeparate ?? "",
        ...Object.values(r.ifYouCannotSeparateByIndustry ?? {}),
      ].join(" ");
      expect(words, r.id).not.toMatch(/\bowner\b/i);
    }
  });

  it("sets a line of business's own fallback only on a procedure that line is shown", () => {
    for (const r of RECOMMENDED_PROCEDURES) {
      const own = Object.keys(r.ifYouCannotSeparateByIndustry ?? {});
      if (own.length === 0) continue;
      expect(r.ifYouCannotSeparate, r.id).toBeTruthy();
      for (const id of own) {
        expect(r.industries ? r.industries.includes(id as never) : true, `${r.id} ${id}`).toBe(
          true,
        );
      }
    }
  });
});

describe("the stock-count fallback by line of business", () => {
  const count = RECOMMENDED_PROCEDURES.find((p) => p.id === "lib-cycle-count")!;
  const SHARED =
    "Count everything at least once a year with a second person present who does not keep the stock.";
  const OWN: Record<string, string> = {
    retail:
      "Do a full count every quarter, with a second person present who does not keep the stock.",
    restaurant:
      "Count the food and drink every month, with a second person present who does not keep the stock.",
    construction:
      "Take an equipment and materials inventory every quarter, with a second person present who does not keep the stock.",
    automotive: "Someone outside the parts desk counts the parts every quarter.",
  };

  it.each(Object.entries(OWN))("%s reads its own stricter count", (industry, text) => {
    expect(ifYouCannotSeparateFor(count, industry as (typeof INDUSTRIES)[number]["id"])).toBe(text);
  });

  it.each(["dental", "professional_services", "nonprofit", "general"] as const)(
    "%s reads the shared yearly count",
    (industry) => {
      expect(ifYouCannotSeparateFor(count, industry)).toBe(SHARED);
    },
  );

  it("covers exactly those four, and every line of business resolves to some text", () => {
    expect(Object.keys(count.ifYouCannotSeparateByIndustry ?? {}).sort()).toEqual(
      ["automotive", "construction", "restaurant", "retail"].sort(),
    );
    expect(INDUSTRIES).toHaveLength(8);
    for (const { id } of INDUSTRIES) expect(ifYouCannotSeparateFor(count, id)).toBeTruthy();
  });

  it("keeps the weekly section count itself unchanged", () => {
    expect(count.cadence).toBe("weekly");
    expect(count.trigger).toBe("Every week, a different section each time");
    expect(count.steps.map((s) => s.text)).toEqual([
      "Print the count sheet for this week's section without the quantities on hand.",
      "Count each item on the sheet.",
      "Compare each count with the quantity in the system.",
      "Recount each item that differs.",
      "Ask a second person to approve each adjustment before anyone enters it.",
      "Enter the approved adjustments.",
    ]);
  });
});

describe("the blueprint's evidence and fallbacks folded into the library", () => {
  const FOLDED: Record<string, { evidence: string; fallback?: RegExp }> = {
    "lib-bank-rec": { evidence: "Reconciliation sign-off", fallback: /does not post/ },
    "lib-vendor-bank-change": {
      evidence: "Contact verification record",
      fallback: /vendor change log every week/,
    },
    "lib-release-payments": { evidence: "Release log", fallback: /payment report/ },
    "lib-payroll": { evidence: "Change report", fallback: /change report/ },
    "lib-cash-deposit": { evidence: "Processor settlement detail", fallback: /ties out/ },
    "lib-refund-review": { evidence: "Refund register", fallback: /refund and void listing/ },
    "lib-cycle-count": { evidence: "Count sheets", fallback: /once a year/ },
    "lib-receiving": { evidence: "Receiving log" },
    "lib-leaver-access": { evidence: "Completed offboarding checklist", fallback: /Twice a year/ },
    "lib-card-review": { evidence: "Card statements", fallback: /every card statement/ },
    "lib-trust-rec": { evidence: "Three-way reconciliation", fallback: /trust account/ },
    "lib-tip-report": { evidence: "Tip pool sheet", fallback: /card tips/ },
    "lib-lien-waiver": { evidence: "Waiver register", fallback: /pay application/ },
    "lib-restricted-gift": { evidence: "Fund balance report", fallback: /restricted funds/ },
    "lib-deal-jacket": { evidence: "Remittance log", fallback: /fees, payoffs and rebates/ },
  };

  it.each(Object.entries(FOLDED))("%s carries its evidence and fallback text", (id, want) => {
    const r = RECOMMENDED_PROCEDURES.find((p) => p.id === id)!;
    expect(r, id).toBeDefined();
    expect(r.evidenceToKeep, id).toContain(want.evidence);
    expect(new Set(r.evidenceToKeep).size, id).toBe(r.evidenceToKeep!.length);
    if (want.fallback) expect(r.ifYouCannotSeparate, id).toMatch(want.fallback);
  });

  it('writes the evidence and fallbacks without "should" or "e.g."', () => {
    for (const r of RECOMMENDED_PROCEDURES) {
      const text = [
        r.ifYouCannotSeparate ?? "",
        ...Object.values(r.ifYouCannotSeparateByIndustry ?? {}),
        ...(r.evidenceToKeep ?? []),
      ].join(" ");
      expect(text, r.id).not.toMatch(/\bshould\b|\be\.g\./i);
    }
  });
});

describe("which recommendations a business is shown", () => {
  const general = getIndustryTemplate("general");

  it("shows a line of business its own and the common ones, never another's", () => {
    const shown = (industry: (typeof INDUSTRIES)[number]["id"]) =>
      libraryRows(getIndustryTemplate(industry), [], industry).map((r) => r.recommendation.id);
    expect(shown("professional_services")).toContain("lib-trust-rec");
    expect(shown("dental")).toContain("lib-controlled-count");
    expect(shown("retail")).toContain("lib-platform-settlement");
    expect(shown("restaurant")).toContain("lib-platform-settlement");
    expect(shown("construction")).toContain("lib-certified-payroll");
    expect(shown("general")).not.toContain("lib-trust-rec");
    expect(shown("general")).not.toContain("lib-controlled-count");
    expect(shown("general")).not.toContain("lib-platform-settlement");
    expect(shown("general")).not.toContain("lib-certified-payroll");
    for (const { id } of INDUSTRIES) expect(shown(id)).toContain("lib-bank-rec");
  });

  it("puts those that cover register items first and marks the ones that fit", () => {
    const rows = libraryRows(general, [], "general");
    const firstUncovered = rows.findIndex((r) => r.knowledgeIds.length === 0);
    expect(firstUncovered).toBeGreaterThan(0);
    expect(rows.slice(firstUncovered).every((r) => r.knowledgeIds.length === 0)).toBe(true);
    for (const r of rows) expect(r.fits).toBe(r.knowledgeIds.length + r.heldBy.length > 0);
    const deposit = rows.find((r) => r.recommendation.id === "lib-cash-deposit");
    expect(
      deposit?.knowledgeIds.map((id) => general.knowledge.find((k) => k.id === id)?.name),
    ).toEqual(["Daily deposit & reconciliation"]);
  });

  it("leaves out one already started, or one whose register items all have a procedure", () => {
    const rows = libraryRows(general, [], "general");
    const deposit = rows.find((r) => r.recommendation.id === "lib-cash-deposit")!;
    const started = procedureFromLibrary(deposit, "general", TODAY);
    const ids = (procs: Parameters<typeof libraryRows>[1]) =>
      libraryRows(general, procs, "general").map((r) => r.recommendation.id);
    expect(ids([started])).not.toContain("lib-cash-deposit");
    // Written by hand for the same register item.
    const byHand = { industry: "general" as const, knowledgeIds: deposit.knowledgeIds };
    expect(ids([byHand])).not.toContain("lib-cash-deposit");
    // A procedure in another line of business does not count.
    expect(ids([{ ...started, industry: "retail" }])).toContain("lib-cash-deposit");
  });

  it("does not count a person who has left as holding the duty", () => {
    const people = general.people.map((p) => ({ ...p, active: false }));
    const rows = libraryRows({ ...general, people }, [], "general");
    expect(rows.every((r) => r.heldBy.length === 0)).toBe(true);
  });
});

describe("a procedure started from a recommendation", () => {
  const general = getIndustryTemplate("general");
  const row = libraryRows(general, [], "general").find(
    (r) => r.recommendation.id === "lib-cash-deposit",
  )!;
  const started = procedureFromLibrary(row, "general", TODAY);

  it("carries the recommendation's fields, links and suggested steps", () => {
    expect(started).toMatchObject({
      industry: "general",
      title: "Make the daily cash deposit",
      libraryId: "lib-cash-deposit",
      cadence: "daily",
      knowledgeIds: row.knowledgeIds,
      ownerPersonId: row.heldBy[0],
      dutyIds: ["collect_cash", "prepare_deposit"],
    });
    expect(started.steps).toHaveLength(row.recommendation.steps.length);
    expect(started.steps.every((s) => s.suggested)).toBe(true);
    expect(started.steps[3].caution).toBe(row.recommendation.steps[3].caution);
    expect(new Set(started.steps.map((s) => s.id)).size).toBe(started.steps.length);
  });

  it("keeps its marks and library link through a save and a reload", () => {
    const saved = withProcedureEdit(null, started, TODAY);
    const reloaded = normalizeProcedure(JSON.parse(JSON.stringify(saved)), TODAY);
    expect(reloaded?.libraryId).toBe("lib-cash-deposit");
    expect(reloaded?.steps.every((s) => s.suggested)).toBe(true);
  });

  it("asks for the suggestions to be fitted until someone verifies it", () => {
    const ids = (p: typeof started) =>
      procedureRecommendations(p, { place: null, today: TODAY }).map((r) => r.id);
    const before = procedureRecommendations(started, { place: null, today: TODAY });
    const fit = before.find((r) => r.id === "suggested");
    expect(fit?.level).toBe("fix");
    expect(fit?.title).toBe(
      `Fit the ${started.steps.length} suggested steps to your own screens, names and people.`,
    );
    expect(ids(started)).not.toContain("caution");
    expect(ids(started).filter((id) => id.includes(":"))).toEqual([]);
    const verified = verifyProcedure(started, "owner", TODAY);
    expect(verified.steps.some((s) => s.suggested)).toBe(false);
    expect(ids(verified)).not.toContain("suggested");
  });

  it("has a procedure-wide recommendation only for what the business must add itself", () => {
    for (const { id } of INDUSTRIES) {
      const tpl = getIndustryTemplate(id);
      for (const r of libraryRows(tpl, [], id)) {
        const p = procedureFromLibrary(r, id, TODAY);
        const recs = procedureRecommendations(p, { place: null, today: TODAY }).map((x) => x.id);
        const allowed = ["suggested", "where", "owner", "backup", "reviewer", "verify"];
        expect(
          recs.filter((x) => !allowed.includes(x)),
          `${id} ${r.recommendation.id}`,
        ).toEqual([]);
      }
    }
  });
});

describe("what a started procedure keeps from its recommendation", () => {
  it("keeps the fallback for its line of business, the evidence to keep and the source", () => {
    for (const { id } of INDUSTRIES) {
      for (const row of libraryRows(getIndustryTemplate(id), [], id)) {
        const r = row.recommendation;
        const started = procedureFromLibrary(row, id, TODAY);
        const reloaded = normalizeProcedure(
          JSON.parse(JSON.stringify(withProcedureEdit(null, started, TODAY))),
          TODAY,
        );
        for (const p of [started, reloaded]) {
          expect(p?.fallback, `${id} ${r.id}`).toBe(ifYouCannotSeparateFor(r, id));
          expect(p?.evidenceToKeep, `${id} ${r.id}`).toEqual(r.evidenceToKeep);
          expect(p?.source, `${id} ${r.id}`).toBe(r.source);
        }
      }
    }
  });

  it("keeps a retail stock count's own stricter fallback", () => {
    const row = libraryRows(getIndustryTemplate("retail"), [], "retail").find(
      (r) => r.recommendation.id === "lib-cycle-count",
    )!;
    expect(procedureFromLibrary(row, "retail", TODAY).fallback).toBe(
      "Do a full count every quarter, with a second person present who does not keep the stock.",
    );
  });

  it("fits every recommendation inside the stored limits for them", () => {
    for (const r of RECOMMENDED_PROCEDURES) {
      const fallbacks = [
        r.ifYouCannotSeparate ?? "",
        ...Object.values(r.ifYouCannotSeparateByIndustry ?? {}),
      ];
      for (const text of fallbacks)
        expect(text.length, r.id).toBeLessThanOrEqual(PROCEDURE_LIMITS.fallback);
      expect(r.source.length, r.id).toBeLessThanOrEqual(PROCEDURE_LIMITS.source);
      expect(r.evidenceToKeep?.length ?? 0, r.id).toBeLessThanOrEqual(PROCEDURE_LIMITS.evidence);
      for (const e of r.evidenceToKeep ?? [])
        expect(e.length, e).toBeLessThanOrEqual(PROCEDURE_LIMITS.evidenceItem);
    }
  });
});

describe("the stored fallback, evidence and source", () => {
  const base = { id: "p1", industry: "general", title: "Reconcile", steps: [] };

  it("loads an older procedure without them as before", () => {
    const p = normalizeProcedure(base, TODAY)!;
    expect(p).not.toHaveProperty("fallback");
    expect(p).not.toHaveProperty("evidenceToKeep");
    expect(p).not.toHaveProperty("source");
  });

  it("bounds them: 600 characters of text, at most 12 records of 120 characters", () => {
    const p = normalizeProcedure(
      {
        ...base,
        fallback: "f".repeat(700),
        source: "s".repeat(700),
        evidenceToKeep: [
          "  Deposit slip  ",
          "",
          42,
          "e".repeat(200),
          ...Array.from({ length: 20 }, (_, i) => `Record ${i}`),
        ],
      },
      TODAY,
    )!;
    expect(p.fallback).toHaveLength(600);
    expect(p.source).toHaveLength(600);
    expect(p.evidenceToKeep).toHaveLength(12);
    expect(p.evidenceToKeep?.[0]).toBe("Deposit slip");
    expect(p.evidenceToKeep?.[1]).toHaveLength(120);
  });

  it("drops a list or text of the wrong type", () => {
    const p = normalizeProcedure(
      { ...base, fallback: 3, source: ["x"], evidenceToKeep: "Deposit slip" },
      TODAY,
    )!;
    expect(p).not.toHaveProperty("fallback");
    expect(p).not.toHaveProperty("source");
    expect(p).not.toHaveProperty("evidenceToKeep");
  });
});

describe("the fallbacks a business with one person on the work can follow", () => {
  it("never relies only on a separate reviewer the business may not have", () => {
    for (const r of RECOMMENDED_PROCEDURES) {
      const fallbacks = [
        r.ifYouCannotSeparate ?? "",
        ...Object.values(r.ifYouCannotSeparateByIndustry ?? {}),
      ];
      for (const text of fallbacks)
        expect(text, r.id).not.toMatch(/separate (?:authorized )?reviewer/i);
    }
  });

  it("gives releasing payments a weekly bank-side review and bank protections", () => {
    const release = RECOMMENDED_PROCEDURES.find((p) => p.id === "lib-release-payments")!;
    expect(release.ifYouCannotSeparate).toBe(
      "If one person prepares and releases payments: each week someone who does neither, for example the person who runs the business or a board officer, reads the bank's payment report and the cleared-check images, and the bank alerts that person to every new payee and every payment over a set amount. Ask your bank for payee alerts and Positive Pay with payee match.",
    );
  });

  it("ends the vendor bank change fallback with a weekly change-log read and payee alerts", () => {
    const change = RECOMMENDED_PROCEDURES.find((p) => p.id === "lib-vendor-bank-change")!;
    expect(change.ifYouCannotSeparate).toMatch(
      / If no second person can approve, someone who did not make the change reads the vendor change log every week, and the bank alerts that person to each new payee\.$/,
    );
  });
});

describe("one value where the catalogs used to disagree", () => {
  const lib = (id: string) => RECOMMENDED_PROCEDURES.find((p) => p.id === id)!;

  it("reconciles the bank by the 10th in the library and in Measures", () => {
    expect(lib("lib-bank-rec").trigger).toMatch(/by the 10th\b/);
    for (const { id } of INDUSTRIES) {
      const text = JSON.stringify(controlMeasures(id).bank_reconcile);
      expect(text, id).toContain("Reconcile the bank by the 10th of the next month");
      expect(text, id).not.toMatch(/\b15th\b/);
    }
  });

  it("reviews every refund, void and write-off, as the catalog approves every one", () => {
    const refund = lib("lib-refund-review");
    const words = [refund.purpose, ...refund.steps.map((s) => s.text)].join(" ");
    expect(words).not.toMatch(/\blimit\b/i);
    expect(refund.steps[1].text).toBe("Read every refund, void and write-off on the report.");
    expect(CONTROL_CATALOG["void-refund-second-approval"].label).toMatch(/\bevery void\b/);
  });

  it("counts controlled drugs weekly in the library and in the catalog", () => {
    const count = CONTROL_CATALOG["controlled-substance-count"];
    expect(lib("lib-controlled-count").cadence).toBe("weekly");
    expect(count.cadence).toBe("weekly");
    expect(count.label).toContain("against the log at least once a week");
    expect(count.why).toContain("Precog suggests a weekly count");
    expect(count.why).toContain("21 CFR 1304.11");
    expect(`${count.label} ${count.why}`).not.toMatch(/\bdaily\b|each day/i);
  });

  it("lists the leaver's own offboarding records as the evidence to keep", () => {
    expect(lib("lib-leaver-access").evidenceToKeep).toEqual([
      "Completed offboarding checklist",
      "Disabled-account list or screenshots",
      "Returned keys and cards log",
    ]);
  });
});
