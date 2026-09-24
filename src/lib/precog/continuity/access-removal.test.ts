import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { parsePeopleCsv } from "../import/people-csv";
import { normalizeProfile, defaultProfile, type LeaverAccessCheck } from "../practice-profile";
import type { Person } from "../types";
import { markLeft } from "./leavers";
import {
  confirmAccessRemoved,
  departuresBetween,
  markPrompted,
  noteDepartures,
  openAccessChecks,
  unpromptedAccessChecks,
} from "./access-removal";

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
    const { people } = parsePeopleCsv(roster, getBaseTemplate("retail"));
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
    const sample = getBaseTemplate("retail").people;
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
    const checks = open();
    expect(unpromptedAccessChecks(checks, "retail", [])).toHaveLength(2);
    const later = markPrompted(
      checks,
      checks.map((c) => c.id),
    );
    expect(unpromptedAccessChecks(later, "retail", [])).toHaveLength(0);
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
      `On ${TODAY} you confirmed that Jordan Lee (Keyholder) is off payroll`,
    );
    expect(entry.note).toMatch(/bank, payroll, point of sale/);
    expect(openAccessChecks(result.checks, "retail", []).map((c) => c.name)).toEqual(["Nora Diaz"]);
    // Confirming twice records nothing more.
    expect(confirmAccessRemoved(result.checks, [jordan.id], TODAY).decisions).toHaveLength(0);
  });

  it("checks belong to one line of business, and survive a save and reload", () => {
    const fresh = open();
    const checks = markPrompted(fresh, [fresh[0].id]);
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
