import { describe, expect, it } from "vitest";
import type { IndustryId } from "../industry";
import { getIndustryTemplate } from "./index";

const INDUSTRIES: IndustryId[] = [
  "dental",
  "retail",
  "restaurant",
  "professional_services",
  "construction",
  "nonprofit",
  "general",
];

/** Every piece of text a starter process, register item or scenario shows, with where it sits. */
function texts(value: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => texts(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (key === "id" || key.endsWith("Id") || key.endsWith("Ids")) continue;
      texts(v, `${path}.${key}`, out);
    }
  }
  return out;
}

describe("starter text an owner's own business inherits", () => {
  for (const id of INDUSTRIES) {
    it(`names roles, not the ${id} sample team, in process notes, register items and scenarios`, () => {
      const tpl = getIndustryTemplate(id);
      const names = new Set(
        tpl.people
          .flatMap((p) => p.name.split(/\s+/))
          .filter((part) => !/^(dr|mr|mrs|ms)\.?$/i.test(part) && part !== "Owner"),
      );
      const hits = [
        ...texts(tpl.processes, "processes"),
        ...texts(tpl.knowledge, "knowledge"),
        ...texts(tpl.scenarios, "scenarios"),
      ].filter(([, text]) => [...names].some((name) => new RegExp(`\\b${name}\\b`).test(text)));
      expect(hits).toEqual([]);
    });

    it(`quotes no sample dollar threshold as the owner's in the ${id} map ideas`, () => {
      const ideas = texts(
        getIndustryTemplate(id).processes.map((p) => p.ideas ?? []),
        "ideas",
      ).filter(([, text]) => /\$\s?\d/.test(text) && /threshold|dual/i.test(text));
      expect(ideas).toEqual([]);
    });
  }
});
