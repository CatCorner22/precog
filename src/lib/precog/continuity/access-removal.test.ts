import { describe, expect, it } from "vitest";
import { getIndustryTemplate } from "../templates";
import { parsePeopleCsv } from "../import/people-csv";
import { normalizeProfile, defaultProfile, type LeaverAccessCheck } from "../practice-profile";
import type { Person } from "../types";
import { markLeft } from "./leavers";
import { INDUSTRIES } from "../industry";
import {
  confirmAccessRemoved,
  departuresBetween,
  leaverAccessNames,
  leaverLine,
  noteDepartures,
  openAccessChecks,
  recordLastDay,
  restorePerson,
  leaverAccessKeys,
} from "./access-removal";
import { leaverAccessItems } from "./leaver-access-items";

const TODAY = "2026-09-24";
const person = (id: string, name: string, role: string, active = true): Person => ({
  id,
  name,
  role,
  active,
});

const team = [
  person("p-olga", "Olga Owner", "Owner"),
  person("p-jordan", "Jordan Lee", "Keyholder"),
  person("p-pat", "Pat Kim", "Cashier"),
];

describe("a roster that leaves someone out as terminated", () => {
  const roster = [
    "Name,Job Title,Status",
    "Olga Owner,Owner,Active",
    "Jordan Lee,Keyholder,Active",
    "Nora Diaz,Cashier,Terminated",
  ].join("\n");

  it("opens one pay-and-logins check for the person who left", () => {
    const { people } = parsePeopleCsv(roster, getIndustryTemplate("retail"));
    const left = people.filter((p) => !p.active).map((p) => ({ name: p.name, role: p.role }));
    const checks = noteDepartures([], left, "roster", "retail", TODAY);
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({
      name: "Nora Diaz",
      role: "Cashier",
      source: "roster",
      notedOn: TODAY,
    });
    expect(openAccessChecks(checks, "retail", people)).toHaveLength(1);
  });

  it("does not ask again when the same roster is pasted after the owner confirmed", () => {
    const first = noteDepartures([], [{ name: "Nora Diaz" }], "roster", "retail", TODAY);
    const { checks } = confirmAccessRemoved(first, [first[0].id], TODAY);
    const again = noteDepartures(checks, [{ name: "nora  diaz" }], "roster", "retail", TODAY);
    expect(again).toBe(checks);
    expect(openAccessChecks(again, "retail", [])).toHaveLength(0);
  });

  it("arriving terminated in an imported team file counts as leaving", () => {
    const after = [...team, person("p-nora", "Nora Diaz", "Cashier", false)];
    expect(departuresBetween(team, after)).toEqual([
      { personId: "p-nora", name: "Nora Diaz", role: "Cashier" },
    ]);
  });
});

describe("the owner marks a keyholder as left", () => {
  it("opens a check, and closes it if the keyholder is back at work", () => {
    const after = team.map((p) => (p.id === "p-jordan" ? { ...p, active: false } : p));
    const left = departuresBetween(team, after);
    expect(left.map((l) => l.name)).toEqual(["Jordan Lee"]);
    const checks = noteDepartures([], left, "marked", "retail", TODAY);
    expect(openAccessChecks(checks, "retail", after)).toHaveLength(1);
    // Undone, or rehired: nothing to confirm while they work here.
    expect(openAccessChecks(checks, "retail", team)).toHaveLength(0);
  });

  it("opens a second check when a rehired person leaves again", () => {
    const after = team.map((p) => (p.id === "p-jordan" ? { ...p, active: false } : p));
    const first = noteDepartures([], departuresBetween(team, after), "marked", "retail", TODAY);
    const { checks } = confirmAccessRemoved(first, [first[0].id], TODAY);
    // Back at work in the spring, then marked as left again in the autumn.
    const again = noteDepartures(
      checks,
      departuresBetween(team, after),
      "marked",
      "retail",
      "2027-03-01",
    );
    expect(again).toHaveLength(2);
    expect(openAccessChecks(again, "retail", after)).toMatchObject([
      { personId: "p-jordan", notedOn: "2027-03-01", source: "marked" },
    ]);
  });

  it("dates an unconfirmed check to the second departure after a rehire", () => {
    const after = team.map((p) => (p.id === "p-jordan" ? { ...p, active: false } : p));
    const first = noteDepartures([], departuresBetween(team, after), "marked", "retail", TODAY);
    const prompted = first.map((check) => ({ ...check, prompted: true as const }));
    const again = noteDepartures(
      prompted,
      departuresBetween(team, after),
      "marked",
      "retail",
      "2027-03-01",
    );
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ notedOn: "2027-03-01", source: "marked" });
    expect(again[0].prompted).toBeUndefined();
  });

  it("marking left from the register (past last day) opens the check too", () => {
    const withNotice = team.map((p) => (p.id === "p-pat" ? { ...p, lastDay: "2026-09-20" } : p));
    const after = markLeft(withNotice, "p-pat", TODAY);
    expect(departuresBetween(withNotice, after).map((l) => l.name)).toEqual(["Pat Kim"]);
  });

  it("someone already marked as left does not open a second check on a later edit", () => {
    const after = team.map((p) => (p.id === "p-jordan" ? { ...p, active: false } : p));
    const renamed = after.map((p) => (p.id === "p-olga" ? { ...p, name: "Olga O." } : p));
    expect(departuresBetween(after, renamed)).toEqual([]);
  });

  it("the sample team's people never open a check", () => {
    const sample = getIndustryTemplate("retail").people;
    const after = sample.map((p, i) => (i === 1 ? { ...p, active: false } : p));
    expect(departuresBetween(sample, after, sample)).toEqual([]);
  });
});

describe("the owner answers the prompt", () => {
  const open = (): LeaverAccessCheck[] =>
    noteDepartures(
      [],
      [{ personId: "p-jordan", name: "Jordan Lee", role: "Keyholder" }, { name: "Nora Diaz" }],
      "marked",
      "retail",
      TODAY,
    );

  it("is prompted once: 'not yet' keeps the item open on Start here without asking again", () => {
    const later = open().map((check) => ({ ...check, prompted: true as const }));
    expect(openAccessChecks(later, "retail", [])).toHaveLength(2);
  });

  it("confirming records a dated entry in the decisions log and closes the check", () => {
    const checks = open();
    const jordan = checks.find((c) => c.name === "Jordan Lee") as LeaverAccessCheck;
    const result = confirmAccessRemoved(
      checks,
      [jordan.id],
      TODAY,
      new Date("2026-09-24T15:00:00Z"),
    );
    expect(result.decisions).toHaveLength(1);
    const entry = result.decisions[0];
    expect(entry).toMatchObject({
      kind: "remediate",
      status: "closed",
      linkedPersonId: "p-jordan",
      createdAt: "2026-09-24T15:00:00.000Z",
    });
    expect(entry.subject).toContain("Jordan Lee");
    expect(entry.note).toContain(
      "On Sep 24, 2026 you confirmed that Jordan Lee (Keyholder) is off payroll",
    );
    expect(entry.note).toMatch(/bank, payroll, point of sale/);
    expect(openAccessChecks(result.checks, "retail", []).map((c) => c.name)).toEqual(["Nora Diaz"]);
    // Confirming twice records nothing more.
    expect(confirmAccessRemoved(result.checks, [jordan.id], TODAY).decisions).toHaveLength(0);
  });

  it("checks belong to one line of business, and survive a save and reload", () => {
    const fresh = open();
    const checks = fresh.map((check, i) =>
      i === 0 ? { ...check, prompted: true as const } : check,
    );
    expect(openAccessChecks(checks, "dental", [])).toHaveLength(0);
    const saved = JSON.parse(
      JSON.stringify({ ...defaultProfile("retail"), leaverAccessChecks: checks }),
    );
    const loaded = normalizeProfile(saved);
    expect(loaded.leaverAccessChecks).toHaveLength(2);
    expect(loaded.leaverAccessChecks?.map((c) => c.name)).toEqual(["Jordan Lee", "Nora Diaz"]);
    expect(loaded.leaverAccessChecks?.[0].prompted).toBe(true);
    expect(
      normalizeProfile({ ...saved, leaverAccessChecks: [{ id: 1 }, "x"] }).leaverAccessChecks,
    ).toEqual([]);
  });
});

describe("one person under two spellings", () => {
  it("does not open a second check when a roster drops the accents", () => {
    const existing: LeaverAccessCheck = {
      id: "c1",
      name: "José Pérez",
      industry: "dental",
      notedOn: "2026-01-01",
      source: "roster",
    };
    const checks = noteDepartures(
      [existing],
      [{ name: "Jose  Perez" }],
      "roster",
      "dental",
      "2026-09-26",
    );
    expect(checks).toHaveLength(1);
  });

  it("treats Díaz and Diaz as one person on a re-paste after the owner confirmed", () => {
    const first = noteDepartures([], [{ name: "Nora Díaz" }], "roster", "retail", TODAY);
    const { checks } = confirmAccessRemoved(first, [first[0].id], TODAY);
    expect(noteDepartures(checks, [{ name: "Nora Diaz" }], "roster", "retail", TODAY)).toBe(checks);
  });
});

describe("more open leaver checks than the cap", () => {
  it("keeps every open check through a reload, dropping only confirmed ones", () => {
    const roster = Array.from({ length: 350 }, (_, i) => ({ name: `Leaver ${i}` }));
    const first = noteDepartures([], [{ name: "Done Already" }], "roster", "retail", "2026-09-01");
    const done = confirmAccessRemoved(first, [first[0].id], TODAY).checks;
    const checks = noteDepartures(done, roster, "roster", "retail", TODAY);
    expect(checks.filter((c) => !c.confirmedOn)).toHaveLength(350);

    const reloaded = normalizeProfile(
      JSON.parse(JSON.stringify({ ...defaultProfile("retail"), leaverAccessChecks: checks })),
    ).leaverAccessChecks;
    expect(reloaded?.filter((c) => !c.confirmedOn)).toHaveLength(350);
    expect(reloaded?.some((c) => c.name === "Done Already")).toBe(false);
  });
});

describe("the owner records that someone left the business", () => {
  it("marks them as left on the last day the owner chose, past or today", () => {
    const after = recordLastDay(team, "p-pat", "2026-09-20", TODAY);
    expect(after.find((p) => p.id === "p-pat")).toMatchObject({
      active: false,
      lastDay: "2026-09-20",
    });
    expect(recordLastDay(team, "p-pat", TODAY, TODAY)[2]).toMatchObject({
      active: false,
      lastDay: TODAY,
    });
    expect(departuresBetween(team, after).map((l) => l.name)).toEqual(["Pat Kim"]);
  });

  it("keeps someone with a future last day at work, on notice", () => {
    const after = recordLastDay(team, "p-pat", "2026-10-15", TODAY);
    expect(after[2]).toMatchObject({ active: true, lastDay: "2026-10-15" });
    expect(departuresBetween(team, after)).toEqual([]);
  });

  it("changes nothing for a date that is not a calendar day", () => {
    expect(recordLastDay(team, "p-pat", "2026-02-30", TODAY)).toBe(team);
  });

  it("Undo puts them back at work as they were, and their check stops asking", () => {
    const after = recordLastDay(team, "p-jordan", "2026-09-22", TODAY);
    const checks = noteDepartures([], departuresBetween(team, after), "marked", "retail", TODAY);
    expect(openAccessChecks(checks, "retail", after)).toHaveLength(1);
    // Something else changed on the team before the owner pressed Undo.
    const renamed = after.map((p) => (p.id === "p-olga" ? { ...p, name: "Olga O." } : p));
    const undone = restorePerson(renamed, team[1]);
    expect(undone[1]).toEqual(team[1]);
    expect(undone[1]).not.toHaveProperty("lastDay");
    expect(undone[0].name).toBe("Olga O.");
    expect(openAccessChecks(checks, "retail", undone)).toHaveLength(0);
  });
});

describe("the line for each leaver", () => {
  const check: LeaverAccessCheck = {
    id: "c1",
    personId: "p-jordan",
    name: "Jordan Lee",
    industry: "retail",
    notedOn: "2026-10-07",
    source: "marked",
  };
  it("gives the last day and the day it was marked", () => {
    expect(leaverLine(check, { lastDay: "2026-10-03" }, "2026-10-07")).toBe(
      "last day Oct 3, marked as left Oct 7",
    );
  });
  it("gives the marked day alone when no last day is known", () => {
    expect(leaverLine(check, undefined, "2026-10-07")).toBe("marked as left Oct 7");
  });
  it("names a roster as the source", () => {
    expect(leaverLine({ ...check, source: "roster" }, undefined, "2027-01-02")).toBe(
      "listed as no longer working here in the roster you pasted on Oct 7, 2026",
    );
  });
});

describe("the leaver checklist in each industry's words", () => {
  const words = (industry: Parameters<typeof leaverAccessItems>[0]) =>
    leaverAccessItems(industry)
      .map((item) => item.label)
      .join(" | ")
      .toLowerCase();

  it("a nonprofit has no till and asks about mail, donors, giving and mailed checks", () => {
    const text = words("nonprofit");
    expect(text).not.toMatch(/\btill\b|point-of-sale|practice|customer|business software/);
    expect(text).toContain("organization software");
    expect(text).toContain("po box");
    expect(text).toContain("donor database");
    expect(text).toContain("online giving platform");
    expect(text).toContain("mailed checks");
  });

  it("a restaurant asks about the safe combination, keys, alarm code and POS PIN", () => {
    const text = words("restaurant");
    for (const word of ["safe combination", "keys", "alarm code", "pos pin"])
      expect(text).toContain(word);
    expect(text).not.toContain("practice");
  });

  it("only a dental practice reads 'practice software'", () => {
    expect(words("dental")).toContain("practice software");
    for (const industry of INDUSTRIES.map((i) => i.id).filter((id) => id !== "dental"))
      expect(words(industry)).not.toContain("practice software");
  });

  it("every industry starts with pay and the bank, and has unique item ids", () => {
    for (const { id } of INDUSTRIES) {
      const items = leaverAccessItems(id);
      expect(items[0].id).toBe("payroll");
      expect(items.some((item) => item.id === "bank")).toBe(true);
      expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    }
  });

  it("words exactly the items the first-load key list holds, in its order", () => {
    for (const { id } of INDUSTRIES) {
      expect(leaverAccessItems(id).map(({ id: item, short }) => ({ id: item, short }))).toEqual(
        leaverAccessKeys(id).map(({ id: item, short }) => ({ id: item, short })),
      );
    }
  });

  it("words every item of every industry's checklist", () => {
    for (const { id } of INDUSTRIES)
      for (const item of leaverAccessItems(id)) expect(item.label).not.toBe("");
  });

  it("the decisions log names what a nonprofit confirmed", () => {
    const [check] = noteDepartures([], [{ name: "Ana Ruiz" }], "marked", "nonprofit", TODAY);
    const { decisions } = confirmAccessRemoved([check], [check.id], TODAY);
    expect(decisions[0].note).toContain("donor database");
    expect(decisions[0].note).not.toContain("point of sale");
  });
});

describe("the names the 'Leaving the team' card gives for people who left", () => {
  const after = [...team, person("p-tony", "Tony Ruiz", "Cashier", false)];

  it("names only the people whose access checklist is open", () => {
    const old = { ...person("p-sam", "Sam Old", "Cashier", false), lastDay: "2024-09-01" };
    const people = [...after, old];
    const first = noteDepartures(
      [],
      [{ personId: "p-sam", name: "Sam Old" }],
      "marked",
      "retail",
      "2024-09-01",
    );
    const { checks } = confirmAccessRemoved(first, [first[0].id], "2024-09-02");
    const open = noteDepartures(
      checks,
      [{ personId: "p-tony", name: "Tony Ruiz" }],
      "marked",
      "retail",
      TODAY,
    );
    expect(leaverAccessNames(open, "retail", people)).toEqual(["Tony Ruiz"]);
  });

  it("names nobody when every check is confirmed, so the card says nobody has given notice", () => {
    const first = noteDepartures(
      [],
      [{ personId: "p-tony", name: "Tony Ruiz" }],
      "marked",
      "retail",
      TODAY,
    );
    const { checks } = confirmAccessRemoved(first, [first[0].id], TODAY);
    expect(leaverAccessNames(checks, "retail", after)).toEqual([]);
  });

  it("names nobody on a team with inactive people but no checks, like the sample team", () => {
    expect(leaverAccessNames(undefined, "retail", after)).toEqual([]);
  });
});
