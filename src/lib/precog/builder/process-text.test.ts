import { describe, expect, it } from "vitest";
import { textPatch } from "./process-text";
import type { ProcessNode } from "../types";

const process: ProcessNode = {
  id: "p1",
  name: "Front desk",
  description: "Takes payments",
  inputs: ["Card"],
  outputs: ["Receipt"],
  layer: "process",
  dependencies: [],
  controlIds: [],
};

const same = {
  name: "Front desk",
  desc: "Takes payments",
  inputs: "Card",
  outputs: "Receipt",
  systems: "",
  location: "",
};

describe("textPatch", () => {
  it("is empty when the fields match the saved process", () => {
    expect(textPatch(same, process)).toEqual({});
  });

  it("carries a rename alone", () => {
    expect(textPatch({ ...same, name: "Checkout" }, process)).toEqual({ name: "Checkout" });
  });

  it("splits comma lists and trims the procedure location", () => {
    expect(
      textPatch({ ...same, inputs: "Card, Cash ,", location: "  Binder, shelf 2  " }, process),
    ).toEqual({ inputs: ["Card", "Cash"], procedureLocation: "Binder, shelf 2" });
  });

  it("bounds a long name to 60 characters", () => {
    expect(textPatch({ ...same, name: "x".repeat(80) }, process).name).toHaveLength(60);
  });
});
