// Locked-report parity harness. A report version locked with stored figures
// keeps printing the layout it was locked under (REPORT_LAYOUT_VERSION and
// PRINTED_LAYOUT_VERSIONS in src/lib/precog/report/stored-model.ts), so a
// change to the report must leave every older layout's printed text alone.
//
// PARITY=dump on the base commit writes, for every industry sample and three
// own-business cases, the profile, its stored model and the printed text and
// HTML of every printed layout into PARITY_DIR. PARITY=check on the branch
// prints the same stored models under the same layouts, writes the .after
// files beside them and lists any text difference in PARITY_DIR/DIFFS; then
// scripts/parity/compare.py prints SAME or DIFF per layout with the print-only
// text (print:hidden parts removed). Every line must read SAME.
//
// `npm test` never runs this file: run it through scripts/parity/vitest.config.mjs
// (see .claude/skills/precog-verify/SKILL.md for the whole procedure).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import { INDUSTRIES } from "@/lib/precog/industry";
import {
  buildReportModelForProfile,
  PRINTED_LAYOUT_VERSIONS,
  serializeReportModel,
} from "@/lib/precog/report/stored-model";
import { ControlReport } from "@/components/precog/control-report";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const DIR = process.env.PARITY_DIR!;
const locked = {
  id: "v1",
  businessId: "b1",
  versionNo: 1,
  revision: null,
  scopeNote: "",
  preparedBy: null,
  preparedByName: "Ada Park",
  preparedAt: "2026-09-26T12:00:00.000Z",
  reviewedBy: null,
  reviewedByName: null,
  reviewedAt: null,
  reviewNote: "",
  reviewOverrideNote: null,
  sentAt: null,
  hasFigures: true,
  firm: null,
  engagement: null,
  reviewRequestedAt: null,
  reviewRequestedFrom: null,
  reviewRequestedFromName: null,
  returnedAt: null,
  returnedBy: null,
  returnedByName: null,
  returnNote: "",
} as unknown as ReportVersionRow;
const textOf = (html: string) => html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
const team = [
  {
    id: "a",
    name: "Ada Park",
    role: "Owner",
    active: true,
    owner: true,
    entitlements: ["approve_payroll", "sign_checks"],
  },
  {
    id: "b",
    name: "Ben Ortiz",
    role: "Bookkeeper",
    active: true,
    entitlements: ["enter_invoices", "release_payment", "bank_reconcile"],
  },
];
const cases = (): Array<[string, PracticeProfile]> => [
  ...INDUSTRIES.map((i) => [i.id, defaultProfile(i.id)] as [string, PracticeProfile]),
  [
    "own-dental",
    {
      ...defaultProfile("dental"),
      practiceName: "Ortiz Dental Studio",
      customPeople: team,
    } as PracticeProfile,
  ],
  [
    "own-empty",
    {
      ...defaultProfile("dental"),
      practiceName: "Ortiz Dental Studio",
      customPeople: team,
      customProcesses: [],
    } as PracticeProfile,
  ],
  [
    "own-partial",
    {
      ...defaultProfile("dental"),
      practiceName: "Ortiz Dental Studio",
      customPeople: team,
      customProcesses: defaultProfile("dental").customProcesses ?? undefined,
    } as PracticeProfile,
  ],
];
const html = (profile: PracticeProfile, model: unknown, layoutVersion: number) =>
  renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <ControlReport locked={locked} frozen={{ layoutVersion, model: model as never }} />
    </ReadOnlyPracticeProvider>,
  );
const print = (profile: PracticeProfile, model: unknown, layoutVersion: number) =>
  textOf(
    renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={profile}>
        <ControlReport locked={locked} frozen={{ layoutVersion, model: model as never }} />
      </ReadOnlyPracticeProvider>,
    ),
  );

describe("locked parity", () => {
  it("dumps or checks", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 26, 9));
    mkdirSync(DIR, { recursive: true });
    const diffs: string[] = [];
    if (process.env.PARITY === "dump") {
      for (const [id, profile] of cases()) {
        if (id === "own-partial") {
          const procs = (await import("@/lib/precog/templates")).getIndustryTemplate(
            "dental",
          ).processes;
          profile.customProcesses = procs.map((p, i) =>
            i === 0 ? { ...p, ownerPersonIds: ["b"] } : p,
          );
        }
        const model = serializeReportModel(buildReportModelForProfile(profile, "2026-09-26"));
        writeFileSync(`${DIR}/${id}.json`, JSON.stringify({ profile, model }));
        // The check reads this list, so a branch that adds a layout still
        // compares exactly the layouts the base commit printed.
        writeFileSync(`${DIR}/LAYOUTS`, PRINTED_LAYOUT_VERSIONS.join("\n"));
        for (const L of PRINTED_LAYOUT_VERSIONS) {
          writeFileSync(`${DIR}/${id}-L${L}.txt`, print(profile, model, L));
          writeFileSync(`${DIR}/${id}-L${L}.html`, html(profile, model, L));
        }
      }
    } else {
      const layouts = readFileSync(`${DIR}/LAYOUTS`, "utf8").split("\n").map(Number);
      for (const [id] of cases()) {
        const { profile, model } = JSON.parse(readFileSync(`${DIR}/${id}.json`, "utf8"));
        for (const L of layouts) {
          const before = readFileSync(`${DIR}/${id}-L${L}.txt`, "utf8");
          const after = print(profile, model, L);
          writeFileSync(`${DIR}/${id}-L${L}.after.txt`, after);
          writeFileSync(`${DIR}/${id}-L${L}.after.html`, html(profile, model, L));
          if (before !== after) diffs.push(`${id}-L${L}`);
        }
      }
      writeFileSync(`${DIR}/DIFFS`, diffs.join("\n"));
    }
    expect(true).toBe(true);
  });
});
