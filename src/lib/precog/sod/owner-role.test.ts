import { describe, expect, it } from "vitest";
import { isOwnerRole, soleOwnerId } from "./owner-role";

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
