import { resolveTemplate } from "../active-template";
import { industryMeta, industryNoun } from "../industry";
import { scoreMap } from "../builder/scored-map";
import type { PracticeProfile } from "../practice-profile";
import { evidenceStatus } from "../builder/evidence";
import type { SharedMapPayload } from "./share-schema";

/** Build the frozen share payload from the profile and its resolved template. */
export function buildSharePayload(
  profile: PracticeProfile,
  actions: { title: string; why: string; effort: string }[],
  note?: string,
  redactNames = false,
): SharedMapPayload {
  const tpl = resolveTemplate(profile);
  const meta = industryMeta(profile.industry);
  // Score the map as the map screen scores it: a starter process the owner
  // has not touched yet stays out of the health figure, its issues, and the
  // shared process list, so the share matches the map pill.
  const scored = scoreMap(tpl, tpl.processes, profile.staff, {
    profile: { industry: profile.industry, customPeople: profile.customPeople },
    people: tpl.people,
    layout: profile.mapLayout ?? {},
    customized: Boolean(profile.customProcesses || profile.customPeople),
  });
  const snapshots = scored.snapshots;
  const issues = scored.issues;
  const health = scored.health;
  const nameOf = (id: string) => tpl.people.find((p) => p.id === id)?.name;

  const payload: SharedMapPayload = {
    version: 1,
    businessName: profile.practiceName,
    industry: profile.industry,
    industryLabel: meta.label,
    teamLabel: meta.teamLabel,
    generatedAt: new Date().toISOString(),
    health: {
      score: health.score,
      bandLabel: health.bandLabel,
      summary: health.summary,
      dimensions: health.dimensions,
      processCount: health.processCount,
      avgHeat: health.avgHeat,
      hotProcesses: health.hotProcesses,
    },
    processes: snapshots
      .slice()
      .sort((a, b) => (a.process.stage ?? 0) - (b.process.stage ?? 0))
      .map((s) => ({
        id: s.process.id,
        name: s.process.name,
        description: s.process.description,
        stage: s.process.stage ?? 0,
        heat: s.heat,
        owners: (s.process.ownerPersonIds ?? []).map(nameOf).filter((x): x is string => Boolean(x)),
        controls: s.process.controlIds
          .map((id) => tpl.controls.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
          .map((c) => ({ name: c.name, segregated: c.segregated })),
        risks: (s.process.risks ?? []).slice(0, 5).map((r) => ({
          title: r.title,
          kind: r.kind,
          severity: r.severity,
          likelihood: r.likelihood,
        })),
        dependencies: s.process.dependencies,
        evidence: (s.process.evidence ?? []).map((e) => ({
          label: e.label,
          frequency: e.frequency,
          status: evidenceStatus(e).status,
        })),
      })),
    people: tpl.people.filter((p) => p.active).map((p) => ({ name: p.name, role: p.role })),
    issues: issues
      .filter((i) => i.severity !== "info")
      .map((i) => i.message)
      .slice(0, 10),
    actions: actions.slice(0, 6),
    note: note?.trim().slice(0, 600) || undefined,
  };

  return redactNames ? redactSharePayload(payload, tpl.people) : payload;
}

/**
 * Replace people's names with role labels ("Office Manager A") everywhere the
 * payload carries text: the people list, process owners and every sentence
 * (open issues, weekly actions, the health summary and hints, the note, and
 * process, risk, control and evidence wording), full names and first names
 * alike. Issues and actions name people ("Cara Voss has left", "Cross-train
 * Ben"), so relabelling the people list alone left the names on the page.
 *
 * `team` is the whole team, people who have left included: a departed owner
 * keeps their role in the label, and a name that appears only inside a
 * sentence is still caught. A client can set `namesHidden` and leave the names
 * in the text. Trust that flag only when no roster was supplied (a second
 * scrub of an already-redacted payload). A roster forces a real scrub.
 */
export function redactSharePayload(
  payload: SharedMapPayload,
  team: readonly { name: string; role: string }[] = [],
): SharedMapPayload {
  if (payload.namesHidden && team.length === 0) return payload;
  const labels = roleLabels(payload, team);
  const scrub = nameScrubber(labels);
  return {
    ...payload,
    businessName: hiddenBusinessName(payload, scrub),
    namesHidden: true,
    health: {
      ...payload.health,
      summary: scrub(payload.health.summary),
      dimensions: payload.health.dimensions.map((d) => ({ ...d, hint: scrub(d.hint) })),
    },
    processes: payload.processes.map((process) => ({
      ...process,
      name: scrub(process.name),
      description: scrub(process.description),
      owners: process.owners.map((owner) => labels.get(owner) ?? scrub(owner)),
      controls: process.controls.map((c) => ({ ...c, name: scrub(c.name) })),
      risks: process.risks.map((r) => ({ ...r, title: scrub(r.title) })),
      evidence: process.evidence.map((e) => ({ ...e, label: scrub(e.label) })),
    })),
    people: payload.people.map((person) => ({
      ...person,
      name: labels.get(person.name) ?? person.name,
    })),
    issues: payload.issues.map(scrub),
    actions: payload.actions.map((a) => ({ ...a, title: scrub(a.title), why: scrub(a.why) })),
    note: payload.note === undefined ? undefined : scrub(payload.note),
  };
}

/**
 * A business named after someone on the team ("Voss Dental") would name them
 * on a share that hides names, so such a name gives way to the industry's
 * word for a business ("A practice"). Any other business name stays.
 */
function hiddenBusinessName(payload: SharedMapPayload, scrub: (text: string) => string): string {
  if (scrub(payload.businessName) === payload.businessName) return payload.businessName;
  const noun = industryNoun(payload.industry);
  return `${/^[aeiou]/i.test(noun) ? "An" : "A"} ${noun}`;
}

/**
 * One label per name: the listed people first, in order, then process owners,
 * then anyone else on the team. Each role counts its own letters ("Hygienist
 * A", "Hygienist B"); a name with no known role is a "Team member".
 */
function roleLabels(
  payload: SharedMapPayload,
  team: readonly { name: string; role: string }[],
): Map<string, string> {
  const roleOf = new Map(team.map((person) => [person.name, person.role]));
  for (const person of payload.people) roleOf.set(person.name, person.role);
  const labels = new Map<string, string>();
  const perRole = new Map<string, number>();
  const add = (name: string) => {
    if (!name.trim() || labels.has(name)) return;
    const role = roleOf.get(name)?.trim() || "Team member";
    const n = perRole.get(role) ?? 0;
    perRole.set(role, n + 1);
    labels.set(name, `${role} ${n < 26 ? String.fromCharCode(65 + n) : n + 1}`);
  };
  for (const person of payload.people) add(person.name);
  for (const process of payload.processes) process.owners.forEach(add);
  for (const person of team) add(person.name);
  return labels;
}

/** Titles that can stand before a name: "Dr. Voss", "Mrs Lee". */
const HONORIFICS = [
  "dr",
  "mr",
  "mrs",
  "ms",
  "mx",
  "miss",
  "prof",
  "professor",
  "rev",
  "sir",
  "dame",
  "fr",
];
const HONORIFIC_WORD = new RegExp(`^(?:${HONORIFICS.join("|")})\\.?$`, "i");

/**
 * Name words that are also everyday English words. In lower case they read as
 * the word ("staff may", "the bank will"), so only their capitalised and
 * upper-case spellings count as a name.
 */
const COMMON_WORDS = new Set(
  [
    "art bill bob buck chase dale dean faith frank gay gene grace grant guy hope iris jack jay",
    "jewel joy june king lane mark max may miles nick pat penny price ray rich rob rose ruby sky",
    "sue summer violet ward will win baker bank banks bell bird black brown burns bush carter case",
    "cash check cook cross day field fisher fox gold gray green grey hill hunt knight lamb little",
    "long love mason mills moss north page park porter read reed rice sharp short silver small",
    "south stone waters wells west white wise wood young",
  ]
    .join(" ")
    .split(" "),
);

/** Abbreviations a small business's books and processes use every day. */
const BOOKKEEPING_ABBREVIATIONS = new Set([
  "AP",
  "AR",
  "GL",
  "PO",
  "HR",
  "IT",
  "CC",
  "PR",
  "PL",
  "BS",
  "CF",
  "QB",
  "VP",
  "CEO",
  "CFO",
  "COO",
  "ACH",
  "EFT",
  "POS",
  "PTO",
]);

/**
 * Every way a sentence can name one person: the full name, the name without
 * its title, each name word (both halves of "Smith-Jones" too) and the
 * upper-case initials ("CV", "C.V."; undotted ones that spell a bookkeeping
 * term such as "AP" are left as they are). Single letters are left out.
 */
function nameForms(name: string): { form: string; anyCase: boolean }[] {
  const full = name.trim().replace(/\s+/g, " ");
  const words = full
    .split(" ")
    .filter((w) => !HONORIFIC_WORD.test(w))
    .map((w) => w.replace(/[.,]+$/, ""))
    .filter(Boolean);
  const parts = words.flatMap((w) => (w.includes("-") ? [w, ...w.split("-")] : [w]));
  const forms = [full, words.join(" "), ...parts]
    .filter((form) => [...form].length >= 2)
    .map((form) => ({
      form,
      // A short or everyday word in lower case is "do", "an" or "will", not a person.
      anyCase:
        form.includes(" ") || ([...form].length >= 3 && !COMMON_WORDS.has(form.toLowerCase())),
    }));
  if (words.length >= 2) {
    const initial = (w: string) => [...w][0].toUpperCase();
    const sets = [words.map(initial), [initial(words[0]), initial(words[words.length - 1])]];
    for (const letters of sets) {
      // Undotted initials that spell a bookkeeping term ("AP", "AR", "GL")
      // stay: in a shared map they almost always mean the term, not a person.
      if (!BOOKKEEPING_ABBREVIATIONS.has(letters.join(""))) {
        forms.push({ form: letters.join(""), anyCase: false });
      }
      forms.push({ form: `${letters.join(".")}.`, anyCase: false });
    }
  }
  return forms;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A pattern for `form` in any letter case ("voss", "VOSS"), any run of spaces between words. */
function anyCasePattern(form: string): string {
  return [...form]
    .map((c) => {
      if (/\s/.test(c)) return "\\s+";
      const lower = c.toLowerCase();
      const upper = c.toUpperCase();
      return lower !== upper && [...lower].length === 1 && [...upper].length === 1
        ? `[${lower}${upper}]`
        : escapeRegExp(c);
    })
    .join("");
}

/** A pattern for `form` as written, capitalised or in upper case ("May", "MAY", not "may"). */
function writtenCasePattern(form: string): string {
  const capitalised = form.charAt(0).toUpperCase() + form.slice(1);
  return [...new Set([form, capitalised, form.toUpperCase()])].map(escapeRegExp).join("|");
}

/**
 * Replaces every labelled name in a sentence, whole words only: the full name,
 * each name word (given name, middle name, surname) in any letter case, a
 * title before it ("Dr. Voss") and initials ("CV", "C. Voss"). "Caramel"
 * stays. A name word two people share becomes "Team member", since it cannot
 * say which one. Lower-case short words and everyday words that are also
 * names ("an", "may", "will") stay, since they read as the word.
 */
function nameScrubber(labels: Map<string, string>): (text: string) => string {
  const key = (form: string) => form.toLowerCase().replace(/\s+/g, " ");
  const fullNames = new Map<string, string>();
  const partLabels = new Map<string, Set<string>>();
  const patterns = new Map<string, string>();
  for (const [name, label] of labels) {
    for (const [i, { form, anyCase }] of nameForms(name).entries()) {
      const k = key(form);
      if (i === 0) fullNames.set(k, label);
      else partLabels.set(k, (partLabels.get(k) ?? new Set()).add(label));
      const pattern = anyCase ? anyCasePattern(form) : writtenCasePattern(form);
      if (!patterns.has(pattern)) patterns.set(pattern, form);
    }
  }
  const replacements = new Map(fullNames);
  for (const [k, set] of partLabels) {
    if (!replacements.has(k)) replacements.set(k, set.size === 1 ? [...set][0] : "Team member");
  }
  if (!replacements.size) return (text) => text;
  const alternatives = [...patterns]
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([pattern]) => pattern)
    .join("|");
  const title = `(?:${HONORIFICS.map(anyCasePattern).join("|")})\\.?\\s+`;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${title})?(?:\\p{Lu}\\.\\s*)*(${alternatives})(?![\\p{L}\\p{N}])`,
    "gu",
  );
  return (text) =>
    text.replace(pattern, (match, name: string) => replacements.get(key(name)) ?? match);
}
