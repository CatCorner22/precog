import { describe, expect, it } from "vitest";
import { flatRole, personLabel } from "./person-label";

describe("personLabel", () => {
  it("never nests brackets when the title has its own", () => {
    expect(personLabel("Linda Faulkner", "Bookkeeper (PT)")).toBe(
      "Linda Faulkner (Bookkeeper, PT)",
    );
    expect(personLabel("Grace Kim", "Bookkeeper (Contract)")).toBe(
      "Grace Kim (Bookkeeper, Contract)",
    );
  });

  it("leaves a plain title as it is", () => {
    expect(personLabel("Ana Ruiz", "Owner / Dentist, DDS")).toBe("Ana Ruiz (Owner / Dentist, DDS)");
  });

  it("reads several and empty bracketed parts", () => {
    expect(flatRole("Executive Director (ED) (Interim)")).toBe("Executive Director, ED, Interim");
    expect(flatRole("Server ()")).toBe("Server");
    expect(flatRole("(PT) Host")).toBe("PT Host");
  });
});
