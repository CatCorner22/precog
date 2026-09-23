import { describe, expect, it } from "vitest";
import { isOwnerRole, ownersMarked, ownsBusiness, soleOwnerId } from "./owner-role";

describe("isOwnerRole", () => {
  it.each([
    "Owner",
    "Owner / Dentist",
    "Owner / Dentist, DDS",
    "Owner / Executive Chef",
    "Chef/Owner",
    "Chef Owner",
    "Owner and Head Chef",
    "Owner - Chef",
    "Owner-Operator",
    "Owner/Operator",
    "Co-Owner",
    "Co Owner",
    "Sole Proprietor",
    "Proprietor",
    "Business Owner",
    "Practice Owner",
    "Dentist-Owner",
    "Franchisee",
    "Founder & CEO",
    "Co-founder",
    "President & CEO",
    "C.E.O.",
    "Chief Executive Officer",
    "President",
    "Managing Member",
    "Managing Partner",
    "Partner",
    "Senior Partner",
    "Partner (Tax)",
    "Principal",
  ])("reads %s as the owner", (title) => {
    expect(isOwnerRole(title)).toBe(true);
  });

  it.each([
    "Owner's Assistant",
    "CEO's Assistant",
    "Assistant to the Owner",
    "Executive Assistant to the President",
    "Office Manager (Owner's wife)",
    "Bookkeeper (Owner's son)",
    "Vice President, Finance",
    "Vice-President",
    "VP Finance",
    "Principal Accountant",
    "Sales Partner",
    "Store Partner",
    "Product Owner",
    "Process Owner",
    "Managing Director",
    "Office Manager",
    "Bookkeeper",
  ])("reads %s as an employee", (title) => {
    expect(isOwnerRole(title)).toBe(false);
  });
});

describe("soleOwnerId", () => {
  it("names the owner when exactly one person holds an owner title", () => {
    expect(
      soleOwnerId([
        { id: "a", role: "Owner" },
        { id: "b", role: "Office Manager" },
      ]),
    ).toBe("a");
  });

  it("names nobody when partners or co-owners share the business", () => {
    expect(
      soleOwnerId([
        { id: "a", role: "Partner" },
        { id: "b", role: "Partner" },
        { id: "c", role: "Bookkeeper" },
      ]),
    ).toBeNull();
    expect(
      soleOwnerId([
        { id: "a", role: "Owner" },
        { id: "b", role: "Co-Owner" },
      ]),
    ).toBeNull();
  });

  it("names nobody when no title names an owner", () => {
    expect(soleOwnerId([{ id: "a", role: "Office Manager" }])).toBeNull();
  });
});

describe("the owner's own mark from setup", () => {
  it("makes an owner titled by profession the sole owner", () => {
    const team = [
      { id: "a", role: "Dentist", owner: true },
      { id: "b", role: "Office Manager", owner: false },
    ];
    expect(soleOwnerId(team)).toBe("a");
  });

  it("does not make an unmarked 'Managing Partner' the owner on a marked team", () => {
    const team = [
      { id: "a", role: "Owner", owner: true },
      { id: "b", role: "Managing Partner", owner: false },
    ];
    expect(ownersMarked(team)).toBe(true);
    expect(ownsBusiness(team[1], true)).toBe(false);
    expect(soleOwnerId(team)).toBe("a");
  });

  it("finds no sole owner when two people are marked as owners", () => {
    expect(
      soleOwnerId([
        { id: "a", role: "Dentist", owner: true },
        { id: "b", role: "Dentist", owner: true },
      ]),
    ).toBeNull();
  });

  it("reads titles on a team without marks, as the samples are", () => {
    const team = [
      { id: "a", role: "Owner / Dentist" },
      { id: "b", role: "Office Manager" },
    ];
    expect(ownersMarked(team)).toBe(false);
    expect(soleOwnerId(team)).toBe("a");
  });
});
