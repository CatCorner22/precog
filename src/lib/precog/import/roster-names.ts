/** Name-shape checks for a roster: credentials, generations, companies, and "Last, First". */

export const NAME_SUFFIXES = new Set([
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
  "dds",
  "dmd",
  "md",
  "do",
  "od",
  "cpa",
  "rn",
  "np",
  "pa",
  "phd",
  "esq",
  "mba",
  "lpn",
  "cma",
  "ea",
]);

/** Generation suffixes stay part of the name ("Ana Ruiz Jr."); credentials follow a comma ("Ben Cole, CPA"). */
const GENERATION_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/** Lower-case words that begin a surname: "de la Cruz", "van Dyke". */
const SURNAME_PARTICLES = new Set([
  "de",
  "del",
  "della",
  "di",
  "da",
  "dos",
  "du",
  "la",
  "le",
  "van",
  "von",
  "der",
  "den",
  "ter",
  "st",
  "bin",
  "ibn",
  "al",
  "el",
]);

/** Words that make a cell a company's name, which is never reordered: "Acme Payroll, Inc.". */
const COMPANY_WORDS = new Set([
  "inc",
  "incorporated",
  "llc",
  "llp",
  "lp",
  "ltd",
  "limited",
  "co",
  "corp",
  "corporation",
  "company",
  "pc",
  "pllc",
  "plc",
  "gmbh",
  "group",
  "associates",
  "partners",
  "holdings",
  "services",
]);

/** First cell of a report footer row: totals, counts, page numbers, run stamps. */

export function wordKey(value: string): string {
  return value.toLowerCase().replace(/\./g, "").trim();
}

const NAME_WORD = /^\p{L}[\p{L}'’.-]*$/u;

/** One to three words of letters, as given names are written: "Ana", "Ana Maria", "Ana M.". */
export function looksLikeGivenNames(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 3 && words.every((w) => NAME_WORD.test(w));
}

/**
 * A surname: one to three words of letters ("Ruiz", "Ruiz Lopez", "de la
 * Cruz"). Strict allows only one word after any particles, for a list line
 * where "Ana Ruiz, Groomer" must stay a name and a title.
 */
export function looksLikeSurname(value: string, strict = false): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 3 || !words.every((w) => NAME_WORD.test(w))) return false;
  return !strict || words.slice(0, -1).every((w) => SURNAME_PARTICLES.has(wordKey(w)));
}

function namesCompany(value: string): boolean {
  return value.includes("&") || value.split(/[\s,]+/).some((w) => COMPANY_WORDS.has(wordKey(w)));
}

/**
 * "Ruiz, Ana" becomes "Ana Ruiz", "Diaz, Cal III" becomes "Cal Diaz III",
 * "Ruiz, Ana, Jr." becomes "Ana Ruiz Jr." and "Cole, Ben, CPA" becomes "Ben
 * Cole, CPA". A credential alone after the comma ("Jane Roe, DDS"), a
 * company ("Acme Payroll, Inc.", "Smith, Jones & Co") and anything else that
 * does not read as a surname and given names stay as written.
 */
export function reorderLastFirst(name: string): string {
  if (/\d/.test(name) || namesCompany(name)) return name;
  const parts = name.split(",").map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !part)) return name;
  const [last, given, credential] = parts;
  if (NAME_SUFFIXES.has(wordKey(given))) return name;
  if (credential !== undefined && !NAME_SUFFIXES.has(wordKey(credential))) return name;
  const givenWords = given.split(/\s+/);
  const trailing: string[] = [];
  while (givenWords.length > 1 && GENERATION_SUFFIXES.has(wordKey(givenWords.at(-1)!))) {
    trailing.unshift(givenWords.pop()!);
  }
  if (!looksLikeSurname(last) || !looksLikeGivenNames(givenWords.join(" "))) return name;
  const reordered = [...givenWords, last, ...trailing].join(" ");
  if (credential === undefined) return reordered;
  return GENERATION_SUFFIXES.has(wordKey(credential))
    ? `${reordered} ${credential}`
    : `${reordered}, ${credential}`;
}
