import { describe, expect, it } from "vitest";
import type { IndustryId } from "../industry";
import { getIndustryTemplate } from "./index";
import { getIndustryCopy } from "./industry-copy";
import { LAYER_META } from "./layer-meta";

const INDUSTRIES: IndustryId[] = [
  "dental",
  "retail",
  "restaurant",
  "professional_services",
  "construction",
  "nonprofit",
  "general",
];

/** Dollar figures set by law rather than by the sample, which an owner's business shares. */
const STATUTORY_FIGURES = /gifts? of \$250 or more/;

/** Every piece of text a starter process, register item or scenario shows, with where it sits. */
function texts(value: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => texts(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (key === "id" || key === "category" || key.endsWith("Id") || key.endsWith("Ids")) continue;
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
          .filter((part) => !/^(dr|mr|mrs|ms)\.?$/i.test(part)),
      );
      const hits = [
        ...texts(tpl.processes, "processes"),
        ...texts(tpl.knowledge, "knowledge"),
        ...texts(tpl.scenarios, "scenarios"),
      ].filter(([, text]) => [...names].some((name) => new RegExp(`\\b${name}\\b`).test(text)));
      expect(hits).toEqual([]);
    });

    it(`quotes no sample dollar threshold as the owner's in the ${id} map or scenarios`, () => {
      const tpl = getIndustryTemplate(id);
      const quoted = [
        ...texts(
          tpl.processes.map((p) => [p.ideas ?? [], p.risks ?? [], p.wastes ?? []]),
          "processes",
        ),
        ...texts(
          tpl.scenarios.map((sc) => sc.mitigations.map((m) => m.label)),
          "mitigations",
        ),
      ].filter(([, text]) => /\$\s?\d/.test(text) && !STATUTORY_FIGURES.test(text));
      expect(quoted).toEqual([]);
    });
  }
});

/** Auditor shorthand and slang an owner would have to look up. */
const JARGON = /\b(SPOF|SoD|WIP|SOW|GM|OM|RCM|PMS|FIFO|recon)\b|tribal|sweethearting|86'd|→/;

describe("sample and industry text a small-business owner reads", () => {
  for (const id of INDUSTRIES) {
    it(`uses no auditor shorthand in the ${id} sample, its industry copy or the layer names`, () => {
      const tpl = getIndustryTemplate(id);
      const hits = [
        ...texts(tpl.processes, "processes"),
        ...texts(tpl.knowledge, "knowledge"),
        ...texts(tpl.controls, "controls"),
        ...texts(tpl.scenarios, "scenarios"),
        ...texts(getIndustryCopy(id), "copy"),
        ...texts(LAYER_META, "layers"),
      ].filter(([, text]) => JARGON.test(text));
      expect(hits).toEqual([]);
    });
  }
});
