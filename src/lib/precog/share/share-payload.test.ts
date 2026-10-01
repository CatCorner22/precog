import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import { firstName } from "../text";
import { validateSharePayload, type SharedMapPayload } from "./share-schema";
import { buildSharePayload, redactSharePayload } from "./share-payload";

function payload(): SharedMapPayload {
  return {
    version: 1,
    businessName: "Example",
    industry: "general",
    industryLabel: "General",
    teamLabel: "team",
    generatedAt: "2025-01-01T00:00:00.000Z",
    health: {
      score: 75,
      bandLabel: "Good",
      summary: "Summary",
      dimensions: [],
      processCount: 1,
      avgHeat: 20,
      hotProcesses: 0,
    },
    processes: [
      {
        id: "p1",
        name: "Payments",
        description: "Payment process",
        stage: 1,
        heat: 20,
        owners: ["Ada", "Unknown"],
        controls: [],
        risks: [],
        dependencies: [],
        evidence: [],
      },
    ],
    people: [
      { name: "Ada", role: "Manager" },
      { name: "Bea", role: "Manager" },
    ],
    issues: [],
    actions: [],
  };
}

describe("redactSharePayload", () => {
  it("redacts people and owners deterministically without mutating the payload", () => {
    const original = payload();
    const redacted = redactSharePayload(original);

    expect(redacted.people).toEqual([
      { name: "Manager A", role: "Manager" },
      { name: "Manager B", role: "Manager" },
    ]);
    expect(redacted.processes[0]?.owners).toEqual(["Manager A", "Team member A"]);
    expect(original.people[0]?.name).toBe("Ada");
    expect(original.processes[0]?.owners).toEqual(["Ada", "Unknown"]);
  });

  it("replaces names inside issue, action and note sentences, first names included", () => {
    const redacted = redactSharePayload(
      {
        ...payload(),
        issues: ['"Payments" has no owner left on the team — Cara Voss has left'],
        actions: [
          { title: "Cross-train Bea on payments", why: "Cara was the only owner", effort: "low" },
        ],
        note: "Ask Ada. Caramel stays.",
      },
      [{ name: "Cara Voss", role: "Bookkeeper" }],
    );
    expect(redacted.issues).toEqual([
      '"Payments" has no owner left on the team — Bookkeeper A has left',
    ]);
    expect(redacted.actions[0]).toMatchObject({
      title: "Cross-train Manager B on payments",
      why: "Bookkeeper A was the only owner",
    });
    expect(redacted.note).toBe("Ask Manager A. Caramel stays.");
    expect(redacted.namesHidden).toBe(true);
  });

  it("leaves no part of a name with a surname or title anywhere, in any letter case", () => {
    const team = [
      { name: "Dr. Cara Voss", role: "Dentist" },
      { name: "cara lee", role: "Hygienist" },
      { name: "Mrs Ines Smith-Jones", role: "Office Manager" },
      { name: "Will Ortega", role: "Assistant" },
    ];
    const base = payload();
    const process = base.processes[0]!;
    const redacted = redactSharePayload(
      {
        ...base,
        businessName: "Riverside Dental",
        health: { ...base.health, summary: "Smith-Jones runs payments" },
        processes: [
          {
            ...process,
            owners: ["Dr. Cara Voss", "Mrs Ines Smith-Jones"],
            description: "Dr. Voss counts the cash; dr voss signs. C. Voss checks.",
            risks: [{ title: "VOSS works alone", kind: "fraud", severity: 3, likelihood: 2 }],
            evidence: [{ label: "Voss signs the log (CV)", frequency: "daily", status: "ok" }],
            controls: [{ name: "Mrs. Jones reviews, then ORTEGA", segregated: true }],
          },
        ],
        people: team,
        issues: ["Ask Voss or CARA LEE", "ines and LEE share the till; C.V. approves"],
        actions: [
          { title: "Cross-train Will", why: "Smith covers. The bank will call.", effort: "low" },
        ],
        note: "Mrs Smith-Jones and Professor Lee agree.",
      },
      team,
    );
    const json = JSON.stringify(redacted);
    for (const part of ["Cara", "Voss", "Lee", "Ines", "Smith", "Jones", "Ortega", "CV"]) {
      expect(json).not.toMatch(new RegExp(`(?<![\\p{L}])${part}(?![\\p{L}])`, "iu"));
    }
    expect(json).not.toMatch(/C\.V\.|\bWill\b|\bWILL\b/);
    expect(redacted.processes[0]?.description).toBe(
      "Dentist A counts the cash; Dentist A signs. Dentist A checks.",
    );
    expect(redacted.issues).toEqual([
      "Ask Dentist A or Hygienist A",
      "Office Manager A and Hygienist A share the till; Dentist A approves",
    ]);
    expect(redacted.note).toBe("Office Manager A and Hygienist A agree.");
    expect(redacted.actions[0]?.title).toBe("Cross-train Assistant A");
    // "will" in lower case is the everyday word, not Will Ortega.
    expect(redacted.actions[0]?.why).toBe("Office Manager A covers. The bank will call.");
  });

  it("calls a surname two people share a team member", () => {
    const redacted = redactSharePayload({ ...payload(), note: "Ask Lee." }, [
      { name: "Ann Lee", role: "Nurse" },
      { name: "Bo Lee", role: "Nurse" },
    ]);
    expect(redacted.note).toBe("Ask Team member.");
  });

  it("keeps bookkeeping abbreviations that match someone's initials", () => {
    const redacted = redactSharePayload(
      { ...payload(), note: "Ana Price posts AP invoices; A.P. signs." },
      [{ name: "Ana Price", role: "Bookkeeper" }],
    );
    expect(redacted.note).toBe("Bookkeeper A posts AP invoices; Bookkeeper A signs.");
  });

  it("returns a payload already marked namesHidden unchanged when no roster is supplied", () => {
    const once = redactSharePayload(payload());
    expect(redactSharePayload(once)).toBe(once);
  });

  it("scrubs names a client kept after setting namesHidden, when a roster is supplied", () => {
    const hidden = { ...payload(), namesHidden: true as const, note: "Ask Ada." };
    const redacted = redactSharePayload(hidden, [{ name: "Ada", role: "Manager" }]);
    expect(redacted.namesHidden).toBe(true);
    expect(redacted.note).not.toContain("Ada");
    expect(redacted.people.map((p) => p.name).join(" ")).not.toContain("Ada");
  });
});

describe("buildSharePayload", () => {
  /** The dental sample as the owner's own team, with Jordan Blake marked as left. */
  function teamWithLeaver(): PracticeProfile {
    const profile = defaultProfile("dental");
    const people = resolveTemplate(profile).people.map((p) =>
      p.name === "Jordan Blake" ? { ...p, active: false } : p,
    );
    return { ...profile, customPeople: people };
  }
  const actions = [
    {
      title: "Cross-train Chris on Daily deposit & reconciliation",
      why: "Jordan was the only listed owner and has left. Maya and Elena review it.",
      effort: "low",
    },
  ];

  it("keeps names when redaction is off", () => {
    const shared = buildSharePayload(teamWithLeaver(), actions, "Call Maya", false);
    expect(shared.people.map((p) => p.name)).toContain("Maya Chen");
    expect(shared.processes.flatMap((p) => p.owners)).toContain("Jordan Blake");
    expect(shared.namesHidden).toBeUndefined();
  });

  it("leaves no person's name or first name anywhere in a redacted share", () => {
    const profile = teamWithLeaver();
    const shared = buildSharePayload(profile, actions, "Call Maya", true);
    const json = JSON.stringify(shared);
    for (const person of resolveTemplate(profile).people) {
      for (const word of [person.name, firstName(person.name)]) {
        expect(json).not.toMatch(
          new RegExp(`(?<![\\p{L}])${word.replace(".", "\\.")}(?![\\p{L}])`, "u"),
        );
      }
    }
    // The departed owner keeps a role, and the sentence about them uses it.
    const cash = shared.processes.find((p) => p.id === "proc-cash");
    expect(cash?.owners).toEqual(["Front Desk Lead A"]);
    expect(shared.issues.some((i) => i.includes("Front Desk Lead A has left"))).toBe(true);
    expect(() => validateSharePayload(shared)).not.toThrow();
  });
});
