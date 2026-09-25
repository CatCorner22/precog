import type { EntitlementId } from "../sod/conflict-rules";
import { JOB_CATALOG, type JobCatalogEntry } from "./job-catalog-data";

/**
 * Reads a typed or imported job title against the catalog: abbreviations
 * expanded, seniority and schedule words dropped, the closest catalog seat
 * found, and its duties returned for the industry at hand.
 */
/** Words that join a title's parts and carry no meaning of their own. */
const STOP_WORDS = new Set(["the", "of", "and", "for", "to", "s"]);

/** Seniority, schedule and contract words: "Senior AP Clerk (part-time)" is an AP clerk. */
const DECORATION_WORDS = new Set([
  "senior",
  "sr",
  "junior",
  "jr",
  "i",
  "ii",
  "iii",
  "iv",
  "1",
  "2",
  "3",
  "part",
  "full",
  "time",
  "pt",
  "ft",
  "temp",
  "temporary",
  "interim",
  "acting",
  "seasonal",
  "contract",
  "contractor",
  "trainee",
  "volunteer",
]);

/**
 * Level and department words that say nothing about money duties on their
 * own. A title the catalog does not know as a whole ("Nursing Supervisor",
 * "Product Manager") must not fall back to the money duties of a job that
 * merely shares one of these words with it.
 */
const GENERIC_ROLE_WORDS = new Set([
  "manager",
  "mgr",
  "supervisor",
  "lead",
  "leader",
  "associate",
  "assistant",
  "asst",
  "clerk",
  "admin",
  "administrator",
  "technician",
  "tech",
  "operator",
  "aide",
  "coordinator",
  "director",
  "officer",
  "agent",
  "representative",
  "rep",
  "worker",
  "staff",
  "member",
  "head",
  "chief",
  "executive",
  "runner",
  "host",
  "partner",
  "principal",
  "president",
  "founder",
  "vp",
  "professional",
  "generalist",
  "support",
  "service",
  "services",
  "sales",
  "team",
  "crew",
  "specialist",
  "analyst",
]);

/** Abbreviations HR and payroll systems write, expanded to the words the catalog uses. */
const ABBREVIATIONS: Record<string, string> = {
  mgr: "manager",
  mgmt: "management",
  asst: "assistant",
  assoc: "associate",
  acctg: "accounting",
  accts: "accounts",
  dir: "director",
  ops: "operations",
  coord: "coordinator",
  spec: "specialist",
  tech: "technician",
  exec: "executive",
  ofc: "office",
  svc: "service",
  pres: "president",
  proj: "project",
  eng: "engineer",
  supv: "supervisor",
  supt: "superintendent",
  rep: "representative",
  recept: "receptionist",
  maint: "maintenance",
  mktg: "marketing",
  cust: "customer",
};

/**
 * "Acct" read by the word after it. Before a sales word it is an account
 * ("Acct Exec", "Key Acct Manager"); before a clerical word it is accounting
 * ("Acct Clerk"); before payable or receivable it is accounts; on its own or
 * last ("Sr. Acct", "Staff Acct") it is an accountant.
 */
const ACCT_BEFORE: Record<string, string> = {
  exec: "account",
  executive: "account",
  manager: "account",
  mgr: "account",
  rep: "account",
  representative: "account",
  director: "account",
  dir: "account",
  coordinator: "account",
  coord: "account",
  payable: "accounts",
  receivable: "accounts",
  clerk: "accounting",
  assistant: "accounting",
  asst: "accounting",
  specialist: "accounting",
  spec: "accounting",
  analyst: "accounting",
  associate: "accounting",
  assoc: "accounting",
  supervisor: "accounting",
  supv: "accounting",
  technician: "accounting",
  tech: "accounting",
};

/** "A/P Clerk", "A/R Specialist", "I.T. Manager": the letters are one word. */
function joinLetterPairs(value: string): string {
  return value
    .replace(/\ba\s*\/\s*p\b/gi, "AP")
    .replace(/\ba\s*\/\s*r\b/gi, "AR")
    .replace(/\bi\.?\s*t\.?(?=\s|$)/gi, "IT");
}

function tokens(value: string): string[] {
  const raw = joinLetterPairs(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
  return raw.map((t, i) =>
    t === "acct" ? (ACCT_BEFORE[raw[i + 1]] ?? "accountant") : (ABBREVIATIONS[t] ?? t),
  );
}

/** The same title with seniority, schedule and contract words removed. */
function undecorated(words: readonly string[]): string[] {
  return words.filter((t) => !DECORATION_WORDS.has(t));
}

/**
 * Every name the catalog knows, as written, joined with single spaces.
 * Decoration words are not removed from the names themselves: "contract
 * manager" must stay a contracts administrator and not become "manager".
 */
const ALIAS_INDEX: { alias: string; entry: JobCatalogEntry }[] = JOB_CATALOG.flatMap((e) =>
  [e.title, ...e.aliases].map((alias) => ({ alias: tokens(alias).join(" "), entry: e })),
)
  .filter((a) => a.alias.length > 0)
  // Longest alias first, so "accounts payable clerk" wins over "clerk".
  .sort((a, b) => b.alias.length - a.alias.length);

const EXACT_ALIAS = new Map<string, JobCatalogEntry>();
for (const a of ALIAS_INDEX) if (!EXACT_ALIAS.has(a.alias)) EXACT_ALIAS.set(a.alias, a.entry);

const catalogEntry = (id: string): JobCatalogEntry => JOB_CATALOG.find((e) => e.id === id)!;

/**
 * Last words that name a learner's or helper's seat: "Accounting Student" is
 * a student and "Marketing Intern" an intern, not an accountant or a
 * marketer. "Trainee" is not here: a payroll trainee or a manager trainee
 * does the job while learning it.
 */
const LEARNER_WORDS = new Set(["intern", "volunteer", "apprentice", "aide", "student"]);

/** The intern's seat when the last word of a longer title names a learner. */
function learnerSeat(words: readonly string[]): JobCatalogEntry | undefined {
  return words.length > 1 && LEARNER_WORDS.has(words[words.length - 1])
    ? catalogEntry("intern")
    : undefined;
}

/**
 * Words that name the owner's seat. After "to", "for", "of" or "reports to",
 * or as a possessive, they name the person a job serves ("Assistant to the
 * Owner", "Owner's Rep", "Bookkeeper (Owner's son)"), never the job itself.
 */
const OWNER_WORDS =
  "owners?|ceo|president|founder|co-founder|proprietor|principal|managing partner|partner|chief executive officer|chief executive|boss";
const PATRON_CLAUSE = new RegExp(
  `\\b(?:(?:reports?|reporting)\\s+to|to|for|of)\\s+(?:the\\s+)?(?:${OWNER_WORDS})(?:\\s*(?:/|&|,|\\band\\b)\\s*(?:the\\s+)?(?:${OWNER_WORDS}))*\\b`,
  "gi",
);
const PATRON_POSSESSIVE = new RegExp(`\\b(?:${OWNER_WORDS})['’]s?(?=\\s)`, "gi");
const OWNER_NAMED = new RegExp(`\\b(?:${OWNER_WORDS})\\b`, "i");

/** "Office Manager - reports to Controller": whom a job reports to is not the job. */
const REPORTS_TO = /\b(?:reports?|reporting)\s+to\s+[^,;/|()–—-]*/gi;

/**
 * "Assistant to the Controller", "Secretary to the Board": an assistant named
 * for the person they support, whose seat is not the assistant's.
 */
const ASSISTANT_TO = /^(.*\b(?:assistant|secretary|asst\.?))\s+to\s+(?:the\s+)?(.+)$/i;

/** Words that, left alone once the owner is taken out, describe an assistant to the owner. */
const ASSISTANT_WORDS = new Set([
  "assistant",
  "executive",
  "personal",
  "administrative",
  "admin",
  "secretary",
]);

/** A single-word owner name that counts only as the whole title: a card dealer owns nothing. */
const WHOLE_TITLE_ONLY = new Set(["dealer"]);

const carriesMoneyDuty = (e: JobCatalogEntry) =>
  e.entitlements.some((d) => d !== "view_reports_only");

/** The whole title, as written or with its decorations removed, is a known name. */
function exactMatch(words: readonly string[]): JobCatalogEntry | undefined {
  return EXACT_ALIAS.get(words.join(" ")) ?? EXACT_ALIAS.get(undecorated(words).join(" "));
}

/**
 * One part of a combined title. A part that is only a level word ("Clerk" in
 * "Clerk, Accounts Receivable") names no seat on its own when it would carry
 * money duties; the other part does.
 */
function partMatch(words: readonly string[]): JobCatalogEntry | undefined {
  const bare = undecorated(words);
  if (bare.length === 1 && GENERIC_ROLE_WORDS.has(bare[0])) {
    const e = EXACT_ALIAS.get(bare[0]);
    return e && !carriesMoneyDuty(e) ? e : undefined;
  }
  return (
    EXACT_ALIAS.get(words.join(" ")) ??
    learnerSeat(words) ??
    exactMatch(words) ??
    containedMatch(words)
  );
}

/**
 * A known name appears inside a longer title. A name of several words counts
 * wherever it sits ("Assistant Front Desk Coordinator"). A single word counts
 * wherever it sits too ("Senior Buyer", "Billing Supervisor"), unless it is a
 * level word on a job that carries money duties: "Nursing Supervisor" is not
 * a shift lead who prepares deposits, and stays unknown for the owner to
 * tick by hand. A single word naming the owner counts only as the last word
 * ("Salon Owner", not "Owner Relations Manager").
 */
function containedMatch(words: readonly string[]): JobCatalogEntry | undefined {
  const forms = [words, undecorated(words)].map((w) => ` ${w.join(" ")} `);
  for (const a of ALIAS_INDEX) {
    if (!a.alias.includes(" ")) continue;
    if (forms.some((f) => f.includes(` ${a.alias} `))) return a.entry;
  }
  const learner = learnerSeat(words);
  if (learner) return learner;
  const bare = undecorated(words);
  for (const [i, w] of bare.entries()) {
    const e = EXACT_ALIAS.get(w);
    // A leading learner word ("Apprentice Electrician") qualifies the job after it.
    if (!e || WHOLE_TITLE_ONLY.has(w) || LEARNER_WORDS.has(w)) continue;
    if (GENERIC_ROLE_WORDS.has(w) && carriesMoneyDuty(e)) continue;
    if (e.id === "owner" && i !== bare.length - 1) continue;
    return e;
  }
  return undefined;
}

export interface JobMatch {
  /** The seat the title names; for a combined title, its first known part (the owner if any part is the owner). */
  entry: JobCatalogEntry;
  /** exact: the whole title is a known name; partial: a known name appears inside a longer or combined title. */
  confidence: "exact" | "partial";
  /** The duties the title carries: for "Office Manager / Bookkeeper", both seats' duties together. */
  entitlements: EntitlementId[];
}

/**
 * A bare title that means one seat in one line of business: "Associate" is
 * an attorney in a law firm and a sales associate in a store; "Assistant" is
 * a dental assistant in a dental office; a "Crew Lead" runs a field crew in a
 * general or trades business and a shift in a store or restaurant; a
 * "Business Assistant" is the front desk of a dental office. Anywhere else
 * the catalog's own reading stands (or, for a level word, nothing).
 */
const INDUSTRY_HINTS: Record<string, Record<string, string>> = {
  associate: { professional_services: "attorney", retail: "cashier", restaurant: "server" },
  assistant: { dental: "dental-assistant" },
  technician: { dental: "dental-assistant" },
  partner: { professional_services: "owner" },
  "crew lead": { general: "foreman", construction: "foreman" },
  "crew leader": { general: "foreman", construction: "foreman" },
  // On a job site a "super" is the superintendent.
  super: { construction: "foreman" },
  // A nonprofit's treasurer is a board officer, and its CEO is its executive director.
  treasurer: { nonprofit: "board-treasurer" },
  ceo: { nonprofit: "executive-director" },
  "chief executive officer": { nonprofit: "executive-director" },
  // A nonprofit's program manager runs a program, not a client project.
  "program manager": { nonprofit: "program-director" },
  "business assistant": { dental: "receptionist" },
  // A CSR in a dental, medical or veterinary office is the front desk.
  csr: { dental: "receptionist" },
  "customer service representative": { dental: "receptionist" },
  // A restaurant's general manager runs the floor and the drawer as well as the books.
  "general manager": { restaurant: "restaurant-manager" },
  gm: { restaurant: "restaurant-manager" },
};

/**
 * How a seat differs in one line of business from its usual duties. In a
 * dental, medical or veterinary office the office manager usually keeps the
 * practice's books, bank reconciliation included. In a store the till records
 * the sales, so the bookkeeper posts the takings as a journal entry rather
 * than recording customer payments. In a law or accounting firm the front
 * desk takes payments and billing records them. A contractor's project
 * manager approves subcontractor bills; a nonprofit's development office
 * records the gifts it receives.
 */
const INDUSTRY_SEATS: Record<
  string,
  Record<string, { add?: readonly EntitlementId[]; remove?: readonly EntitlementId[] }>
> = {
  dental: { "office-manager": { add: ["bank_reconcile"] } },
  retail: { bookkeeper: { remove: ["post_payments"] } },
  professional_services: { receptionist: { remove: ["post_payments"] } },
  // A contractor's project manager approves subcontractor pay applications
  // and orders materials for the job.
  construction: { "project-manager": { add: ["approve_invoices", "order_supplies"] } },
  // Development enters the gifts it receives in the donor database.
  nonprofit: { "development-director": { add: ["post_payments"] } },
};

/** A seat's usual duties in this line of business. */
export function seatDuties(entry: JobCatalogEntry, industry?: string): EntitlementId[] {
  const change = industry ? INDUSTRY_SEATS[industry]?.[entry.id] : undefined;
  const removed = new Set(change?.remove ?? []);
  return Array.from(new Set([...entry.entitlements, ...(change?.add ?? [])])).filter(
    (d) => !removed.has(d),
  );
}

function seatMatch(
  entries: readonly JobCatalogEntry[],
  confidence: JobMatch["confidence"],
  industry?: string,
): JobMatch {
  const entry = entries.find((e) => e.id === "owner") ?? entries[0];
  const entitlements = Array.from(new Set(entries.flatMap((e) => seatDuties(e, industry))));
  return { entry, confidence, entitlements };
}

/**
 * Takes out a clause or possessive naming the owner as the person a job
 * serves, and a "reports to" clause naming anyone. Returns the rest of the
 * title and whether the owner was named, or undefined when there is no such
 * clause.
 */
function withoutPatron(title: string): { rest: string; owner: boolean } | undefined {
  const withoutOwner = title.replace(PATRON_CLAUSE, " ").replace(PATRON_POSSESSIVE, " ");
  const rest = trimTrailingJoiners(
    withoutOwner.replace(REPORTS_TO, " ").replace(/\(\s*\)/g, " "),
  ).trim();
  if (rest === title.trim()) return undefined;
  return { rest, owner: withoutOwner !== title };
}

/** A character left dangling at the end of a title once a clause is taken out. */
const TRAILING_JOINER = /[\s/,;|\-–—(]/u;

/**
 * Drops trailing spaces, slashes, commas, dashes and open brackets. A loop,
 * not a regular expression ending in "+$": that pattern backtracks from every
 * position in a long run of spaces, and a pasted line with "(" followed by
 * thousands of spaces froze the page for minutes.
 */
function trimTrailingJoiners(value: string): string {
  let end = value.length;
  while (end > 0 && TRAILING_JOINER.test(value[end - 1])) end--;
  return value.slice(0, end);
}

/** Longer than any real job title; a pasted line past this is not one title. */
const MAX_TITLE_LENGTH = 160;

/**
 * Finds the catalog entry for a roster title. Seniority and schedule words
 * are ignored ("Senior AP Clerk (part-time)" is an AP clerk). A title with
 * several parts ("Office Manager / Bookkeeper", "Chef/Owner") names every
 * seat it lists and carries all of their duties, because that is exactly the
 * concentration the map exists to show. A title that names the owner only as
 * the person served ("Owner's Assistant", "Office Manager - reports to
 * Owner") never takes the owner's seat. Returns undefined when nothing
 * matches, so the caller can leave the duties for the owner to tick rather
 * than guess.
 */
export function matchJobTitle(rawTitle: string, industry?: string): JobMatch | undefined {
  const title = rawTitle.slice(0, MAX_TITLE_LENGTH);
  const words = tokens(title);
  if (words.length === 0) return undefined;
  const bare = undecorated(words);
  if (industry) {
    const hinted = INDUSTRY_HINTS[bare.join(" ")]?.[industry];
    if (hinted) return seatMatch([catalogEntry(hinted)], "partial", industry);
  }
  // "Assistant to the Controller" is an administrative assistant, not a
  // controller; an assistant to the owner is the owner's executive assistant.
  const assistantTo = title.match(ASSISTANT_TO);
  if (assistantTo && !OWNER_NAMED.test(assistantTo[2])) {
    const headWords = tokens(assistantTo[1]);
    const head = exactMatch(headWords);
    if (head) return seatMatch([head], "partial", industry);
    if (undecorated(headWords).every((w) => ASSISTANT_WORDS.has(w))) {
      return seatMatch([catalogEntry("administrative-assistant")], "partial", industry);
    }
    const served = matchJobTitle(assistantTo[1], industry);
    return served && { ...served, confidence: "partial" };
  }
  const literal = EXACT_ALIAS.get(words.join(" "));
  if (literal) return seatMatch([literal], "exact", industry);

  const patron = withoutPatron(title);
  if (patron !== undefined) {
    const restWords = undecorated(tokens(patron.rest));
    if (restWords.length === 0) return undefined;
    if (patron.owner && restWords.every((w) => ASSISTANT_WORDS.has(w))) {
      return seatMatch([catalogEntry("executive-assistant")], "partial", industry);
    }
    const served = matchJobTitle(patron.rest, industry);
    return served && { ...served, confidence: "partial" };
  }

  // Slashes, commas, brackets, dashes and "and" join seats: "Chef/Owner",
  // "Owner-Operator", "Payroll & HR Administrator".
  const joined = joinLetterPairs(title);
  const parts = joined
    .split(/[/,;()|\-–—]|\s(?:and|&)\s/i)
    .map(tokens)
    .filter((p) => p.length > 0);
  // A learner's last word counts in a one-part title ("Accounting Student");
  // "Bookkeeper (Volunteer)" is a bookkeeper who is not paid.
  const learner = parts.length === 1 ? learnerSeat(words) : undefined;
  if (learner) return seatMatch([learner], "partial", industry);
  const whole = exactMatch(words);
  if (whole) return seatMatch([whole], "exact", industry);
  const matched: JobCatalogEntry[] = [];
  if (parts.length === 2) {
    // "Clerk, Accounts Receivable" is an accounts receivable clerk.
    const reversed = exactMatch([...parts[1], ...parts[0]]);
    if (reversed) return seatMatch([reversed], "partial", industry);
  }
  // Two parts joined by "and" or a slash share words: "Office & HR Manager"
  // borrows the last word of the other part, "Accounts Payable and
  // Receivable Clerk" its first. Not for "(Property)" after a title, which
  // qualifies it. A borrowed seat replaces a part that reads alone only
  // through a level word with no money duty ("Receivable Specialist"), and a
  // one-word part joined by "and" ("Marketing & Events Coordinator" is a
  // marketing coordinator). "Nurse/Office Manager" stays a nurse and an office
  // manager: a nurse is a known name on its own.
  const shared = parts.length === 2 && /\s(?:and|&)\s|\//i.test(joined);
  const sharedTail = parts.length === 2 && /\s(?:and|&)\s/i.test(joined);
  if (parts.length > 1) {
    for (const [i, part] of parts.entries()) {
      // A part can carry this line of business's own reading: a dental "CSR"
      // works the front desk, so "CSR - Front Desk" is one receptionist.
      const hinted = industry ? INDUSTRY_HINTS[undecorated(part).join(" ")]?.[industry] : undefined;
      const own = hinted ? catalogEntry(hinted) : partMatch(part);
      const other = parts[1 - i];
      const borrowed = shared
        ? (exactMatch([...part, other[other.length - 1]]) ?? exactMatch([other[0], ...part]))
        : undefined;
      const weak = !own || (!exactMatch(part) && !carriesMoneyDuty(own));
      const hit = borrowed && (weak || (sharedTail && part.length === 1)) ? borrowed : own;
      if (hit && !matched.includes(hit)) matched.push(hit);
    }
  }
  if (matched.length === 0) {
    const hit = containedMatch(words);
    if (hit) matched.push(hit);
  }
  if (matched.length === 0) return undefined;
  return seatMatch(matched, "partial", industry);
}

/** Duties the catalog suggests for a title, or an empty list when the title is unknown. */
export function entitlementsForTitle(title: string, industry?: string): EntitlementId[] {
  return matchJobTitle(title, industry)?.entitlements ?? [];
}
