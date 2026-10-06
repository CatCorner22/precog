import type { ControlExecution } from "./controls/executions/model";
import type { FirmActivityRow } from "./firm/audit.server";
import type { UsageTotal } from "./llm/usage-log.server";

/*
 * The account export's shape and its assembly, shared by the server, which
 * sends it in parts (exportAccountPage in account-store.ts), and the browser,
 * which joins the parts into one file. One response holding everything
 * passed Vercel's 4.5 MB response limit for a firm with real volume: report
 * versions each carried a full profile and a copy of the firm's logo.
 */

/**
 * Everything Precog holds for one account, as one JSON document the owner can
 * keep. Left out on purpose: share passcode hashes and salts, invite link
 * tokens, and the encrypted QuickBooks tokens. Step pictures are listed with
 * everything stored about them and the address that serves each one, not
 * their bytes. Past versions of each business download separately
 * (exportBusinessHistoryPage in account-store.ts).
 */
export interface AccountExport {
  exportedAt: string;
  /** Server-recorded control work and review history; no evidence-file contents. */
  controlExecutions: Array<{ businessId: string; record: ControlExecution }>;
  user: { id: string; name: string; email: string; createdAt: string } | null;
  businesses: Array<{
    id: string;
    name: string;
    industry: string;
    revision: number;
    updatedAt: string;
    deletedAt: string | null;
    /** When the account shared the business with a firm (migration 0046); null otherwise. */
    grantedAt: string | null;
    profile: unknown;
  }>;
  /**
   * The account's invitations to firms to work on its businesses, accepted
   * or not, with the firm's name once one accepted. Never the link's token.
   */
  firmGrants: Array<{
    businessId: string;
    invitedEmail: string;
    createdAt: string;
    expiresAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
    firmName: string | null;
  }>;
  /** Businesses deleted for good; only the id and the day are kept. */
  deletedBusinesses: Array<{ businessId: string; deletedAt: string }>;
  /**
   * For a firm owner: the firm's client businesses that members set up, as
   * summaries (the profiles are the members' rows; each one's past versions
   * download through the history download, which lists them too). Empty for
   * everyone else.
   */
  firmClients: Array<{
    id: string;
    name: string;
    industry: string;
    ownerUserId: string;
    revision: number;
    updatedAt: string;
    deletedAt: string | null;
  }>;
  reportVersions: Array<{
    id: string;
    businessId: string;
    versionNo: number;
    revision: number | null;
    scopeNote: string;
    preparedBy: string | null;
    preparedAt: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
    reviewNote: string;
    /** Why someone reviewed in the assigned reviewer's place (migration 0056); null otherwise. */
    reviewOverrideNote: string | null;
    sentAt: string | null;
    /** The firm's name and letterhead as frozen at lock; null before migration 0041 and for a solo business. */
    firm: { name: string; letterhead: string; logoDataUrl: string | null } | null;
    /** The engagement's scope and period as frozen at lock; null before migration 0045 or when empty. */
    engagement: { scope: string; periodStart: string | null; periodEnd: string | null } | null;
    /** Request and return (migration 0047); null and empty when never asked or returned. */
    reviewRequestedAt: string | null;
    reviewRequestedBy: string | null;
    reviewRequestedFrom: string | null;
    returnedAt: string | null;
    returnedBy: string | null;
    returnNote: string;
    profile: unknown;
  }>;
  snapshots: Array<{
    id: string;
    title: string;
    practiceName: string;
    createdAt: string;
    profile: unknown;
    powerMap: unknown;
    valueCase: unknown;
    valueEvidence: unknown;
  }>;
  shares: Array<{
    token: string;
    businessName: string;
    createdAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    redacted: boolean;
    payload: unknown;
  }>;
  firm: {
    name: string;
    plan: string;
    letterhead: string;
    logoDataUrl: string | null;
    coverPage: boolean;
    /** How long the firm keeps a deleted client's records, in years. */
    retentionYears: number;
    updatedAt: string;
  } | null;
  /** Firms this account belongs to, its own included. */
  firmMemberships: Array<{ firmUserId: string; role: string; joinedAt: string }>;
  /** People in the firm this account owns. */
  firmMembers: Array<{ userId: string; email: string; role: string; joinedAt: string }>;
  firmInvites: Array<{
    email: string;
    role: string;
    createdAt: string;
    expiresAt: string;
    acceptedAt: string | null;
  }>;
  engagements: Array<{
    businessId: string;
    startedAt: string | null;
    mapCompletedAt: string | null;
    reportSentAt: string | null;
    /** Null when the count was never recorded (migration 0024), not zero. */
    openFindings: number | null;
    acceptedFindings: number;
    /** The client owner's email, kept for reminders. */
    ownerEmail: string | null;
    /** The engagement (migration 0045): what the firm was engaged to do, for when, by whom. */
    scope: string;
    periodStart: string | null;
    periodEnd: string | null;
    status: string;
    endedAt: string | null;
    preparerUserId: string | null;
    reviewerUserId: string | null;
  }>;
  reviews: Array<{
    businessId: string;
    period: string;
    itemKey: string;
    ownerName: string;
    dueOn: string | null;
    result: string;
    notes: string;
    recordedAt: string;
    recordedBy: string | null;
  }>;
  /** Pictures attached to procedure steps; `path` serves the picture while the account exists. */
  procedureImages: Array<{
    id: string;
    businessId: string;
    contentType: string;
    byteSize: number;
    width: number;
    height: number;
    sha256: string;
    uploadedBy: string | null;
    createdAt: string;
    /** When no step named it any more; it is deleted 30 days after. */
    unreferencedSince: string | null;
    path: string;
  }>;
  reminderSettings: { weeklyDigest: boolean; ownerReminders: boolean } | null;
  remindersSent: Array<{
    businessId: string;
    itemKey: string;
    dueOn: string | null;
    recipient: string;
    sentAt: string;
  }>;
  /** What Stripe last reported; no card details are stored here. */
  billing: {
    stripeCustomerId: string | null;
    subscriptionId: string | null;
    subscriptionStatus: string | null;
    assessmentPaidAt: string | null;
    assessmentPaymentIntentId: string | null;
    assessmentRefundedAt: string | null;
    assessmentDisputedAt: string | null;
    currentPeriodEnd: string | null;
    /** The Stripe price the subscription runs on (migration 0050); null until an event names it. */
    subscriptionPriceId: string | null;
  } | null;
  quickBooksConnections: Array<{
    businessId: string;
    realmId: string;
    connectedAt: string;
    /** The account that finished the connect flow; null before it was recorded. */
    connectedBy: string | null;
    lastSyncedAt: string | null;
    lastError: string | null;
  }>;
  quickBooksSnapshots: Array<{
    businessId: string;
    takenAt: string;
    vendors: unknown;
    employees: unknown;
  }>;
  /** The account's milestones (first business, first locked version, first report sent, first monthly review). */
  activity: Array<{ event: string; businessId: string | null; occurredAt: string }>;
  /** Model calls the account made, per feature: calls and tokens, never the text. */
  modelUsage: UsageTotal[];
  /**
   * For a firm owner: the firm's activity log (migration 0048), newest
   * first, with each actor's name as it was. Empty for everyone else.
   */
  firmActivity: FirmActivityRow[];
}

/** A report version as the download writes it: its frozen logo is named, not repeated. */
export type ExportedReportVersion = Omit<AccountExport["reportVersions"][number], "firm"> & {
  /** `logoId` names the logo in the file's `reportLogos`; null when the version froze none. */
  firm: { name: string; letterhead: string; logoId: string | null } | null;
};

/** The download: AccountExport with each distinct logo the versions froze once, in `reportLogos`. */
export type AccountExportFile = Omit<AccountExport, "reportVersions"> & {
  reportVersions: ExportedReportVersion[];
  reportLogos: Array<{ id: string; dataUrl: string }>;
};

/** The sections whose rows come in pages sized by HISTORY_PAGE_BYTES, in the order they are fetched. */
export const PAGED_EXPORT_SECTIONS = [
  "businesses",
  "reportVersions",
  "reportLogos",
  "snapshots",
  "shares",
  "controlExecutions",
  "quickBooksSnapshots",
  "procedureImages",
  "reviews",
  "remindersSent",
  "firmActivity",
] as const;

export type PagedExportSection = (typeof PAGED_EXPORT_SECTIONS)[number];

/** The first part: the account's own small sections. */
export type AccountExportPart = Pick<
  AccountExportFile,
  | "exportedAt"
  | "user"
  | "firmGrants"
  | "deletedBusinesses"
  | "firmMemberships"
  | "engagements"
  | "reminderSettings"
  | "billing"
  | "quickBooksConnections"
  | "activity"
  | "modelUsage"
>;

/** The second part: the firm the account owns, its logo once, its people and its clients. */
export type FirmExportPart = Pick<
  AccountExportFile,
  "firm" | "firmMembers" | "firmInvites" | "firmClients"
>;

/**
 * The vendors and the employees one part of a QuickBooks reading holds, each
 * as [from, to): the element positions from `from` up to, not including, `to`.
 */
export interface ExportSlice {
  vendors: [number, number];
  employees: [number, number];
}

/** A paged part, as the first part's list gives it; the browser sends it back unchanged. */
export interface PagedPartRequest {
  section: PagedExportSection;
  /** The part's first and last row by the section's sort key, both included. */
  first: string;
  last: string;
  /**
   * How many rows the plan counted between them: the server never sends
   * more, and the download refuses a part that comes back with fewer.
   */
  count: number;
  /**
   * When the plan was made, to the microsecond: a row written after it (a
   * version locked, a reading taken) stays out of the part.
   */
  asOf: string;
  /**
   * A QuickBooks reading too large for one part comes in several, each with
   * the slice of its vendors and employees it holds; a part whose slice does
   * not start at the first vendor and employee continues the reading before it.
   */
  slice?: ExportSlice;
}

/** Which part to send. */
export type ExportPartRequest = { section: "account" } | { section: "firm" } | PagedPartRequest;

/**
 * One part as the server sends it (base64 JSON on the wire; see
 * decodeExportPage). `continues` marks a part that holds one more slice of
 * the QuickBooks reading the part before it began.
 */
export type ExportPage =
  | { section: "account"; data: AccountExportPart }
  | { section: "firm"; data: FirmExportPart }
  | {
      [S in PagedExportSection]: { section: S; rows: AccountExportFile[S]; continues?: true };
    }[PagedExportSection];

/**
 * What the download says when the data changed while it ran, so that a
 * part came back with fewer or more rows than the plan counted: the file
 * would be incomplete, so it is not saved. The server refuses a part with
 * the same words (409).
 */
export const EXPORT_CHANGED =
  "Your data changed while Precog prepared the download, so Precog did not save the file. Try again.";

/** The refusal of a download whose data changed under it (EXPORT_CHANGED). */
export class ExportChangedError extends Error {
  constructor() {
    super(EXPORT_CHANGED);
    this.name = "ExportChangedError";
  }
}

/** Whether a part continues the QuickBooks reading the part before it began. */
export function continuesReading(part: ExportPartRequest): boolean {
  return "slice" in part && part.slice !== undefined
    ? part.slice.vendors[0] > 0 || part.slice.employees[0] > 0
    : false;
}

/**
 * Whether a part came back as the plan made it: the section asked for, and
 * for a paged part exactly the rows the plan counted, continuing a reading
 * when it was planned to. Anything else means the data changed during the
 * download (a row deleted, or moved to another account).
 */
export function partArrivedWhole(part: ExportPartRequest, page: ExportPage): boolean {
  if (page.section !== part.section) return false;
  if (!("count" in part) || !("rows" in page)) return !("count" in part) && !("rows" in page);
  return page.rows.length === part.count && (page.continues === true) === continuesReading(part);
}

/** A part as the server function returns it: the page's JSON in base64. */
export function decodeExportPage(base64: string): ExportPage {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as ExportPage;
}

/** The progress line while the parts download. */
export function exportProgressLabel(done: number, total: number): string {
  return `Preparing your download: ${done} of ${total} parts`;
}

/**
 * Joins the parts, in the order they were fetched, into one file with the
 * sections in the order the single export wrote them. The account part
 * comes first; each paged section's rows follow one another, a QuickBooks
 * reading's slices join back into the one reading, and the businesses go
 * newest saved first (their parts come in id order: the id never changes,
 * so a save during the download cannot move a business out of its part).
 */
export function assembleAccountExport(pages: ExportPage[]): AccountExportFile {
  const first = pages[0];
  if (first?.section !== "account") throw new Error("The export starts with the account part");
  let firm: FirmExportPart = { firm: null, firmMembers: [], firmInvites: [], firmClients: [] };
  const rows = Object.fromEntries(PAGED_EXPORT_SECTIONS.map((s) => [s, [] as unknown[]])) as {
    [S in PagedExportSection]: AccountExportFile[S];
  };
  for (const page of pages.slice(1)) {
    if (page.section === "account") throw new Error("The export has one account part");
    if (page.section === "firm") firm = page.data;
    else if (page.continues) continueReading(rows.quickBooksSnapshots, page);
    else for (const row of page.rows) (rows[page.section] as unknown[]).push(row);
  }
  rows.businesses.sort(newestSavedFirst);
  const a = first.data;
  return {
    exportedAt: a.exportedAt,
    controlExecutions: rows.controlExecutions,
    user: a.user,
    businesses: rows.businesses,
    firmGrants: a.firmGrants,
    deletedBusinesses: a.deletedBusinesses,
    firmClients: firm.firmClients,
    reportVersions: rows.reportVersions,
    reportLogos: rows.reportLogos,
    snapshots: rows.snapshots,
    shares: rows.shares,
    firm: firm.firm,
    firmMemberships: a.firmMemberships,
    firmMembers: firm.firmMembers,
    firmInvites: firm.firmInvites,
    engagements: a.engagements,
    reviews: rows.reviews,
    reminderSettings: a.reminderSettings,
    remindersSent: rows.remindersSent,
    billing: a.billing,
    quickBooksConnections: a.quickBooksConnections,
    quickBooksSnapshots: rows.quickBooksSnapshots,
    procedureImages: rows.procedureImages,
    activity: a.activity,
    modelUsage: a.modelUsage,
    firmActivity: rows.firmActivity,
  };
}

/** Newest saved first, then the higher id: the order the export has always written. */
function newestSavedFirst(
  a: AccountExportFile["businesses"][number],
  b: AccountExportFile["businesses"][number],
): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}

/**
 * Adds one more slice of a QuickBooks reading to the reading the parts
 * before it began. A slice that names another reading, or comes first,
 * means the parts no longer line up with the plan.
 */
function continueReading(
  readings: AccountExportFile["quickBooksSnapshots"],
  page: Extract<ExportPage, { rows: unknown }>,
): void {
  const reading = readings.at(-1);
  const [slice, ...more] = page.rows as AccountExportFile["quickBooksSnapshots"];
  if (
    page.section !== "quickBooksSnapshots" ||
    !reading ||
    !slice ||
    more.length > 0 ||
    slice.businessId !== reading.businessId ||
    slice.takenAt !== reading.takenAt ||
    !Array.isArray(reading.vendors) ||
    !Array.isArray(reading.employees) ||
    !Array.isArray(slice.vendors) ||
    !Array.isArray(slice.employees)
  ) {
    throw new ExportChangedError();
  }
  reading.vendors = [...(reading.vendors as unknown[]), ...(slice.vendors as unknown[])];
  reading.employees = [...(reading.employees as unknown[]), ...(slice.employees as unknown[])];
}

/**
 * The file as JSON text in pieces, one per row of each list, that join to
 * exactly `JSON.stringify(file, null, 2)`: the browser builds the download
 * from the pieces, so no single string has to hold the whole file.
 */
export function exportFileChunks(file: AccountExportFile): string[] {
  const chunks = ["{"];
  let written = 0;
  for (const [key, value] of Object.entries(file)) {
    const head = `${written ? "," : ""}\n  ${JSON.stringify(key)}: `;
    if (Array.isArray(value) && value.length > 0) {
      chunks.push(`${head}[`);
      value.forEach((item: unknown, i) => {
        const text = JSON.stringify(item, null, 2) ?? "null";
        chunks.push(`${i ? "," : ""}\n    ${text.replace(/\n/g, "\n    ")}`);
      });
      chunks.push("\n  ]");
    } else {
      const text = JSON.stringify(value, null, 2);
      if (text === undefined) continue;
      chunks.push(head + text.replace(/\n/g, "\n  "));
    }
    written += 1;
  }
  chunks.push(written ? "\n}" : "}");
  return chunks;
}

/** The file with each version's logo written back in place, as the single export held it. */
export function inlineReportLogos(file: AccountExportFile): AccountExport {
  const logos = new Map(file.reportLogos.map((l) => [l.id, l.dataUrl]));
  const { reportLogos, reportVersions, ...rest } = file;
  void reportLogos;
  return {
    ...rest,
    reportVersions: reportVersions.map(({ firm, ...v }) => ({
      ...v,
      firm: firm && {
        name: firm.name,
        letterhead: firm.letterhead,
        logoDataUrl: firm.logoId === null ? null : (logos.get(firm.logoId) ?? null),
      },
    })),
  };
}
